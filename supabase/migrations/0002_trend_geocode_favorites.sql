-- 2단계 확장: 추세/지오코딩 캐시 + 즐겨찾기.
-- 모두 RLS on + 정책 없음 → 서버(secret 키)만 접근.

-- 원본 거래 캐시 (지오코딩 X). 지도 3개월 병합 + 추세 12개월에서 공용.
-- 기존 trade_cache(지오코딩된 월별 payload)는 더 이상 사용 안 함(남겨둬도 무해).
create table if not exists public.trade_raw_cache (
  lawd_cd     text        not null,
  deal_ymd    text        not null,
  trades      jsonb       not null,
  fetched_at  timestamptz not null default now(),
  primary key (lawd_cd, deal_ymd)
);
alter table public.trade_raw_cache enable row level security;

-- 단지 좌표 캐시 (lawd_cd + 법정동 + 단지명). 지역 이동 시 재지오코딩 방지.
create table if not exists public.geocode_cache (
  lawd_cd     text        not null,
  umd_nm      text        not null,
  apt_nm      text        not null,
  lat         double precision,
  lng         double precision,
  fetched_at  timestamptz not null default now(),
  primary key (lawd_cd, umd_nm, apt_nm)
);
alter table public.geocode_cache enable row level security;

-- 즐겨찾기 (로그인 없는 개인용 → 단일 공용 목록).
create table if not exists public.favorites (
  id          uuid        primary key default gen_random_uuid(),
  lawd_cd     text        not null,
  umd_nm      text        not null,
  apt_nm      text        not null,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now(),
  unique (lawd_cd, umd_nm, apt_nm)
);
alter table public.favorites enable row level security;
