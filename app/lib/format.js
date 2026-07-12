// 표시용 포맷터·날짜 헬퍼 (클라이언트 공용, 의존성 없음).

// D-day 계산(양수 = 남음). ymd "YYYY-MM-DD".
export function daysUntil(ymd) {
  return Math.ceil((new Date(ymd + "T00:00:00") - Date.now()) / 86400000);
}

// 임대차 만기 라벨. 갱신청구 가능기간 = 만기 6~2개월 전(주택임대차보호법 §6의3, 2020-07-31 시행,
// 6개월~2개월 구간은 2020-12-10 이후 계약 기준. 확인일 2026-07-05).
export function leaseLabel(leaseEnd) {
  const dd = daysUntil(leaseEnd);
  const end = new Date(leaseEnd + "T00:00:00");
  const winA = new Date(end); winA.setMonth(winA.getMonth() - 6);
  const winB = new Date(end); winB.setMonth(winB.getMonth() - 2);
  const now = new Date();
  let s = dd >= 0 ? `만기 D-${dd}` : `만기 ${-dd}일 지남`;
  if (now >= winA && now <= winB) s += " · ⚠️ 갱신청구 가능기간";
  return s;
}

// 만원 → "N억 M,MMM" 표기.
export function formatManwon(manwon) {
  const v = Math.round(manwon);
  const eok = Math.floor(v / 10000);
  const rest = v % 10000;
  if (eok && rest) return `${eok}억 ${rest.toLocaleString()}`;
  if (eok) return `${eok}억`;
  return rest.toLocaleString();
}

// "YYYY-MM-DD" → "YY.MM.DD".
export function shortDate(ymd) {
  return ymd ? ymd.slice(2).replace(/-/g, ".") : "";
}

// 갱신 시각(ISO) → "방금 / N분 전 / N시간 전 / N일 전".
export function formatAgo(iso) {
  if (!iso) return null;
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "방금";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}
