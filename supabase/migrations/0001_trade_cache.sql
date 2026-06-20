-- 실거래가 + 지오코딩 결과 캐시 테이블.
-- (lawd_cd, deal_ymd) 단위로 /api/trades 응답 전체(payload)를 저장해
-- 단지 순차 지오코딩(~9초)을 재요청 시 건너뛴다.
--
-- 접근은 전적으로 서버(/api/trades)가 SUPABASE_SECRET_KEY로만 수행한다.
-- RLS를 켜고 어떤 정책도 만들지 않으면 publishable/anon 키로는 접근 불가 → 캐시 보호.

create table if not exists public.trade_cache (
  lawd_cd     text        not null,           -- 법정동 시군구 5자리
  deal_ymd    text        not null,           -- 거래연월 YYYYMM
  payload     jsonb       not null,           -- /api/trades 응답 전체
  fetched_at  timestamptz not null default now(),
  primary key (lawd_cd, deal_ymd)
);

alter table public.trade_cache enable row level security;
-- 정책 없음: service/secret 키만 접근 (RLS 우회), 공개 키는 차단.
