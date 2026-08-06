// 📋 오늘의 브리핑 — 즐겨찾기 단지의 최근 실거래 + 다가오는 일정 + 시장 신호 + 새 거래 피드.
// 집계는 lib/briefing.js가 한다(cron 워밍과 공유).

import { supabaseAdmin, noDbResponse } from "../../lib/supabaseServer";
import { buildBriefingPayload } from "../../lib/briefing";

export async function GET() {
  if (!supabaseAdmin) return noDbResponse();

  const { data: favs, error } = await supabaseAdmin.from("favorites").select("*");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // ⚠️ ★가 하나도 없을 때의 응답 형태는 그대로 유지한다 — Briefing.js의 빈 상태 판정이
  //    이 모양(키 2개)에 맞춰져 있다.
  if (!favs?.length) return Response.json({ complexes: [], upcoming: [] });

  const payload = await buildBriefingPayload(favs);
  return Response.json(payload);
}
