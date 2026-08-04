-- 청약홈 분양정보 저장소 — /api/cron/news 가 매일 채우고 /api/subscription 이 읽는다.
-- house_manage_no 를 PK 로 써서 재수집 시 자연 중복 제거(upsert). news_items 와 같은 패턴.
-- RLS on + 정책 없음 → 서버(secret 키)만 접근.
create table if not exists public.subscription_items (
  house_manage_no text        primary key,          -- 청약홈 주택관리번호 (중복 제거 키)
  name            text        not null,             -- 단지명
  region          text,                             -- 시도명 (수도권 필터용)
  address         text,
  kind            text,                             -- 분양 구분 (APT / 무순위)
  receipt_start   date,
  receipt_end     date,
  winner_date     date,
  households      integer,
  url             text,
  fetched_at      timestamptz not null default now()
);
-- 조회는 "접수 마감이 오늘 이후"를 임박순으로 — 이 인덱스 하나면 충분하다.
create index if not exists subscription_items_receipt_idx
  on public.subscription_items (receipt_end);
alter table public.subscription_items enable row level security;
