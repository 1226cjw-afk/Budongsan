// 시장 신호 집계 — 참조 사이트(koreamonitor /estate)의 "시장 신호" 패널을 우리 데이터로.
// ⚠️ 서버 전용 trades.js와 분리 유지 — 클라 번들에 들어가는 순수 모듈(supabase 미의존).
//
// 지표의 원천은 **시세에서 걸러낸 거래**다. excludeAbnormal이 해제·직거래를 시세에서
// 빼는데(2026-07-29), 그 "걸러낸 것" 자체가 시장 신호다 — 해제 급증은 호가가 무너지는
// 신호이고, 직거래 비중은 증여성 거래가 얼마나 섞였는지를 말해준다.

const WINDOW_DAYS = 30;

const ymd = (d) => d.toISOString().slice(0, 10);

// [start, end) 안의 거래만. dealYmd는 "YYYY-MM-DD" 문자열이라 사전순 비교가 곧 날짜순이다.
const inRange = (arr, start, end) =>
  arr.filter((t) => t.dealYmd && t.dealYmd >= start && t.dealYmd < end);

export function buildSignal({ trades = [], removed = [], asOf = new Date() } = {}) {
  const end = ymd(asOf);
  const mid = ymd(new Date(asOf.getTime() - WINDOW_DAYS * 86400000));
  const start = ymd(new Date(asOf.getTime() - 2 * WINDOW_DAYS * 86400000));

  const now = inRange(trades, mid, end);
  const prev = inRange(trades, start, mid);

  const cancelledAll = removed.filter((t) => t.reason === "cancelled");
  const directAll = removed.filter((t) => t.reason === "direct");
  const cNow = inRange(cancelledAll, mid, end);
  const cPrev = inRange(cancelledAll, start, mid);
  const dNow = inRange(directAll, mid, end);
  const dPrev = inRange(directAll, start, mid);

  // 직거래 비중의 분모는 정상 + 직거래. 해제는 계약이 성사되지 않았으니 분모에서도 뺀다.
  const total = now.length + dNow.length;
  const prevTotal = prev.length + dPrev.length;

  // 옛 캐시 행엔 buyerGbn이 없다. 이때 0을 표시하면 "법인 거래가 없다"는 거짓말이 되므로
  // 표본에 필드가 하나도 없으면 available:false로 내려 UI가 타일을 숨기게 한다.
  const hasGbn = [...now, ...prev].some((t) => "buyerGbn" in t);
  const countBuy = (a) => a.filter((t) => t.buyerGbn === "법인").length;
  const countSell = (a) => a.filter((t) => t.slerGbn === "법인").length;

  return {
    days: WINDOW_DAYS,
    volume: {
      count: now.length,
      prevCount: prev.length,
      delta: now.length - prev.length,
    },
    cancelled: {
      count: cNow.length,
      prevCount: cPrev.length,
      delta: cNow.length - cPrev.length,
      // 해제일(cdealDay, "YY.MM.DD")이 있으면 가장 최근 것 — "언제 취소됐나" 캡션용.
      latestDay: cNow.map((t) => t.cdealDay).filter(Boolean).sort().pop() || null,
    },
    direct: {
      count: dNow.length,
      total,
      ratio: total ? dNow.length / total : 0,
      prevRatio: prevTotal ? dPrev.length / prevTotal : 0,
    },
    corporate: {
      buy: countBuy(now),
      sell: countSell(now),
      net: countBuy(now) - countSell(now),
      prevNet: countBuy(prev) - countSell(prev),
      available: hasGbn,
    },
  };
}
