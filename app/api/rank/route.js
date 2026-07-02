// 지역 전체 단지의 1년 상승률(YoY) — 최근 3개월 vs 1년 전 같은 3개월의 ㎡당가 비교.
// 지오코딩 없이 원본 거래만 집계 → 빠름. 리스트 패널의 🔥 급등 배지·상승률 정렬용.
// 평형 구성이 달마다 달라도 ㎡당가로 정규화해 비교. 창별 거래가 적으면(yoyPct=null) 표시 제외.

import { fetchRawMonths, monthsBack, currentYmd } from "../../lib/trades";

const WINDOW = 3; // 비교 창(개월): 최근 3개월 vs 12개월 전 3개월
const MIN_COUNT = 2; // 창별 최소 거래 수 — 미만이면 상승률 신뢰 불가 → null

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lawdCd = searchParams.get("lawdCd");
  if (!lawdCd) {
    return Response.json({ error: "lawdCd(법정동5자리)가 필요합니다." }, { status: 400 });
  }

  const recentYmds = monthsBack(currentYmd(), WINDOW);
  const pastYmds = monthsBack(currentYmd(), 12 + WINDOW).slice(12); // 12~14개월 전

  let byYmd;
  try {
    ({ byYmd } = await fetchRawMonths(lawdCd, [...recentYmds, ...pastYmds]));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }

  // 단지별로 두 창의 ㎡당가(만원/㎡) 합/건수 집계.
  const agg = new Map();
  const collect = (ymds, sumKey, nKey) => {
    for (const ymd of ymds) {
      for (const t of byYmd.get(ymd) || []) {
        if (!t.area || !t.dealAmount) continue;
        const key = `${t.umdNm}|${t.aptNm}`;
        if (!agg.has(key)) {
          agg.set(key, { umdNm: t.umdNm, aptNm: t.aptNm, recentSum: 0, recentN: 0, pastSum: 0, pastN: 0 });
        }
        const a = agg.get(key);
        a[sumKey] += t.dealAmount / t.area;
        a[nKey] += 1;
      }
    }
  };
  collect(recentYmds, "recentSum", "recentN");
  collect(pastYmds, "pastSum", "pastN");

  const items = [...agg.values()].map((a) => {
    const ok = a.recentN >= MIN_COUNT && a.pastN >= MIN_COUNT;
    const recentPerM2 = a.recentN ? a.recentSum / a.recentN : null;
    const pastPerM2 = a.pastN ? a.pastSum / a.pastN : null;
    return {
      umdNm: a.umdNm,
      aptNm: a.aptNm,
      yoyPct: ok ? Math.round((recentPerM2 / pastPerM2 - 1) * 1000) / 10 : null,
      recentN: a.recentN,
      pastN: a.pastN,
    };
  });

  return Response.json({
    lawdCd,
    recentMonths: recentYmds,
    pastMonths: pastYmds,
    items,
  });
}
