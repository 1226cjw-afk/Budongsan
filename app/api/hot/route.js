// 🔥 핫플 단지 — trade_reports(새로 신고된 거래)를 단지별로 집계해 오늘·이번 주를 한 번에 내린다.
// 칩(종합·거래·가격·뉴스) 순위는 클라이언트(lib/hotRank.rankHot)가 한다 — 뉴스 신호가 클라에만 있다.
// ⚠️ 캐시(trade_raw_cache)를 읽지 않는다. 가격 기준(ref_median)은 기록 시점에 계산해 둔다.

import { supabaseAdmin, noDbResponse } from "../../lib/supabaseServer";
import { kstDate, addDaysYmd } from "../../lib/format";
import { summarizeReports, HOT_PRICE_MIN_REPORTS } from "../../lib/hotRank";

const PAGE = 1000; // ⚠️ PostgREST 기본 행 상한 — 페이지네이션 없이 받으면 이번 주분이 조용히 잘린다
const MAX_PAGES = 30;
const TOP_BY_REPORTS = 60;
const TOP_BY_PRICE = 20;

// 거래순 상위 ∪ 가격 후보 상위 — 칩 전환이 재요청 없이 되도록 둘 다 싣는다.
function pick(all) {
  const top = all.slice(0, TOP_BY_REPORTS);
  const keys = new Set(top.map((c) => c.key));
  const price = all
    .filter((c) => c.jump && c.jump.pct > 0 && c.reports >= HOT_PRICE_MIN_REPORTS && !keys.has(c.key))
    .sort((a, b) => b.jump.pct - a.jump.pct)
    .slice(0, TOP_BY_PRICE);
  return { total: all.length, complexes: [...top, ...price] };
}

export async function GET() {
  if (!supabaseAdmin) return noDbResponse();
  const today = kstDate();
  const since = addDaysYmd(today, -6);
  const rows = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const { data, error } = await supabaseAdmin
      .from("trade_reports")
      .select("lawd_cd, umd_nm, apt_nm, deal_ymd, area, amount, dealing_gbn, cdeal_type, ref_median, reported_on")
      .gte("reported_on", since)
      .order("lawd_cd")
      .order("trade_key")
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return Response.json({
    asOf: today,
    today: pick(summarizeReports(rows.filter((r) => r.reported_on === today))),
    week: pick(summarizeReports(rows)),
  });
}
