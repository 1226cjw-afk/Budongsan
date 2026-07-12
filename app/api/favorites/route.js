// 즐겨찾기 CRUD. 로그인 없는 개인용 → 단일 공용 목록(서버 secret 키로 접근).
// GET: 목록 / POST: 추가(upsert) / PATCH: D-day 필드 갱신(id) / DELETE: 삭제(?lawdCd&umdNm&aptNm).

import { supabaseAdmin, noDbResponse } from "../../lib/supabaseServer";

const BASE_COLS = "id, lawd_cd, umd_nm, apt_nm, lat, lng, created_at";
const DDAY_COLS = ", lease_end, note, note_date"; // 0004 마이그레이션 컬럼

export async function GET() {
  if (!supabaseAdmin) return noDbResponse();
  let { data, error } = await supabaseAdmin
    .from("favorites")
    .select(BASE_COLS + DDAY_COLS)
    .order("created_at", { ascending: false });
  if (error) {
    // 0004 미적용(컬럼 없음) 폴백 — D-day 없이 목록은 정상 동작.
    ({ data, error } = await supabaseAdmin
      .from("favorites")
      .select(BASE_COLS)
      .order("created_at", { ascending: false }));
  }
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ favorites: data });
}

// D-day 필드 갱신. body: { id, leaseEnd?, note?, noteDate? } — null/""로 지우기 가능.
export async function PATCH(request) {
  if (!supabaseAdmin) return noDbResponse();
  const body = await request.json().catch(() => ({}));
  if (!body.id) return Response.json({ error: "id 필요" }, { status: 400 });
  const patch = {
    lease_end: body.leaseEnd || null,
    note: body.note || null,
    note_date: body.noteDate || null,
  };
  const { error } = await supabaseAdmin.from("favorites").update(patch).eq("id", body.id);
  if (error) {
    const migration = /column/i.test(error.message);
    return Response.json(
      { error: migration ? "0004_favorites_dday.sql 마이그레이션을 SQL Editor에서 먼저 실행하세요" : error.message },
      { status: migration ? 409 : 500 }
    );
  }
  return Response.json({ ok: true });
}

export async function POST(request) {
  if (!supabaseAdmin) return noDbResponse();
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
  if (!supabaseAdmin) return noDbResponse();
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
