-- 즐겨찾기 D-day 필드: 임대차 만기(갱신청구 가능기간 계산) + 자유 이벤트 메모(재건축 결정일 등).
-- API는 컬럼 부재 시 구버전 select로 폴백(graceful) — 이 마이그레이션 실행 후 저장 가능.
alter table public.favorites add column if not exists lease_end date;  -- 임대차 만기일
alter table public.favorites add column if not exists note text;       -- 이벤트 메모
alter table public.favorites add column if not exists note_date date;  -- 이벤트 날짜(D-day)
