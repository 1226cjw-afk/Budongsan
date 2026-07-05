// 단지 부가정보(세대수/동수/사용승인일). 국토부 공동주택 API 보강 — ../../lib/kapt.
// 미승인/매칭실패 시 { kaptCode: null } 반환(UI는 '—' 처리).
// GET=단건(세부패널) / POST=일괄(리스트 상위 N행 — kapt_cache 1회 조회 + 미스만 국토부).

import { getComplexInfo, getComplexInfoMany } from "../../lib/kapt";

const BATCH_MAX = 50; // 일괄 조회 남용 가드(리스트 lazy는 30행)

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lawdCd = searchParams.get("lawdCd");
  const umdNm = searchParams.get("umdNm");
  const aptNm = searchParams.get("aptNm");
  if (!lawdCd || !umdNm || !aptNm) {
    return Response.json({ error: "lawdCd, umdNm, aptNm 필요" }, { status: 400 });
  }
  const info = await getComplexInfo(lawdCd, umdNm, aptNm);
  return Response.json(info);
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const lawdCd = body?.lawdCd;
  const items = Array.isArray(body?.items)
    ? body.items.filter((x) => x?.umdNm && x?.aptNm).slice(0, BATCH_MAX)
    : [];
  if (!lawdCd || !items.length) {
    return Response.json({ error: "lawdCd, items[{umdNm,aptNm}] 필요" }, { status: 400 });
  }
  const infos = await getComplexInfoMany(lawdCd, items);
  return Response.json({ infos });
}
