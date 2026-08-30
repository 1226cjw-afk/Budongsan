// 수집된 뉴스 목록 조회 — /news 페이지용. 필터·날짜 그룹핑은 클라이언트에서
// (최신 limit건 전체를 내려주면 칩 필터에 재요청 불필요 — /api/trades와 같은 방침).

import { isCapitalAreaNews } from "../../lib/news";
import { kstDate, addDaysYmd } from "../../lib/format";
import { supabaseAdmin, noDbResponse } from "../../lib/supabaseServer";

// 목록에 띄우는 기간(오늘 포함 7일). ⚠️ 프루닝(30일)과 다르다 — 프루닝은 fetched_at 기준이라
// 발행일이 오래된 기사가 DB에 남는다(2026-08-31 실측: 발행일 2024-03월 행이 살아 있었다).
// 여기서 발행일로 자르지 않으면 그런 행이 목록 아래에 끼어든다.
const DAYS = 7;

export async function GET(request) {
  if (!supabaseAdmin) return noDbResponse();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 300, 1000);
  // ⚠️ "오늘"은 반드시 KST 달력 날짜(format.kstDate) — Vercel은 UTC로 돌기 때문에 UTC 날짜로
  //    자르면 KST 00:00~08:59에 하루가 밀려, 그 시간대에 접속하면 어제 기사가 통째로 빠진다.
  //    같은 계열 버그가 이 프로젝트에서 네 번 재발했다(format.js 주석 참조).
  const since = `${addDaysYmd(kstDate(), -(DAYS - 1))}T00:00:00+09:00`;

  const { data, error } = await supabaseAdmin
    .from("news_items")
    .select("link, title, source, description, keyword, published_at, fetched_at")
    .gte("published_at", since)
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
  // days를 함께 내려 화면 라벨("최근 7일")이 서버 기준과 어긋나지 않게 한다.
  return Response.json({ items, days: DAYS, since });
}
