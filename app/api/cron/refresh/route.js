// 실거래가 주기적 자동 갱신 (3단계). 즐겨찾기(관심 지역)의 최근 N개월 원본 거래를
// 국토부에서 강제 재수집해 trade_raw_cache 를 신선하게 유지한다.
//
// 트리거: vercel.json 의 cron 이 이 경로를 호출(배포 후 자동). 로컬에선 curl 로 수동 호출 가능.
// 인증: CRON_SECRET 설정 시 `Authorization: Bearer <CRON_SECRET>` 일치 필요.
//   - Vercel Cron 은 CRON_SECRET 환경변수가 있으면 이 헤더를 자동으로 붙여 호출한다.
//   - 미설정(로컬 등)이면 인증 없이 동작.

import { fetchRawMonth, monthsBack, currentYmd } from "../../../lib/trades";
import { supabaseAdmin } from "../../../lib/supabaseServer";

const REFRESH_MONTHS = 2; // 이번달 + 지난달(지연 신고 반영). 과거달은 거의 안 변함.

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

  // 관심 지역 = 즐겨찾기에 저장된 시군구(중복 제거).
  const { data: favs, error } = await supabaseAdmin.from("favorites").select("lawd_cd");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const regions = [...new Set((favs || []).map((f) => f.lawd_cd))];

  const ymds = monthsBack(currentYmd(), REFRESH_MONTHS);
  const results = [];
  for (const lawdCd of regions) {
    const months = await Promise.all(
      ymds.map(async (ymd) => {
        try {
          const trades = await fetchRawMonth(lawdCd, ymd, { refresh: true });
          return { ymd, count: trades.length };
        } catch (e) {
          return { ymd, error: e.message };
        }
      })
    );
    const total = months.reduce((s, m) => s + (m.count || 0), 0);
    results.push({ lawdCd, total, months });
  }

  return Response.json({
    ok: true,
    refreshedAt: new Date().toISOString(),
    regionCount: regions.length,
    monthsRefreshed: ymds,
    durationMs: Date.now() - started,
    results,
  });
}
