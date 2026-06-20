// 한 단지의 월별 시세 추세 (기본 최근 12개월). 지오코딩 없이 원본 거래만 집계 → 빠름.
// 파라미터: lawdCd, umdNm, aptNm, months(기본 12), area(전용㎡ 정수, 선택 — 특정 평형만).

import { fetchRawMonth, monthsBack, currentYmd } from "../../lib/trades";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lawdCd = searchParams.get("lawdCd");
  const umdNm = searchParams.get("umdNm");
  const aptNm = searchParams.get("aptNm");
  const months = Math.min(36, Math.max(1, Number(searchParams.get("months")) || 12));
  const area = searchParams.get("area") ? Number(searchParams.get("area")) : null;

  if (!lawdCd || !umdNm || !aptNm) {
    return Response.json(
      { error: "lawdCd, umdNm, aptNm 가 필요합니다." },
      { status: 400 }
    );
  }

  const ymds = monthsBack(currentYmd(), months); // 이번 달 기준 과거 N개월

  let perMonth;
  try {
    perMonth = await Promise.all(ymds.map((ymd) => fetchRawMonth(lawdCd, ymd)));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }

  // 각 달: 해당 단지(+선택 평형) 거래만 추려 평균/건수 집계.
  const series = ymds
    .map((ymd, i) => {
      let hits = perMonth[i].filter(
        (t) => t.umdNm === umdNm && t.aptNm === aptNm
      );
      if (area != null) hits = hits.filter((t) => Math.round(t.area) === area);
      if (!hits.length) return { ymd, count: 0, avg: null };
      const sum = hits.reduce((s, t) => s + t.dealAmount, 0);
      return { ymd, count: hits.length, avg: Math.round(sum / hits.length) };
    })
    .reverse(); // 과거→현재 순

  return Response.json({ lawdCd, umdNm, aptNm, months, area, series });
}
