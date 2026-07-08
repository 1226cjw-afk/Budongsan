// 수집된 뉴스 목록 조회 — /news 페이지용. 필터·날짜 그룹핑은 클라이언트에서
// (최신 limit건 전체를 내려주면 칩 필터에 재요청 불필요 — /api/trades와 같은 방침).

import { supabaseAdmin } from "../../lib/supabaseServer";

export async function GET(request) {
  if (!supabaseAdmin) {
    return Response.json({ error: "Supabase 미설정" }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 300, 1000);

  const { data, error } = await supabaseAdmin
    .from("news_items")
    .select("link, title, source, description, keyword, published_at, fetched_at")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    const migration = /news_items/i.test(error.message);
    return Response.json(
      { error: migration ? "0005_news_items.sql 마이그레이션을 먼저 실행하세요" : error.message },
      { status: migration ? 409 : 500 }
    );
  }
  return Response.json({ items: data || [] });
}
