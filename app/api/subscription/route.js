// 🏗 청약 레이더 — cron이 채운 subscription_items를 접수 임박순으로 읽는다.
// ⚠️ 외부 API를 호출하지 않는다(/api/briefing과 같은 방침) — 수집은 /api/cron/news가 한다.

import { supabaseAdmin, noDbResponse } from "../../lib/supabaseServer";
import { kstDate } from "../../lib/format";

// ⚠️ 접수 마감 비교는 KST 달력 날짜로 해야 한다(format.kstDate). UTC 날짜를 그대로 쓰면
//    KST 00:00~08:59 구간에 어제가 나와, 이미 마감된 공고가 최대 9시간 더 걸리고 카드가
//    daysUntil(브라우저=KST)로 음수를 받아 "D--1"을 찍는다(2026-08-05).

export async function GET() {
  if (!supabaseAdmin) return noDbResponse();
  const today = kstDate();
  const { data, error } = await supabaseAdmin
    .from("subscription_items")
    .select("*")
    .gte("receipt_end", today)
    .order("receipt_end", { ascending: true })
    .limit(20);
  // 테이블이 없거나(0007 미적용) 비어 있으면 조용히 빈 목록 — 카드가 안 뜬다.
  if (error) return Response.json({ items: [] });
  return Response.json({ items: data || [] });
}
