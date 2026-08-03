// 실거래 배열 집계·필터 헬퍼 (클라이언트 공용).
// ⚠️ 서버 전용 trades.js(수집·캐시, supabase 의존)와 분리 유지 — 클라 번들에 들어가는 파일.

export const PYEONG = 3.3058; // 1평 = 3.3058㎡

// 전용 → 공급면적 근사 배율. 실거래가 API는 **전용면적만** 주는데, 사람들이 말하는 "34평"은
// 공급면적(전용 + 주거공용) 기준이라 전용을 그대로 나누면 84㎡가 25평으로 나와 어긋난다.
// 계단식 아파트 전용률이 대략 75%(= 공급의 3/4)라 1.33을 쓰면 국평이 맞는다:
//   전용 84.96㎡ × 1.33 = 113.0㎡ = 34.2평 → 34평 ✔ (실제 공급 111.98㎡ = 33.9평)
// ⚠️ 단지별 실제 전용률은 71~78%로 흩어져 ±1평 오차가 난다. 정확한 값이 필요하면
//    국토부 공동주택 API의 단지별 공급면적을 받아야 하는데, 누락 단지가 많아 근사로 간다.
export const SUPPLY_RATIO = 1.33;

// 전용면적(㎡) → 공급 기준 평형(정수). 화면에 보이는 "N평"은 전부 이 함수를 거친다.
export function toPyeong(exclusiveM2) {
  return Math.round((exclusiveM2 * SUPPLY_RATIO) / PYEONG);
}

// 시세 왜곡 거래 제외. 실거래가 원본에는 두 종류의 "시세가 아닌 거래"가 섞여 있다:
//  · 해제거래(cdealType="O") — 계약이 취소돼 성사되지 않은 거래. 애초에 시세가 아니다.
//  · 직거래(dealingGbn="직거래") — 가족간 증여성 거래가 많아 시세에서 크게 벗어난다.
// (2026-07-29 안양 동안구 202605 실측: 697건 중 해제 10건 / 직거래 21건, 직거래는 같은 평형
//  중개거래 평균 대비 −41%~+24%로 튀어 월 평균가를 눈에 띄게 흔들었다.)
// 반환 {trades, cancelled, direct, removed} — 제외 건수는 "N건 제외" 표기에,
// removed(제외된 거래 + 사유)는 시장 신호 지표에 쓴다(2026-08-03).
// ⚠️ trades 반환은 예전 그대로다. 시세 경로 4개(/trades·/trend·/rank·/briefing)가
//    이 값만 쓰므로, 신호를 얹어도 시세 정확도의 단일 지점은 깨지지 않는다.
// ⚠️ 필드가 없는 옛 캐시 행은 그대로 통과시킨다(trades.js가 stale로 보고 재수집한다).
export function excludeAbnormal(trades) {
  let cancelled = 0;
  let direct = 0;
  const kept = [];
  const removed = [];
  for (const t of trades || []) {
    if (t.cdealType === "O") {
      cancelled += 1;
      removed.push({ ...t, reason: "cancelled" });
      continue;
    }
    if (t.dealingGbn === "직거래") {
      direct += 1;
      removed.push({ ...t, reason: "direct" });
      continue;
    }
    kept.push(t);
  }
  return { trades: kept, cancelled, direct, removed };
}

// 중앙값. 표본이 적은 달에 이상치 하나가 평균을 끌어올리는 것을 막는다(추세 그래프용).
export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const favKey = (lawdCd, umdNm, aptNm) => `${lawdCd}|${umdNm}|${aptNm}`;

// 두 좌표 간 거리(m) — 하버사인.
export function distMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 거래 묶음 → { count, avg, recentAmount, recentDate } (빈 배열이면 null).
export function summarize(trades) {
  if (!trades.length) return null;
  const sum = trades.reduce((s, t) => s + t.dealAmount, 0);
  const recent = trades.reduce((a, b) => (a.dealYmd >= b.dealYmd ? a : b));
  return {
    count: trades.length,
    avg: sum / trades.length,
    recentAmount: recent.dealAmount,
    recentDate: recent.dealYmd,
  };
}

// 전용면적(㎡ 반올림) 단위로 묶어 평형별 요약. 면적 오름차순.
export function groupByPyeong(trades) {
  const m = new Map();
  for (const t of trades) {
    const key = Math.round(t.area);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(t);
  }
  return [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([m2, arr]) => {
      const s = summarize(arr);
      return {
        m2,
        pyeong: toPyeong(m2),
        count: s.count,
        avg: s.avg,
        recentAmount: s.recentAmount,
        recentDate: s.recentDate,
      };
    });
}

// 면적·가격 필터 밴드({min,max}) 적용 — 지도 마커와 리스트 패널이 같은 조건을 공유.
export function filterTrades(trades, areaBand, priceBand) {
  return (trades || []).filter(
    (t) =>
      t.dealAmount >= priceBand.min &&
      t.dealAmount < priceBand.max &&
      t.area >= areaBand.min &&
      t.area < areaBand.max
  );
}
