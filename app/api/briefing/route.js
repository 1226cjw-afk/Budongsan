// 📋 오늘의 브리핑 — 즐겨찾기 단지의 최근 실거래 + 다가오는 일정.
//
// ⚠️ 외부 API를 호출하지 않는다. /api/cron/refresh 가 매일 06:00에 즐겨찾기 지역
//    최근 2개월을 재수집해 trade_raw_cache에 넣어두므로 캐시만 읽으면 된다
//    (fetchRawMonths의 cacheOnly). 캐시에 없는 지역은 조용히 건너뛴다.

import { supabaseAdmin, noDbResponse } from "../../lib/supabaseServer";
import { fetchRawMonths, currentYmd, monthsBack } from "../../lib/trades";

const RECENT_DAYS = 30; // 브리핑에 보여줄 최근 거래 기간
const UPCOMING_DAYS = 30; // D-day 알림 범위
const MONTHS = 2; // cron이 갱신하는 범위와 동일

function ddayFrom(ymd) {
  const t = new Date(`${ymd}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

export async function GET() {
  if (!supabaseAdmin) return noDbResponse();

  const { data: favs, error } = await supabaseAdmin.from("favorites").select("*");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!favs?.length) return Response.json({ complexes: [], upcoming: [] });

  // 즐겨찾기가 걸린 지역만 캐시에서 읽는다.
  const ymds = monthsBack(currentYmd(), MONTHS);
  const codes = [...new Set(favs.map((f) => f.lawd_cd))];
  const byCode = new Map();
  await Promise.all(
    codes.map(async (code) => {
      try {
        const { byYmd } = await fetchRawMonths(code, ymds, { cacheOnly: true });
        byCode.set(code, [...byYmd.values()].flat());
      } catch {
        byCode.set(code, []); // 캐시 미스는 그 지역만 조용히 생략
      }
    })
  );

  const cutoff = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString().slice(0, 10);

  const complexes = [];
  for (const f of favs) {
    const all = (byCode.get(f.lawd_cd) || []).filter(
      (t) => t.aptNm === f.apt_nm && t.umdNm === f.umd_nm
    );
    if (!all.length) continue;
    all.sort((a, b) => (a.dealYmd < b.dealYmd ? 1 : -1)); // 최신순

    const recent = all
      .filter((t) => t.dealYmd >= cutoff)
      .map((t) => ({ area: t.area, amount: t.dealAmount, dealDate: t.dealYmd }));
    if (!recent.length) continue;

    // 변동률 기준: 같은 평형의 직전 거래. 평형이 다르면 비교가 무의미하다.
    const top = recent[0];
    const prev = all.find(
      (t) => t.dealYmd < top.dealDate && Math.round(t.area) === Math.round(top.area)
    );

    complexes.push({
      lawdCd: f.lawd_cd,
      umdNm: f.umd_nm,
      aptNm: f.apt_nm,
      buildYear: all[0].buildYear || null,
      recent: recent.slice(0, 5),
      prevAmount: prev ? prev.dealAmount : null,
    });
  }
  // 최근 거래가 있는 단지를 최신순으로.
  complexes.sort((a, b) => (a.recent[0].dealDate < b.recent[0].dealDate ? 1 : -1));

  // 다가오는 일정. 0004 마이그레이션 미적용 환경에는 컬럼이 없으므로
  // 값이 없으면 그냥 빠진다(/api/favorites GET 폴백과 같은 방침).
  const upcoming = [];
  for (const f of favs) {
    for (const [kind, ymd, label] of [
      ["lease", f.lease_end, "임대차 만기"],
      ["note", f.note_date, f.note || "메모"],
    ]) {
      if (!ymd) continue;
      const dday = ddayFrom(ymd);
      if (dday == null || dday < 0 || dday > UPCOMING_DAYS) continue;
      upcoming.push({ aptNm: f.apt_nm, kind, label, dday });
    }
  }
  upcoming.sort((a, b) => a.dday - b.dday);

  return Response.json({ complexes, upcoming });
}
