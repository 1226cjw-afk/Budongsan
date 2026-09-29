// 실거래가 주기적 자동 갱신. ① ★ 관심 지역 최근 2개월 강제 재수집 ② 🔥 핫플용 서울+경기 전역 재수집
// ③ trade_reports 30일 프루닝 ④ 브리핑 캐시 워밍 ⑤ 추세 36개월 워밍 — **이 순서를 지킬 것**.
//
// 트리거: vercel.json 의 cron 이 이 경로를 호출(배포 후 자동). 로컬에선 curl 로 수동 호출 가능.
// 인증: CRON_SECRET 설정 시 `Authorization: Bearer <CRON_SECRET>` 일치 필요.
//   - Vercel Cron 은 CRON_SECRET 환경변수가 있으면 이 헤더를 자동으로 붙여 호출한다.
//   - 미설정(로컬 등)이면 인증 없이 동작.

import { fetchRawMonths, monthsBack, currentYmd } from "../../../lib/trades";
import { cronUnauthorized } from "../../../lib/cronAuth";
import { supabaseAdmin, noDbResponse } from "../../../lib/supabaseServer";
import { getBriefing } from "../../../lib/briefing";
import { ALL_REGIONS } from "../../../lib/regions";
import { kstDate, addDaysYmd } from "../../../lib/format";

const REFRESH_MONTHS = 2; // 이번달 + 지난달(지연 신고 반영). 과거달은 거의 안 변함.
const TREND_WINDOW = 36; // 추세 3년 창 — 미캐시 달을 미리 채워 첫 3년 조회를 빠르게(과거달은 영구 캐시)
const WARM_DEADLINE_MS = 40_000; // 워밍은 이 시간 넘으면 중단(함수 타임아웃 보호, 다음 실행이 이어감)
// 🔥 전역 수집. 지역 12곳 × 2개월 = 국토부 동시 24호출(국토부는 동시 호출 스로틀 없음 — trades.js 실측).
const HOT_CHUNK = 12;
const HOT_DEADLINE_MS = 25_000; // 전역 단계 자체의 상한 — 브리핑 워밍 몫을 남긴다
const REPORT_KEEP_DAYS = 30;

export const maxDuration = 60; // Vercel 함수 최대 실행(초) — 첫 워밍(지역당 ~34달 수집) 대비

async function refreshRegion(lawdCd, ymds) {
  try {
    const { byYmd } = await fetchRawMonths(lawdCd, ymds, { refresh: true });
    const months = ymds.map((ymd) => ({ ymd, count: byYmd.get(ymd)?.length ?? 0 }));
    return { lawdCd, total: months.reduce((s, m) => s + m.count, 0), months };
  } catch (e) {
    return { lawdCd, error: e.message };
  }
}

export async function GET(request) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  if (!supabaseAdmin) return noDbResponse();

  const started = Date.now();

  // 관심 지역 = 즐겨찾기에 저장된 시군구(중복 제거).
  const { data: favs, error } = await supabaseAdmin.from("favorites").select("lawd_cd");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const regions = [...new Set((favs || []).map((f) => f.lawd_cd))];

  // ① ★ 지역 — 여러 달을 한 번에(fetchRawMonths) 받아야 핫플 가격 기준 pool이 두 달을 본다.
  const ymds = monthsBack(currentYmd(), REFRESH_MONTHS);
  const results = await Promise.all(regions.map((code) => refreshRegion(code, ymds)));

  // ② 🔥 전역 수집 — 핫플은 서울+경기 전역이 범위다(2026-09-29 사용자 결정).
  // ⚠️ 캐시가 **가장 오래된 지역부터** 돈다. 데드라인에 걸려 못 돈 지역이 다음 날 맨 앞에 오게 하려는 것
  //    — 고정 순서면 뒤쪽 지역은 영영 못 돌고, 그 지역은 48h 기준선 보호에 걸려 핫플에서 사라진다.
  const hotStarted = Date.now();
  const favSet = new Set(regions);
  const { data: freshRows } = await supabaseAdmin
    .from("trade_raw_cache")
    .select("lawd_cd, fetched_at")
    .eq("deal_ymd", ymds[0]);
  const fetchedAt = new Map((freshRows || []).map((r) => [r.lawd_cd, r.fetched_at]));
  const hotTargets = ALL_REGIONS.map((r) => r.code)
    .filter((c) => !favSet.has(c))
    .sort((a, b) => (fetchedAt.get(a) || "").localeCompare(fetchedAt.get(b) || ""));
  const hotDone = [];
  const hotSkipped = [];
  for (let i = 0; i < hotTargets.length; i += HOT_CHUNK) {
    const chunk = hotTargets.slice(i, i + HOT_CHUNK);
    if (Date.now() - hotStarted > HOT_DEADLINE_MS) {
      hotSkipped.push(...chunk);
      continue;
    }
    const out = await Promise.all(chunk.map((code) => refreshRegion(code, ymds)));
    hotDone.push(...out);
  }

  // ③ 신고 기록 프루닝(30일). 소량·조건부. 실패는 삼킨다 — /api/hot은 7일 창만 읽으므로 무해.
  let pruned;
  try {
    const { error: pErr } = await supabaseAdmin
      .from("trade_reports")
      .delete()
      .lt("reported_on", addDaysYmd(kstDate(), -REPORT_KEEP_DAYS));
    pruned = pErr ? { error: pErr.message } : { ok: true };
  } catch (e) {
    pruned = { error: e.message };
  }

  // ④ 📋 브리핑 워밍 — 위 재수집으로 fetched_at이 올라가 지문이 막 무효화된 참이다.
  // ⚠️ **추세 워밍보다 앞에 둘 것.** 추세 워밍은 WARM_DEADLINE_MS(40s)로 미완주분을
  //    다음 실행에 넘기는 '양보 가능한' 작업이라, 브리핑을 뒤에 두면 데드라인에 밀려
  //    영영 안 돌 수 있다(그러면 매일 첫 방문이 1.5s 라이브 계산으로 떨어진다).
  // 실패는 삼킨다 — 캐시 워밍이 실거래 갱신 cron을 죽이면 안 된다(청약 수집과 같은 방침).
  let briefingWarm;
  try {
    const { cached, computedAt, error: briefErr } = await getBriefing(supabaseAdmin);
    briefingWarm = briefErr ? { error: briefErr } : { cached, computedAt };
  } catch (e) {
    briefingWarm = { error: e.message };
  }

  // ⑤ 추세 3년 캐시 워밍: 최근 2달(위에서 갱신)을 뺀 나머지 창의 미캐시 달만 수집.
  // ⚠️ 전역 수집(②) 도입 후 첫 며칠은 이 단계가 데드라인에 밀릴 수 있다 — 원래 이어받기 설계라 허용.
  const warmYmds = monthsBack(currentYmd(), TREND_WINDOW).slice(REFRESH_MONTHS);
  const trendWarm = [];
  for (const lawdCd of regions) {
    if (Date.now() - started > WARM_DEADLINE_MS) {
      trendWarm.push({ lawdCd, skipped: "deadline" });
      continue;
    }
    try {
      const { fetchedYmds } = await fetchRawMonths(lawdCd, warmYmds);
      trendWarm.push({ lawdCd, fetched: fetchedYmds.length });
    } catch (e) {
      trendWarm.push({ lawdCd, error: e.message });
    }
  }

  return Response.json({
    ok: true,
    refreshedAt: new Date().toISOString(),
    regionCount: regions.length,
    monthsRefreshed: ymds,
    // ⚠️ skipped가 매일 비지 않으면 HOT_CHUNK·HOT_DEADLINE_MS를 다시 볼 것 — 건너뛴 지역은
    //    이튿날 이틀치 신고가 하루로 몰린다(48h 안쪽이면 기록은 된다).
    hotCollect: {
      done: hotDone.length,
      errors: hotDone.filter((r) => r.error).map((r) => `${r.lawdCd}: ${r.error}`),
      skipped: hotSkipped,
      durationMs: Date.now() - hotStarted,
    },
    pruned,
    briefingWarm,
    trendWarm,
    durationMs: Date.now() - started,
    results,
  });
}
