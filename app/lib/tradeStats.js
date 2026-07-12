// 실거래 배열 집계·필터 헬퍼 (클라이언트 공용).
// ⚠️ 서버 전용 trades.js(수집·캐시, supabase 의존)와 분리 유지 — 클라 번들에 들어가는 파일.

export const PYEONG = 3.3058; // ㎡ → 평 환산

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
        pyeong: Math.round(m2 / PYEONG),
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
