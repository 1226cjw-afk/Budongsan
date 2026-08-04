// 데일리 부동산 뉴스 수집 cron. 기본 키워드 + 즐겨찾기 지역 키워드로 뉴스를 모아
// news_items 에 저장(link PK, 기존 기사는 건드리지 않음)하고 30일 지난 기사를 정리한다.
//
// 트리거: vercel.json cron(매일). 로컬은 curl 수동 호출.
// 인증: CRON_SECRET 설정 시 `Authorization: Bearer <CRON_SECRET>` 필요(refresh와 동일).

import { fetchNews, newsKeywords, newsSource } from "../../../lib/news";
import { fetchSubscriptions } from "../../../lib/applyhome";
import { cronUnauthorized } from "../../../lib/cronAuth";
import { supabaseAdmin, noDbResponse } from "../../../lib/supabaseServer";

const KEEP_DAYS = 30; // 수집일 기준 보관 기간

export const maxDuration = 60;

export async function GET(request) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  if (!supabaseAdmin) return noDbResponse();

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

  // 🏗 청약 수집 — Vercel Hobby는 프로젝트당 cron 2개가 한도라(refresh 06:00 + news 06:30)
  //    새 cron을 만들 수 없어 여기 합친다. 미승인·장애면 []가 와서 조용히 넘어간다.
  let subscriptions = 0;
  let subscriptionError;
  try {
    const subs = await fetchSubscriptions();
    if (subs.length) {
      const { error } = await supabaseAdmin.from("subscription_items").upsert(
        subs.map((s) => ({
          house_manage_no: s.houseManageNo,
          name: s.name,
          region: s.region,
          address: s.address,
          kind: s.kind,
          receipt_start: s.receiptStart,
          receipt_end: s.receiptEnd,
          winner_date: s.winnerDate,
          households: s.households,
          url: s.url,
          fetched_at: new Date().toISOString(),
        })),
        { onConflict: "house_manage_no" }
      );
      if (error) subscriptionError = error.message;
      else subscriptions = subs.length;
    }
  } catch (e) {
    // 청약 실패가 뉴스 수집을 망치지 않게. 조회는 receipt_end >= today로 거르므로
    // 지난 공고가 쌓여도 화면에는 영향이 없다(프루닝을 따로 두지 않는 이유).
    subscriptionError = e.message;
  }

  return Response.json({
    ok: true,
    source: newsSource(),
    keywords: results,
    collected: rows.length,
    inserted,
    subscriptions,
    subscriptionError,
    pruneError: pruneError?.message,
    durationMs: Date.now() - started,
  });
}
