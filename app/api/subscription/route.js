// 🏗 청약 레이더 — cron이 채운 subscription_items를 접수 임박순으로 읽는다.
// ⚠️ 외부 API를 호출하지 않는다(/api/briefing과 같은 방침) — 수집은 /api/cron/news가 한다.

import { supabaseAdmin, noDbResponse } from "../../lib/supabaseServer";

export async function GET() {
  if (!supabaseAdmin) return noDbResponse();
  const today = new Date().toISOString().slice(0, 10);
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
