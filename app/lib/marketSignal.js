// 시장 신호 집계 — 참조 사이트(koreamonitor /estate)의 "시장 신호" 패널을 우리 데이터로.
// ⚠️ 서버 전용 trades.js와 분리 유지 — 클라 번들에 들어가는 순수 모듈(supabase 미의존).
//
// 지표의 원천은 **시세에서 걸러낸 거래**다. excludeAbnormal이 해제·직거래를 시세에서
// 빼는데(2026-07-29), 그 "걸러낸 것" 자체가 시장 신호다 — 해제 급증은 호가가 무너지는
// 신호이고, 직거래 비중은 증여성 거래가 얼마나 섞였는지를 말해준다.

const WINDOW_DAYS = 30;

// 실거래의 dealYmd는 **KST 달력 날짜**다. toISOString()은 UTC 날짜를 주므로 그대로 쓰면
// KST 00:00~08:59(= UTC 전날 15:00~23:59) 사이에 호출될 때 하루가 밀린다.
// ⚠️ Vercel 함수는 UTC로 돌고 이 앱의 cron은 06:00·06:30 KST라 매일 이 구간에 걸린다
//    (2026-08-03 리뷰가 잡음). 오프셋을 더해 KST 벽시계 날짜로 자른다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ymd = (d) => new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

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
  // 표본에 값이 하나도 없으면 available:false로 내려 UI가 타일을 숨기게 한다.
  // ⚠️ "키 존재"가 아니라 "값 존재"로 판정할 것 — trades.js의 parseTrades는 태그가
  //    없어도 pick()이 ""를 채워 buyerGbn 키를 항상 만든다. `"buyerGbn" in t`로
  //    판정하면 국토부가 그 태그를 영영 안 줘도(현재 발생 중) 모든 행이 ""를 갖는 순간
  //    키는 다 있는데 값은 다 비어 net=0으로 계산돼 "법인 순매수 0건"이라는, 막으려던
  //    바로 그 거짓말을 다시 보여준다(2026-08-03 리뷰가 잡음). truthy 체크면 옛 캐시행
  //    (undefined)과 빈 태그("") 둘 다 자연히 available:false로 떨어진다.
  const hasGbn = [...now, ...prev].some((t) => t.buyerGbn);
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
