// 국토부 실거래가 → 카카오 지오코딩 → JSON. 여러 달(기본 3개월) 병합해 단지별로 반환.
// 수집/지오코딩/캐시 로직은 ../../lib/trades 에 공용화.

import { fetchRawMonths, geocodeMany, monthsBack, latestFetchedAt } from "../../lib/trades";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lawdCd = searchParams.get("lawdCd"); // 법정동 5자리
  const dealYmd = searchParams.get("dealYmd"); // 종료월 YYYYMM
  const months = Math.min(12, Math.max(1, Number(searchParams.get("months")) || 3));
  const refresh = searchParams.get("refresh") === "1";

  if (!lawdCd || !dealYmd) {
    return Response.json(
      { error: "lawdCd(법정동5자리)와 dealYmd(YYYYMM)가 필요합니다." },
      { status: 400 }
    );
  }

  const ymds = monthsBack(dealYmd, months);

  // 1) 각 달 원본 거래 수집(캐시) 후 병합.
  let trades;
  try {
    const { byYmd } = await fetchRawMonths(lawdCd, ymds, { refresh });
    trades = ymds.flatMap((ymd) => byYmd.get(ymd) || []);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }

  // 2) 단지(법정동|단지명)별로 묶는다.
  const byApt = new Map();
  for (const t of trades) {
    const key = `${t.umdNm}|${t.aptNm}`;
    if (!byApt.has(key)) byApt.set(key, []);
    byApt.get(key).push(t);
  }

  // 3) 단지 좌표 일괄 조회/지오코딩 (캐시 1회 + 미스만 병렬).
  const items = [...byApt.values()].map((g) => ({
    umdNm: g[0].umdNm,
    aptNm: g[0].aptNm,
    jibun: g[0].jibun,
  }));
  const coordMap = await geocodeMany(lawdCd, items);
  const fetchedAt = await latestFetchedAt(lawdCd, ymds); // 캐시 신선도

  const complexes = [];
  for (const [, group] of byApt) {
    const { aptNm, umdNm } = group[0];
    const coord = coordMap.get(`${umdNm}|${aptNm}`) || null;
    const amounts = group.map((g) => g.dealAmount);
    complexes.push({
      aptNm,
      umdNm,
      lat: coord?.lat ?? null,
      lng: coord?.lng ?? null,
      trades: group,
      maxAmount: Math.max(...amounts),
      minAmount: Math.min(...amounts),
      count: group.length,
    });
  }

  return Response.json({
    lawdCd,
    dealYmd,
    months,
    monthList: ymds,
    total: trades.length,
    complexCount: complexes.length,
    geocoded: complexes.filter((c) => c.lat != null).length,
    fetchedAt,
    complexes,
  });
}
