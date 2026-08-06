// 📋 오늘의 브리핑 집계 — 라우트(/api/briefing)와 cron 워밍이 공유한다.
//
// ⚠️ 외부 API를 호출하지 않는다. /api/cron/refresh 가 매일 06:00에 즐겨찾기 지역
//    최근 2개월을 재수집해 trade_raw_cache에 넣어두므로 캐시만 읽으면 된다
//    (fetchRawMonths의 cacheOnly). 캐시에 없는 지역은 조용히 건너뛴다.
// ⚠️ supabase 의존 = 서버 전용. 클라이언트에서 import하지 말 것(raw node 단독 import도 불가).

import { fetchRawMonths, currentYmd, monthsBack } from "./trades";
import { buildSignal } from "./marketSignal";
import { kstDate, buildFingerprint } from "./briefingCache";
import { daysBetweenYmd } from "./format";

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
export const MONTHS = 4;
const FEED_MAX = 60; // 새 거래 피드 최대 행수 — 클라에서 자금 필터로 더 줄인다

// dealYmd는 KST 달력 날짜인데 toISOString()은 UTC 날짜를 준다 → Vercel은 UTC로 돌고
// cron은 06:00·06:30 KST라 매일 KST 00:00~08:59(=UTC 전날 15:00~23:59) 구간에 걸린다.
// marketSignal.js의 ymd()와 같은 이유로 같은 보정을 쓴다 — 안 그러면 이 cutoff(기존
// complexes/feed 창)와 buildSignal의 30일 창이 하루 어긋나, 같은 화면의 "시장 신호"
// 카드와 "새 거래 피드" 카드가 자정 근처에 서로 다른 개수를 보여주게 된다(2026-08-03).
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export async function buildBriefingPayload(favs) {
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
  // ⚠️ 기준일은 **KST 달력 날짜**다. 예전엔 new Date().setHours(0,0,0,0)(=Vercel에선 UTC
  //    자정)을 썼는데, 그러면 KST 00:00~09:00에 D-day가 하루 크게 나온다. 페이로드를
  //    캐시하면(cron이 06:00 KST에 계산) 그 오차가 온종일 고정되므로 반드시 KST여야 한다.
  const todayKst = kstDate();
  const upcoming = [];
  for (const f of favs) {
    for (const [kind, ymd, label] of [
      ["lease", f.lease_end, "임대차 만기"],
      ["note", f.note_date, f.note || "메모"],
    ]) {
      if (!ymd) continue;
      const dday = daysBetweenYmd(todayKst, ymd);
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

  // ⚠️ ★ 단지 거래는 상한에서 보호한다 — 그냥 최신순 60건으로 자르면 ★ 탭이 통째로
  //    빈다. ★ 단지의 새 거래는 지역 전체보다 훨씬 드물어(2026-08-04 실측: 최신 60건이
  //    전부 7/30~8/01, ★ 4곳의 거래는 7/07~7/18이라 컷 밖) 기본 탭이 늘 "거래 없음"으로
  //    보였다. ★ 것을 먼저 담고 남은 자리를 최신순으로 채운 뒤 다시 날짜순 정렬한다.
  const favKeys = new Set(favs.map((f) => `${f.lawd_cd}|${f.umd_nm}|${f.apt_nm}`));
  const isFav = (t) => favKeys.has(`${t.lawdCd}|${t.umdNm}|${t.aptNm}`);
  const favRows = feed.filter(isFav).slice(0, FEED_MAX);
  const rest = feed.filter((t) => !isFav(t)).slice(0, Math.max(0, FEED_MAX - favRows.length));
  const merged = [...favRows, ...rest].sort((a, b) => (a.dealDate < b.dealDate ? 1 : -1));

  return { complexes, upcoming, signal, feed: merged };
}

// ── 페이로드 캐시 ──────────────────────────────────────────────────────────
// ⚠️ 이 계층의 실패는 **전부 라이브 계산으로 폴백**한다(테이블 부재·조회 실패·지문 실패).
//    캐싱이 통째로 죽어도 동작은 캐시 도입 전과 같아진다. 반대 방향(실패 시 옛 payload를
//    내보내는 것)으로 기울면 안 된다 — 그건 조용히 틀린 화면이 된다.

// 대상 캐시 행의 최신 fetched_at 1건만. postgrest 집계 대신 order+limit(1)로 받는다
// (전송량 1행). 실패하면 null → 지문 불일치 → 재계산 쪽으로 기운다(안전한 방향).
async function latestFetchedAt(supabase, codes, ymds) {
  try {
    const { data, error } = await supabase
      .from("trade_raw_cache")
      .select("fetched_at")
      .in("lawd_cd", codes)
      .in("deal_ymd", ymds)
      .order("fetched_at", { ascending: false })
      .limit(1);
    if (error) return null;
    return data?.[0]?.fetched_at || null;
  } catch {
    return null;
  }
}

async function readCache(supabase) {
  try {
    const { data, error } = await supabase
      .from("briefing_cache")
      .select("fingerprint, payload, computed_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) return null; // 0008 미적용(테이블 부재) 포함 — 조용히 라이브 계산
    return data || null;
  } catch {
    return null;
  }
}

async function writeCache(supabase, fingerprint, payload, computedAt) {
  try {
    const { error } = await supabase
      .from("briefing_cache")
      .upsert({ id: 1, fingerprint, payload, computed_at: computedAt }, { onConflict: "id" });
    if (error) console.error("[briefing_cache] upsert:", error.message);
  } catch (e) {
    console.error("[briefing_cache] upsert:", e.message);
  }
}

// 브리핑 응답을 돌려준다 — 지문이 같으면 저장된 payload, 아니면 계산 후 저장.
// 라우트와 cron 워밍이 **둘 다 이 함수만** 호출한다(지문 계산 경로를 하나로 유지).
export async function getBriefing(supabase) {
  const { data: favs, error } = await supabase.from("favorites").select("*");
  if (error) return { error: error.message };
  // ⚠️ ★가 없을 때의 응답 형태는 그대로(Briefing.js 빈 상태 판정). 캐시하지 않는다.
  if (!favs?.length) return { payload: { complexes: [], upcoming: [] }, cached: false, computedAt: null };

  const ymds = monthsBack(currentYmd(), MONTHS);
  const codes = [...new Set(favs.map((f) => f.lawd_cd))];

  // 지문 재료 2종은 서로 무관하니 동시에 — 둘 다 실패해도 계산으로 이어간다.
  const [latestFetched, cacheRow] = await Promise.all([
    latestFetchedAt(supabase, codes, ymds),
    readCache(supabase),
  ]);

  let fingerprint = null;
  try {
    fingerprint = buildFingerprint({ favs, latestFetched, kstDate: kstDate() });
  } catch (e) {
    console.error("[briefing_cache] fingerprint:", e.message);
  }

  if (fingerprint && cacheRow?.fingerprint === fingerprint) {
    return { payload: cacheRow.payload, cached: true, computedAt: cacheRow.computed_at };
  }

  const payload = await buildBriefingPayload(favs);
  const computedAt = new Date().toISOString();
  if (fingerprint) await writeCache(supabase, fingerprint, payload, computedAt);
  return { payload, cached: false, computedAt };
}
