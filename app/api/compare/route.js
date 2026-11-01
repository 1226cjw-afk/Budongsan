// ⚖️ 단지 비교 — 담은 단지(최대 4곳)의 최근 15개월 집계 + 세대수. 집계 로직은 lib/compare.js(순수).
// POST { items: [{lawdCd, umdNm, aptNm}] } → { months, entries: [{lawdCd, umdNm, aptNm, summary, info, error?}] }
//
// ⚠️ 지역별로 fetchRawMonths를 **한 번만** 부른다 — 평촌 4곳처럼 같은 시군구 단지를 담는 게 보통이라
//    단지마다 부르면 같은 캐시 조회가 4번 돈다.
// ⚠️ 엣지 캐시 없음(POST + 사용자가 고른 조합이라 공유 이득이 없다). 원천은 trade_raw_cache라 미스여도
//    국토부를 부르는 건 캐시에 없는 달뿐이다(/api/trend 36개월 워밍이 대부분 덮는다).
// ⚠️ 12억 이상 거래는 수집 단계에서 버려진다(trades.js MAX_AMOUNT) — 고가 단지는 거래 0으로 나온다.

import { fetchRawMonths, monthsBack, currentYmd } from "../../lib/trades";
import { getComplexInfoMany } from "../../lib/kapt";
import { COMPARE_MONTHS, sanitizeCompareList, summarizeComplex } from "../../lib/compare";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const items = sanitizeCompareList(body?.items);
  if (!items.length) {
    return Response.json({ error: "items[{lawdCd, umdNm, aptNm}]가 필요합니다." }, { status: 400 });
  }

  const ymds = monthsBack(currentYmd(), COMPARE_MONTHS);
  const codes = [...new Set(items.map((x) => x.lawdCd))];

  // 지역별 원본 거래 + 세대수를 동시에. 한 지역이 실패해도 나머지 단지는 보여준다.
  const byCode = new Map();
  await Promise.all(
    codes.map(async (code) => {
      const mine = items.filter((x) => x.lawdCd === code);
      const [raw, infos] = await Promise.allSettled([
        fetchRawMonths(code, ymds),
        getComplexInfoMany(code, mine.map(({ umdNm, aptNm }) => ({ umdNm, aptNm }))),
      ]);
      byCode.set(code, {
        trades: raw.status === "fulfilled" ? [...raw.value.byYmd.values()].flat() : null,
        error: raw.status === "rejected" ? raw.reason?.message || "수집 실패" : null,
        infos: new Map(
          mine.map((x, i) => [x.aptNm + "|" + x.umdNm, infos.status === "fulfilled" ? infos.value[i] : null])
        ),
      });
    })
  );

  const entries = items.map((it) => {
    const r = byCode.get(it.lawdCd);
    const info = r.infos.get(it.aptNm + "|" + it.umdNm);
    const base = {
      ...it,
      info: info?.households ? { households: Math.round(info.households), dongCnt: info.dongCnt ?? null } : null,
    };
    if (!r.trades) return { ...base, summary: null, error: r.error };
    const mine = r.trades.filter((t) => t.umdNm === it.umdNm && t.aptNm === it.aptNm);
    return { ...base, summary: summarizeComplex(mine, ymds) };
  });

  return Response.json({ months: ymds.slice(0, 12).reverse(), entries });
}
