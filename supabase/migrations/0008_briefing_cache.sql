-- 📋 브리핑 응답 페이로드 캐시 — /api/briefing 이 읽고 쓰고, /api/cron/refresh 가 데운다.
-- 재계산 여부는 fingerprint(= favorites + max(fetched_at) + KST 날짜)로만 판정한다.
-- 지문이 입력 전체를 덮으므로 별도 무효화 로직이 없다(★ 변경 = 지문 변경 = 즉시 반영).
--
-- favorites 가 전역 하나뿐인 개인용 앱이라 **단일 행**으로 충분하다(지문 불일치 시 덮어씀).
-- 그래서 프루닝도 불필요 — news_items/subscription_items 와 달리 행이 늘지 않는다.
-- RLS on + 정책 없음 → 서버(secret 키)만 접근. 기존 캐시 테이블과 같은 패턴.
create table if not exists public.briefing_cache (
  id          smallint    primary key default 1,
  fingerprint text        not null,
  payload     jsonb       not null,
  computed_at timestamptz not null default now(),
  constraint briefing_cache_single_row check (id = 1)
);
alter table public.briefing_cache enable row level security;
