// 📋 오늘의 브리핑 — 즐겨찾기 단지의 최근 실거래 + 다가오는 일정 + 시장 신호 + 새 거래 피드.
// 집계·캐시 판정은 lib/briefing.js가 한다(cron 워밍과 공유).
// 응답의 cached/computedAt은 관측용 — curl 한 번으로 히트 여부를 알 수 있다.

import { supabaseAdmin, noDbResponse } from "../../lib/supabaseServer";
import { getBriefing } from "../../lib/briefing";

export async function GET() {
  if (!supabaseAdmin) return noDbResponse();
  const { payload, cached, computedAt, error } = await getBriefing(supabaseAdmin);
  if (error) return Response.json({ error }, { status: 500 });
  return Response.json({ ...payload, cached, computedAt });
}
