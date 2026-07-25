// 주택 매수 부대비용 — 취득세·지방교육세·농어촌특별세·중개보수·등기비.
//
// ⚠️ 공식 API가 없어 법정 요율을 하드코딩한다. 변경 시 이 파일만 갱신.
// 모든 금액 단위는 **만원** (loanPolicy.js·국토부 dealAmount와 동일). 면적은 전용 ㎡.
//
// ── 출처 / 시행일 ─────────────────────────────────────────────
// [취득세]     지방세법 §11①8 (주택 유상거래) — 6억↓ 1% / 6~9억 선형 / 9억↑ 3%
// [중과]       지방세법 §13조의2 — 조정대상지역 2주택 8%, 3주택↑ 12% / 비조정 3주택 8%
// [지방교육세] 지방세법 §151①1나 — 주택 유상거래는 취득세율 × 10%. 중과 시 0.4% 고정
// [농특세]     농어촌특별세법 §5 — 전용 85㎡ **초과**분 0.2% (85㎡ 이하 비과세)
// [생애최초]   지방세특례제한법 §36조의3 — 12억 이하 주택, 취득세 200만원 한도 감면
//              (2022-06-21 이후 취득분, 소득·주택가격 요건 폐지)
// [중개보수]   공인중개사법 시행규칙 별표1 (2021-10-19 시행), 주택 매매·교환
// 확인일: 2026-07-25
// ──────────────────────────────────────────────────────────────

// ⚠️ 아래 두 상수만 법령이 아닌 **경험치 근사**다.
// 등기비 = 법무사 보수 + 국민주택채권 매입 후 할인손실 + 증지. 채권 할인손실이
// 시가표준액·채권 시세에 따라 변동해 정확한 계산이 불가능하다. 실제 견적을 겪으면
// 이 두 숫자만 갈아끼우면 된다. 9억 기준 약 175만원.
const REGISTRY_RATE = 0.0015;
const REGISTRY_FIXED = 40;

const VAT = 0.1; // 중개보수 부가세 (일반과세자 기준)
const RURAL_TAX_AREA = 85; // 농특세 과세 기준 전용면적(㎡) — 초과분만 과세
const FIRST_TIME_CAP_PRICE = 120000; // 생애최초 감면 대상 주택가액 상한 12억
const FIRST_TIME_RELIEF = 200; // 생애최초 취득세 감면 한도 200만원

// 취득세율. 반환은 소수(0.01 = 1%).
// 6억 초과 9억 이하 구간은 (취득가액[억] × 2 / 3 − 3)% 선형 — 소수점 5째 자리 반올림.
function acquisitionTaxRate(price, householdType, regulated) {
  // 중과: 본 앱의 householdType은 무주택|1주택|다주택 3단계뿐이라
  // `다주택` = 2주택 취득으로 간주한다. 사용자가 무주택/최대 1주택 범위라
  // 3주택 이상(12%) 경로는 실제로 밟히지 않는다 (2026-07-25 결정).
  if (householdType === "다주택" && regulated) return 0.08;

  if (price <= 60000) return 0.01;
  if (price > 90000) return 0.03;
  const eok = price / 10000;
  return Math.round(((eok * 2) / 3 - 3) * 10000) / 10000 / 100;
}

// 중개보수 상한요율 + 한도액(만원). 실제는 협의로 정하나 상한을 가정한다 —
// 보수적(비싸게) 추정이 "살 수 있다더니 못 사는" 실패보다 낫다.
function brokerRate(price) {
  if (price < 5000) return { rate: 0.006, cap: 25 };
  if (price < 20000) return { rate: 0.005, cap: 80 };
  if (price < 90000) return { rate: 0.004, cap: Infinity };
  if (price < 120000) return { rate: 0.005, cap: Infinity };
  if (price < 150000) return { rate: 0.006, cap: Infinity };
  return { rate: 0.007, cap: Infinity };
}

export function calcAcquisitionCost({
  price,
  area = 0,
  householdType = "무주택",
  isFirstTime = false,
  regulated = false,
}) {
  if (!price || price <= 0) {
    return {
      acquisitionTax: 0, localEduTax: 0, ruralTax: 0,
      brokerFee: 0, registryEtc: 0, total: 0, taxRate: 0,
    };
  }

  const taxRate = acquisitionTaxRate(price, householdType, regulated);
  const heavy = taxRate >= 0.08; // 중과 여부 — 지방교육세·농특세 규칙이 달라진다

  let acquisitionTax = price * taxRate;
  if (isFirstTime && price <= FIRST_TIME_CAP_PRICE) {
    acquisitionTax = Math.max(0, acquisitionTax - FIRST_TIME_RELIEF);
  }

  // 지방교육세: 일반은 취득세율의 1/10, 중과 시 0.4% 고정.
  // 감면(생애최초)과 무관하게 표준세율 기준으로 계산한다.
  const localEduTax = heavy ? price * 0.004 : price * taxRate * 0.1;

  // 농특세: 전용 85㎡ 초과에만. 중과 시 0.6%(8%) / 1.0%(12%).
  const ruralTax = area > RURAL_TAX_AREA ? price * (heavy ? 0.006 : 0.002) : 0;

  const { rate, cap } = brokerRate(price);
  const brokerFee = Math.min(price * rate, cap) * (1 + VAT);

  const registryEtc = price * REGISTRY_RATE + REGISTRY_FIXED;

  const r = {
    acquisitionTax: Math.round(acquisitionTax),
    localEduTax: Math.round(localEduTax),
    ruralTax: Math.round(ruralTax),
    brokerFee: Math.round(brokerFee),
    registryEtc: Math.round(registryEtc),
    taxRate,
  };
  r.total = r.acquisitionTax + r.localEduTax + r.ruralTax + r.brokerFee + r.registryEtc;
  return r;
}
