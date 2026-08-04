// 📋 오늘의 브리핑 — 즐겨찾기 단지의 최근 실거래 + 다가오는 일정.
//
// ⚠️ 외부 API를 호출하지 않는다. /api/cron/refresh 가 매일 06:00에 즐겨찾기 지역
//    최근 2개월을 재수집해 trade_raw_cache에 넣어두므로 캐시만 읽으면 된다
//    (fetchRawMonths의 cacheOnly). 캐시에 없는 지역은 조용히 건너뛴다.

import { supabaseAdmin, noDbResponse } from "../../lib/supabaseServer";
import { fetchRawMonths, currentYmd, monthsBack } from "../../lib/trades";
import { buildSignal } from "../../lib/marketSignal";

const RECENT_DAYS = 30; // 브리핑에 보여줄 최근 거래 기간
const UPCOMING_DAYS = 30; // D-day 알림 범위
// ⚠️ 2개월도 3개월도 아니라 4개월. buildSignal의 창이 신고 기한(30일)만큼 밀려 있어
//    prev 창이 [asOf−90일, asOf−60일)까지 내려가고, 90일은 최악의 경우(예: 3/1 기준
//    90일 전=작년 12/1) 달력월 4개를 걸친다. 창보다 짧게 잡으면 prev가 데이터
//    부족(starved)해져 delta가 항상 "급증"으로 보인다 — 2026-08-03에 2→3으로 늘린
//    것도 같은 버그였다(41173 vol=134/42, 11530 180/40 처럼 prevCount만 저평가).
//    추가된 달은 cacheOnly라 캐시 조회 한 번 더일 뿐이고(이미 /api/trades·/api/trend로
//    영구 캐시된 달이면 공짜), 한 번도 안 데운 지역이면 그 달만 조용히 빠진다.
//    ⚠️ marketSignal.js의 REPORT_LAG_DAYS를 바꾸면 이 값도 함께 봐야 한다.
const MONTHS = 4;
const FEED_MAX = 60; // 새 거래 피드 최대 행수 — 클라에서 자금 필터로 더 줄인다

// dealYmd는 KST 달력 날짜인데 toISOString()은 UTC 날짜를 준다 → Vercel은 UTC로 돌고
// cron은 06:00·06:30 KST라 매일 KST 00:00~08:59(=UTC 전날 15:00~23:59) 구간에 걸린다.
// marketSignal.js의 ymd()와 같은 이유로 같은 보정을 쓴다 — 안 그러면 이 cutoff(기존
// complexes/feed 창)와 buildSignal의 30일 창이 하루 어긋나, 같은 화면의 "시장 신호"
// 카드와 "새 거래 피드" 카드가 자정 근처에 서로 다른 개수를 보여주게 된다(2026-08-03).
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

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
  const removedByCode = new Map();
  await Promise.all(
    codes.map(async (code) => {
      try {
        const { byYmd, removed } = await fetchRawMonths(code, ymds, { cacheOnly: true });
        byCode.set(code, [...byYmd.values()].flat());
        removedByCode.set(code, removed || []);
      } catch {
        byCode.set(code, []); // 캐시 미스는 그 지역만 조용히 생략
        removedByCode.set(code, []);
      }
    })
  );

  const cutoff = new Date(Date.now() - RECENT_DAYS * 86400000 + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);

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

  // 📊 시장 신호 — 관심 지역별. 캐시에 이미 있는 원본만 쓰므로 추가 비용이 없다.
  const asOf = new Date();
  const signal = {
    asOf: asOf.toISOString(),
    byRegion: codes.map((code) => ({
      lawdCd: code,
      ...buildSignal({
        trades: byCode.get(code) || [],
        removed: removedByCode.get(code) || [],
        asOf,
      }),
    })),
  };

  // 🆕 새 거래 피드 — 관심 지역 전체의 최근 거래(최신순). 자금 판정은 클라가 한다
  // (프로필이 localStorage에 있어 서버는 모른다).
  const feed = [];
  for (const code of codes) {
    const all = byCode.get(code) || [];
    // 같은 평형 직전 거래를 찾으려면 단지+평형별로 모아야 한다.
    const byKey = new Map();
    for (const t of all) {
      const k = `${t.umdNm}|${t.aptNm}|${Math.round(t.area)}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(t);
    }
    for (const list of byKey.values()) {
      list.sort((a, b) => (a.dealYmd < b.dealYmd ? 1 : -1)); // 최신순
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (t.dealYmd < cutoff) break; // 최신순이라 창을 벗어나면 이후도 벗어난다
        feed.push({
          lawdCd: code,
          umdNm: t.umdNm,
          aptNm: t.aptNm,
          area: t.area,
          amount: t.dealAmount,
          floor: t.floor,
          dealDate: t.dealYmd,
          prevAmount: list[i + 1] ? list[i + 1].dealAmount : null,
        });
      }
    }
  }
  feed.sort((a, b) => (a.dealDate < b.dealDate ? 1 : -1));

  return Response.json({ complexes, upcoming, signal, feed: feed.slice(0, FEED_MAX) });
}
