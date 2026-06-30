// 주택담보대출 LTV/DSR 정책 규칙 + 대출 가능액 계산.
//
// ⚠️ 정책은 공식 API가 없어 규칙을 코드로 하드코딩한다. 변경 시 이 파일만 갱신.
// 모든 금액 단위는 **만원** (실거래가 dealAmount와 동일하게 맞춤).
//
// ── 출처 / 시행일 ─────────────────────────────────────────────
// [10.15 대책] "주택시장 안정화를 위한 대출수요 관리 방안" (2025-10-15 발표, LTV 2025-10-16 시행)
//   - 정책브리핑 korea.kr/news/policyNewsView.do?newsId=148950959
//   - 규제지역 LTV 70% → 40%, 주택가격별 한도 상한 신설, 스트레스 금리 하한 1.5%→3%
// [스트레스 DSR 3단계] 2025-07 전국 적용. 수도권·규제지역 주담대 스트레스금리 3.0%,
//   지방 0.75%(2026-06-30까지 한시). 은행권 DSR 한도 40%.
// 확인일: 2026-06-21
// ──────────────────────────────────────────────────────────────

// 규제지역(조정대상지역 + 투기과열지구) — 10.15 대책 지정.
// 서울 전역(LAWD_CD 11로 시작) + 경기 12개 시·군·구(아래 5자리 시군구 코드).
const REGULATED_GYEONGGI = new Set([
  "41290", // 과천시
  "41210", // 광명시
  "41135", // 성남시 분당구
  "41131", // 성남시 수정구
  "41133", // 성남시 중원구
  "41117", // 수원시 영통구
  "41111", // 수원시 장안구
  "41115", // 수원시 팔달구
  "41173", // 안양시 동안구
  "41465", // 용인시 수지구
  "41430", // 의왕시
  "41450", // 하남시
]);

// LAWD_CD(시군구 5자리) → 규제 여부.
export function isRegulated(lawdCd) {
  if (!lawdCd) return false;
  if (lawdCd.startsWith("11")) return true; // 서울 전역
  return REGULATED_GYEONGGI.has(lawdCd);
}

// DSR 한도 (은행권). 차주별 연 원리금상환액 / 연소득 ≤ 40%.
export const DSR_LIMIT = 0.4;

// 스트레스 금리(가산) — DSR 심사 시 실제 금리에 더한다.
export function stressRate(regulated) {
  return regulated ? 0.03 : 0.0075; // 수도권·규제 3.0% / 지방 0.75%(2026-06-30 한시)
}

// 가구 유형별 규제지역 LTV. 비규제는 일반 70% 가정.
// householdType: "무주택" | "1주택" | "다주택"
function ltvRate(regulated, householdType, isFirstTime) {
  if (regulated) {
    if (isFirstTime) return 0.7; // 생애최초 수도권 LTV 70% (단 수도권 한도 6억 별도 적용)
    if (householdType === "다주택") return 0; // 규제지역 다주택 주담대 금지
    return 0.4; // 무주택 / 처분조건부 1주택
  }
  // 비규제지역
  if (householdType === "다주택") return 0.6;
  return 0.7;
}

// 수도권·규제지역 주택가격별 대출한도 상한(만원). 10.15 대책.
function priceCap(price) {
  if (price <= 150000) return 60000; // 15억 이하 → 6억
  if (price <= 250000) return 40000; // 15~25억 → 4억
  return 20000; // 25억 초과 → 2억
}

// 생애최초 수도권 한도(만원) — 6억.
const FIRST_TIME_CAP = 60000;

// 원리금균등상환 1만원당 연 상환액(만원) = 월상환액 × 12.
function annualPaymentPerUnit(annualRate, termYears) {
  const r = annualRate / 12;
  const n = termYears * 12;
  if (r === 0) return 12 / n; // 무이자 예외
  const monthly = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return monthly * 12;
}

// 대출 가능액 계산.
// 입력(만원/연/소수율): price 매물가, annualIncome 연소득, existingAnnualDebt 기존 연 원리금상환액,
//   rate 실제 대출금리(예 0.04), termYears 만기.
// 반환: ltvLimit/dsrLimit 각 한도, maxLoan 최종(둘 중 작은 값), binding 제약요인, requiredCash 필요 자기자금.
export function calcMaxLoan({
  price,
  lawdCd,
  householdType = "무주택",
  isFirstTime = false,
  annualIncome,
  existingAnnualDebt = 0,
  rate = 0.04,
  termYears = 40,
}) {
  const regulated = isRegulated(lawdCd);

  // 1) LTV 기준 한도 = min(가격×LTV, 가격상한, [생애최초 수도권 6억])
  const rawLtv = price * ltvRate(regulated, householdType, isFirstTime);
  let ltvLimit = Math.min(rawLtv, priceCap(price));
  if (isFirstTime) ltvLimit = Math.min(ltvLimit, FIRST_TIME_CAP);

  // 2) DSR 기준 한도: (연소득×40% − 기존상환액) / 스트레스 적용 단위상환액
  const sRate = rate + stressRate(regulated);
  const perUnit = annualPaymentPerUnit(sRate, termYears);
  const dsrBudget = annualIncome * DSR_LIMIT - existingAnnualDebt;
  const dsrLimit = Math.max(0, dsrBudget / perUnit);

  // 3) 최종 = 둘 중 작은 값
  const maxLoan = Math.max(0, Math.min(ltvLimit, dsrLimit));
  const binding = ltvLimit <= dsrLimit ? "LTV" : "DSR";

  return {
    regulated,
    ltvLimit: Math.round(ltvLimit),
    dsrLimit: Math.round(dsrLimit),
    maxLoan: Math.round(maxLoan),
    binding,
    requiredCash: Math.max(0, Math.round(price - maxLoan)),
    affordable: maxLoan >= price, // (자기자금 0 가정 시) 대출만으로 가능 여부 — 보통 false
  };
}
