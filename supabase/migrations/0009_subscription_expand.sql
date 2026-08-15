-- 청약 레이더 확장 (2026-08-15)
--  ① LH 공고(든든전세·행복주택·국민임대…) 합류 → agency/detail_kind
--  ② 분양가·평형(getAPTLttotPblancMdl) → models/price_min/price_max → 카드의 자금 판정 배지
--  ③ 특별공급 접수일 → spsply_start/end (특공이 일반보다 먼저 마감하는 공고가 대부분)
--
-- 기존 행은 그대로 두고 컬럼만 추가한다(청약홈 수집분은 다음 cron에서 agency가 채워진다).
-- ⚠️ PK(house_manage_no)는 그대로 쓴다. LH 공고는 번호 체계가 청약홈과 무관해 언젠가
--    반드시 충돌하므로, 수집 단계에서 'LH:<공고번호>' 접두사로 네임스페이스를 나눈다
--    (lib/lhNotice.js). 여기서 PK를 복합키로 바꾸면 기존 행 마이그레이션이 필요해진다.
alter table public.subscription_items
  add column if not exists agency       text,     -- '청약홈' | 'LH'
  add column if not exists detail_kind  text,     -- 민영/국민/행복주택/든든전세/국민임대…
  add column if not exists spsply_start date,     -- 특별공급 접수 시작
  add column if not exists spsply_end   date,     -- 특별공급 접수 마감
  add column if not exists models       jsonb,    -- [{houseTy, exclusiveAr, supplyAr, price, general, special}]
  add column if not exists price_min    integer,  -- 만원 (models 최저 분양가)
  add column if not exists price_max    integer,  -- 만원 (models 최고 분양가)
  add column if not exists lawd_cd      text;     -- 주소 역매칭 결과. 규제지역 LTV 판정용

-- 조회는 여전히 "접수 마감이 오늘 이후"를 임박순으로 — 0007의 인덱스를 그대로 쓴다.
