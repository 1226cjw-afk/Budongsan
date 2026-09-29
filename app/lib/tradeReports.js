// 🔥 핫플 — "새로 신고된 거래" 판별 (순수 함수, supabase 미의존).
// 기록 자체는 trades.fetchRawMonths(재수집 upsert 지점)가 하고, 판단은 전부 여기서 한다.
//
// ⚠️ "오늘/이번 주"를 **계약일**로 세지 말 것. 실거래 신고 기한이 계약 후 30일이라 최근 계약은
//    아직 데이터에 없다 — 2026-09-29 실측: ★ 지역 5곳의 9/22~28 계약 합계 10건(9월 초는 하루 13~24건).
//    그래서 재수집할 때 옛 payload와 새 payload를 비교해 **처음 나타난 날**을 신고일로 쓴다.
// ⚠️ supabase 미의존 + `./tradeStats.js` 확장자 import 유지 — raw node 단독 테스트 대상이다.

import { toPyeong, median } from "./tradeStats.js";

// 이전 수집이 이보다 오래됐으면 기록하지 않는다(기준선 보호).
// ⚠️ 방치된 지역(2026-09-29 기준 마포 8/19 이후 미갱신)을 처음 다시 받으면 몇 주치가 전부
//    "오늘 신고"로 몰려 핫플 1위를 먹는다. cron이 매일 돌면 모든 지역이 24h 안쪽이라 정상 누적된다.
export const RECORD_MAX_AGE_MS = 48 * 60 * 60 * 1000;

// 거래 식별키. ⚠️ 해제·거래유형 필드는 넣지 않는다 — 해제는 **같은 거래**에 나중에 붙는 표시라,
//    넣으면 해제 표시가 붙는 순간 "새 거래"로 오인된다.
export function tradeKey(t) {
  return [t.umdNm, t.aptNm, t.dealYmd, t.area, t.floor, t.dealAmount].join("|");
}

// 같은 키가 k건이면 #1..#k를 붙여 멀티셋을 집합으로 바꾼다.
// 같은 날 같은 층·같은 금액 거래가 실제로 있다(분양권 일괄 등) — 번호 없이 Set으로 비교하면
// 두 번째 건이 영영 "새 거래"로 안 잡힌다.
export function keyedTrades(trades) {
  const seen = new Map();
  return (trades || []).map((t) => {
    const base = tradeKey(t);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { key: `${base}#${n}`, t };
  });
}

export function diffNewTrades(oldTrades, newTrades) {
  const old = new Set(keyedTrades(oldTrades).map((x) => x.key));
  return keyedTrades(newTrades).filter((x) => !old.has(x.key));
}

// 이 달의 재수집 결과를 기록해도 되는가.
// ⚠️ 이전 캐시가 없으면(첫 수집) 기록하지 않는다 — 한 달치 수백 건이 "오늘 신고"로 쏟아진다.
export function shouldRecord(prev, nowMs = Date.now()) {
  if (!prev || !Array.isArray(prev.trades)) return false;
  const age = nowMs - Date.parse(prev.fetched_at);
  return Number.isFinite(age) && age <= RECORD_MAX_AGE_MS;
}

const isNormal = (p) => p.cdealType !== "O" && p.dealingGbn !== "직거래";

// 가격 비교 기준 — 같은 단지·같은 평형(공급 기준 평)·계약일이 더 이른 **정상 거래**의 중앙값.
// 평균이 아니라 중앙값인 이유는 추세 그래프와 같다(한 평형의 월 거래가 1~3건이라 특수거래 하나에 끌려간다).
// ⚠️ 기록 시점에 계산해 저장한다 — /api/hot이 요청마다 수십 개 지역 캐시를 읽지 않게.
export function refMedianFor(t, pool) {
  const py = toPyeong(t.area);
  const amounts = (pool || [])
    .filter(
      (p) =>
        p !== t &&
        p.umdNm === t.umdNm &&
        p.aptNm === t.aptNm &&
        toPyeong(p.area) === py &&
        p.dealYmd < t.dealYmd &&
        isNormal(p)
    )
    .map((p) => p.dealAmount);
  return {
    refMedian: amounts.length ? Math.round(median(amounts)) : null,
    refN: amounts.length,
  };
}

// fresh([{key, t}]) → trade_reports 행. 해제·직거래도 **원본 그대로** 남기고 읽을 때 거른다
// (trade_raw_cache와 같은 원칙 — 제외 기준이 바뀌어도 재기록이 필요 없다).
export function buildReportRows({ lawdCd, reportedOn, fresh, pool }) {
  return fresh.map(({ key, t }) => {
    const { refMedian, refN } = refMedianFor(t, pool);
    return {
      lawd_cd: lawdCd,
      trade_key: key,
      reported_on: reportedOn,
      deal_ymd: t.dealYmd,
      umd_nm: t.umdNm,
      apt_nm: t.aptNm,
      area: t.area,
      amount: t.dealAmount,
      floor: t.floor,
      dealing_gbn: t.dealingGbn || null,
      cdeal_type: t.cdealType || null,
      ref_median: refMedian,
      ref_n: refN,
    };
  });
}
