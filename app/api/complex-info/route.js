// 단지 부가정보(세대수/동수/사용승인일). 국토부 공동주택 API 보강 — ../../lib/kapt.
// 미승인/매칭실패 시 { kaptCode: null } 반환(UI는 '—' 처리).

import { getComplexInfo } from "../../lib/kapt";

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
