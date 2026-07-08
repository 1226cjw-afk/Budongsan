// 데일리 부동산 뉴스 수집 cron. 기본 키워드 + 즐겨찾기 지역 키워드로 뉴스를 모아
// news_items 에 저장(link PK, 기존 기사는 건드리지 않음)하고 30일 지난 기사를 정리한다.
//
// 트리거: vercel.json cron(매일). 로컬은 curl 수동 호출.
// 인증: CRON_SECRET 설정 시 `Authorization: Bearer <CRON_SECRET>` 필요(refresh와 동일).

import { fetchNews, newsKeywords, newsSource } from "../../../lib/news";
import { supabaseAdmin } from "../../../lib/supabaseServer";

const KEEP_DAYS = 30; // 수집일 기준 보관 기간

export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  if (!supabaseAdmin) {
    return Response.json({ error: "Supabase 미설정" }, { status: 500 });
  }

  const started = Date.now();

  // 즐겨찾기 지역 → 지역 키워드. 실패해도 기본 키워드로는 진행.
  const { data: favs } = await supabaseAdmin.from("favorites").select("lawd_cd");
  const keywords = newsKeywords((favs || []).map((f) => f.lawd_cd));

  // 키워드 전량 동시 수집(키워드 수 ~10, 외부 API 부담 없음).
  const byLink = new Map(); // 키워드 간 중복 기사 제거(먼저 잡힌 키워드가 주인)
  const results = await Promise.all(
    keywords.map(async (keyword) => {
      try {
        const items = await fetchNews(keyword);
        for (const it of items) {
          if (!byLink.has(it.link)) byLink.set(it.link, { ...it, keyword });
        }
        return { keyword, items: items.length };
      } catch (e) {
        return { keyword, error: e.message };
      }
    })
  );

  const rows = [...byLink.values()].map((it) => ({
    link: it.link,
    title: it.title,
    source: it.source || null,
    description: it.description || null,
    keyword: it.keyword,
    published_at: it.publishedAt,
  }));

  // ignoreDuplicates: 이미 저장된 기사는 DO NOTHING → select 반환분 = 신규 삽입분.
  let inserted = 0;
  if (rows.length) {
    const { data, error } = await supabaseAdmin
      .from("news_items")
      .upsert(rows, { onConflict: "link", ignoreDuplicates: true })
      .select("link");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    inserted = (data || []).length;
  }

  // 프루닝: 수집한 지 30일 넘은 기사 삭제(발행일 결측도 함께 정리됨).
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
  const { error: pruneError } = await supabaseAdmin
    .from("news_items")
    .delete()
    .lt("fetched_at", cutoff);

  return Response.json({
    ok: true,
    source: newsSource(),
    keywords: results,
    collected: rows.length,
    inserted,
    pruneError: pruneError?.message,
    durationMs: Date.now() - started,
  });
}
