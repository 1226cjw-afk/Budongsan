-- 단지 부가정보(세대수/동수/사용승인일) 캐시 — 국토부 공동주택 API 결과.
-- 세대수는 정적 데이터라 영구 캐시(매칭 성공분만 저장 — 미스는 신축 등록 대비 캐시 안 함).
-- RLS on + 정책 없음 → 서버(secret 키)만 접근 (기존 캐시 테이블과 동일 패턴).
create table if not exists public.kapt_cache (
  lawd_cd     text        not null,
  umd_nm      text        not null,
  apt_nm      text        not null,
  kapt_code   text        not null,
  households  integer,
  dong_cnt    integer,
  use_date    text,
  heat        text,
  fetched_at  timestamptz not null default now(),
  primary key (lawd_cd, umd_nm, apt_nm)
);
alter table public.kapt_cache enable row level security;
