// 지도 화면의 필터 밴드·배지 임계값·정렬 옵션 (순수 상수, 의존성 0).
// ⚠️ KakaoMap.js에서 분리한 이유: 마커·리스트·컨트롤 패널이 **같은 밴드 객체**를 봐야
//    "필터는 24~34평인데 마커만 전체 면적" 같은 불일치가 구조적으로 불가능해진다.
//    컴포넌트에 두면 분리할 때마다 상수가 복제되며 갈라진다.

// 면적 필터. 라벨은 **공급 기준 평형**이 앞(사람이 쓰는 단위) — 경계값은 전용㎡ 그대로다.
// (60㎡→24평 / 85㎡→34평 / 135㎡→54평, tradeStats.toPyeong 기준)
export const AREA_FILTERS = [
  { value: "all", label: "전체 면적", min: 0, max: Infinity },
  { value: "s", label: "~24평 (전용 60㎡)", min: 0, max: 60 },
  { value: "m", label: "24~34평 (전용 60~85㎡)", min: 60, max: 85 },
  { value: "l", label: "34~54평 (전용 85~135㎡)", min: 85, max: 135 },
  { value: "xl", label: "54평~ (전용 135㎡~)", min: 135, max: Infinity },
];

export const PRICE_FILTERS = [
  { value: "all", label: "전체 가격", min: 0, max: Infinity },
  { value: "p1", label: "~3억", min: 0, max: 30000 },
  { value: "p2", label: "3~6억", min: 30000, max: 60000 },
  { value: "p3", label: "6~9억", min: 60000, max: 90000 },
  { value: "p4", label: "9~12억", min: 90000, max: 120000 },
];

// 월 상환액 상한 필터(만원/월). 자금 프로필(연소득)이 있어야 계산되므로 그때만 노출한다.
// 사람이 감당 여부를 판단하는 실제 단위가 "월 얼마"라 가격 구간보다 직관적이다.
export const MONTHLY_FILTERS = [
  { value: "all", label: "월상환 무관", max: Infinity },
  { value: "m100", label: "월 100만 이하", max: 100 },
  { value: "m150", label: "월 150만 이하", max: 150 },
  { value: "m200", label: "월 200만 이하", max: 200 },
  { value: "m300", label: "월 300만 이하", max: 300 },
];

// value → 밴드 객체. 못 찾으면 첫 항목("전체")으로 폴백한다 —
// 저장된 옛 필터값이 목록에서 사라져도 화면이 비지 않게.
export function bandFor(filters, value) {
  return filters.find((f) => f.value === value) ?? filters[0];
}

// 리스트 패널: 배지 임계값.
export const HOT_PCT = 15; // 1년 상승률 이 값 이상이면 🔥 급등 배지(핀에도 표시)
export const EXCESS_HOT_PCT = 10; // 지역 중앙값 대비 초과상승 이 값(%p) 이상이면 선반영 경고 톤
export const REBUILD_AGE = 30; // 준공 후 이 연수 이상이면 🏗 재건축 연한 배지 (실제 추진현황 API는 없음 → 연한 기준)

export const SORT_OPTIONS = [
  { v: "yoy", label: "🔥 1년 상승률순" },
  { v: "count", label: "거래 많은순" },
  { v: "priceAsc", label: "가격 낮은순" },
  { v: "priceDesc", label: "가격 높은순" },
  { v: "old", label: "🏗 준공 오래된순" },
];
export const SORT_GAP = { v: "gap", label: "✓ 자금 여유순" }; // 내 자금 설정 시에만 노출
