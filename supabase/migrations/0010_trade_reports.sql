-- 🔥 핫플 — 재수집 때 새로 나타난 거래(= 새로 신고된 거래) 기록.
-- 기록: lib/trades.js fetchRawMonths(재수집 upsert 지점) / 읽기: /api/hot / 프루닝: /api/cron/refresh(30일).
-- reported_on = 처음 본 KST 달력 날짜(format.kstDate). 계약일(deal_ymd)과 다르다 — 신고 기한이
-- 계약 후 30일이라 계약일 기준 "이번 주"는 구조적으로 비어 있다(2026-09-29 실측).
-- 해제·직거래도 원본 그대로 저장하고 읽을 때 거른다(trade_raw_cache와 같은 원칙).
-- ref_median/ref_n = 같은 단지·같은 평형·더 이른 정상 거래 중앙값(기록 시점 계산, lib/tradeReports.js).
-- RLS on + 정책 없음 → 서버(secret 키)만 접근. 기존 캐시 테이블과 같은 패턴.
create table if not exists public.trade_reports (
  lawd_cd     text     not null,
  trade_key   text     not null,
  reported_on date     not null,
  deal_ymd    date     not null,
  umd_nm      text,
  apt_nm      text,
  area        numeric,
  amount      integer,
  floor       integer,
  dealing_gbn text,
  cdeal_type  text,
  ref_median  integer,
  ref_n       smallint,
  primary key (lawd_cd, trade_key)
);
create index if not exists trade_reports_reported_on_idx on public.trade_reports (reported_on);
alter table public.trade_reports enable row level security;
