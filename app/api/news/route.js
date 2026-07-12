// 수집된 뉴스 목록 조회 — /news 페이지용. 필터·날짜 그룹핑은 클라이언트에서
// (최신 limit건 전체를 내려주면 칩 필터에 재요청 불필요 — /api/trades와 같은 방침).

import { isCapitalAreaNews } from "../../lib/news";
import { supabaseAdmin, noDbResponse } from "../../lib/supabaseServer";

export async function GET(request) {
  if (!supabaseAdmin) return noDbResponse();
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
  // 수도권 온리(2026-07-12): 전환 이전에 수집된 비수도권 기사를 조회에서 숨김.
  // 신규 수집은 fetchNews에서 이미 걸러지고, 과거분은 30일 프루닝으로 자연 소멸.
  const items = (data || []).filter((it) =>
    isCapitalAreaNews(it.title, it.description || "")
  );
  return Response.json({ items });
}
