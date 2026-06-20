// 즐겨찾기 CRUD. 로그인 없는 개인용 → 단일 공용 목록(서버 secret 키로 접근).
// GET: 목록 / POST: 추가(upsert) / DELETE: 삭제(?lawdCd&umdNm&aptNm).

import { supabaseAdmin } from "../../lib/supabaseServer";

function noDb() {
  return Response.json({ error: "Supabase 미설정" }, { status: 500 });
}

export async function GET() {
  if (!supabaseAdmin) return noDb();
  const { data, error } = await supabaseAdmin
    .from("favorites")
    .select("id, lawd_cd, umd_nm, apt_nm, lat, lng, created_at")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ favorites: data });
}

export async function POST(request) {
  if (!supabaseAdmin) return noDb();
  const body = await request.json().catch(() => ({}));
  const { lawdCd, umdNm, aptNm, lat, lng } = body;
  if (!lawdCd || !umdNm || !aptNm) {
    return Response.json({ error: "lawdCd, umdNm, aptNm 필요" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("favorites")
    .upsert(
      { lawd_cd: lawdCd, umd_nm: umdNm, apt_nm: aptNm, lat, lng },
      { onConflict: "lawd_cd,umd_nm,apt_nm" }
    )
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ favorite: data });
}

export async function DELETE(request) {
  if (!supabaseAdmin) return noDb();
  const { searchParams } = new URL(request.url);
  const lawdCd = searchParams.get("lawdCd");
  const umdNm = searchParams.get("umdNm");
  const aptNm = searchParams.get("aptNm");
  if (!lawdCd || !umdNm || !aptNm) {
    return Response.json({ error: "lawdCd, umdNm, aptNm 필요" }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from("favorites")
    .delete()
    .eq("lawd_cd", lawdCd)
    .eq("umd_nm", umdNm)
    .eq("apt_nm", aptNm);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
