-- 데일리 부동산 뉴스 수집 저장소 — /api/cron/news 가 매일 채우고 /api/news 가 읽는다.
-- link 를 PK 로 써서 재수집 시 자연 중복 제거(upsert). 30일 지난 기사는 cron 이 프루닝.
-- RLS on + 정책 없음 → 서버(secret 키)만 접근 (기존 캐시 테이블과 동일 패턴).
create table if not exists public.news_items (
  link         text        primary key,          -- 기사 URL (중복 제거 키)
  title        text        not null,
  source       text,                             -- 언론사명 (RSS/원본링크 도메인)
  description  text,                             -- 요약 (네이버 API만 제공, RSS는 빈 값)
  keyword      text        not null,             -- 수집에 쓴 검색 키워드 (UI 칩 필터)
  published_at timestamptz,                      -- 기사 발행 시각
  fetched_at   timestamptz not null default now()
);
create index if not exists news_items_published_idx
  on public.news_items (published_at desc);
alter table public.news_items enable row level security;
