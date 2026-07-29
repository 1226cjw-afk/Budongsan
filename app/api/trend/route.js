// 한 단지의 월별 시세 추세 (기본 최근 12개월). 지오코딩 없이 원본 거래만 집계 → 빠름.
// 파라미터: lawdCd, umdNm, aptNm, months(기본 12), area(전용㎡ 정수, 선택 — 특정 평형만).
//
// ⚠️ 월별 대표값은 **중앙값**이다. 한 평형의 월 거래는 1~3건이 흔해서, 저층·특수사정 거래
// 하나가 평균을 통째로 끌어올리면 추세선이 실제와 다르게 꺾인다. 해제·직거래는 이미
// fetchRawMonths가 걷어낸 뒤라, 중앙값은 남은 정상 거래의 산포만 흡수한다.
// (avg도 같이 실어 보내 필요하면 비교할 수 있게 둔다.)

import { fetchRawMonths, monthsBack, currentYmd } from "../../lib/trades";
import { median } from "../../lib/tradeStats";

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

  let byYmd;
  try {
    ({ byYmd } = await fetchRawMonths(lawdCd, ymds)); // 캐시 일괄 조회 + 미스만 제한 병렬 수집
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }

  // 각 달: 해당 단지(+선택 평형) 거래만 추려 중앙값/평균/건수 집계.
  const series = ymds
    .map((ymd) => {
      let hits = (byYmd.get(ymd) || []).filter(
        (t) => t.umdNm === umdNm && t.aptNm === aptNm
      );
      if (area != null) hits = hits.filter((t) => Math.round(t.area) === area);
      if (!hits.length) return { ymd, count: 0, value: null, avg: null };
      const amounts = hits.map((t) => t.dealAmount);
      const sum = amounts.reduce((s, v) => s + v, 0);
      return {
        ymd,
        count: hits.length,
        value: Math.round(median(amounts)), // 차트가 그리는 대표값
        avg: Math.round(sum / amounts.length),
      };
    })
    .reverse(); // 과거→현재 순

  return Response.json({ lawdCd, umdNm, aptNm, months, area, series });
}
