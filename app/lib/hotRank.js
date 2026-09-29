// 🔥 핫플 단지 — trade_reports 집계(서버) + 칩별 순위(클라). 순수 함수, supabase 미의존.
// ⚠️ 확장자 import 유지 — raw node 단독 테스트 대상이다.
//
// ⚠️ **가점·임계값은 임시값이다**(2026-09-29). 이 프로젝트의 임계값(뉴스 중요도·요주의 단지)은
//    전부 실측으로 정했는데, trade_reports는 배포일부터 쌓여 지금은 잴 데이터가 없다.
//    7일치가 쌓이면 분포를 재서 확정할 것 — PROGRESS 2026-09-29 백로그.

import { toPyeong } from "./tradeStats.js";
import { regionName } from "./regions.js";
import { matchesComplexName } from "./mapFilters.js";

export const HOT_PRICE_MIN_REPORTS = 2; // 가격 칩·가격 가점은 신고 2건 이상만(1건 튀는 값 방지)
export const HOT_MAX_ROWS = 10;
export const HOT_JUMP_BONUS = [ // 위에서부터 첫 매칭
  { pct: 10, pts: 3 },
  { pct: 5, pts: 2 },
];
export const HOT_NEWS_BONUS = 2;

const num = (v) => (v == null || v === "" ? null : Number(v)); // ⚠️ PostgREST numeric은 문자열로 올 수 있다

// trade_reports 행(snake_case) → 단지별 요약(신고 건수 내림차순).
// ⚠️ 해제·직거래는 여기서 뺀다 — 2026-09-18 송파해링턴타워 공공기관 직거래 170건이 하루에 몰렸다.
export function summarizeReports(rows) {
  const m = new Map();
  for (const r of rows || []) {
    if (r.cdeal_type === "O" || r.dealing_gbn === "직거래") continue;
    const key = `${r.lawd_cd}|${r.umd_nm}|${r.apt_nm}`;
    let c = m.get(key);
    if (!c) {
      c = { key, lawdCd: r.lawd_cd, umdNm: r.umd_nm, aptNm: r.apt_nm, reports: 0, latest: null, jump: null };
      m.set(key, c);
    }
    c.reports += 1;
    const amount = num(r.amount);
    const area = num(r.area);
    if (!c.latest || r.deal_ymd > c.latest.dealYmd) c.latest = { dealYmd: r.deal_ymd, amount, area };
    const ref = num(r.ref_median);
    if (ref > 0 && amount > 0) {
      const pct = Math.round(((amount - ref) / ref) * 1000) / 10;
      if (!c.jump || pct > c.jump.pct) c.jump = { pct, amount, refMedian: ref, pyeong: toPyeong(area) };
    }
  }
  return [...m.values()].sort((a, b) => b.reports - a.reports || a.key.localeCompare(b.key));
}

// 뉴스 요주의 단지(newsWatch) ↔ 실거래 단지. ⚠️ **같은 지역일 때만** — 이름만 보면 구로 '주공1'에
// 노원 뉴스가 붙는다. 뉴스 이름과 실거래명은 자주 다르다(구로주공↔주공1, 2026-09-02 실측)는 전제라
// 매칭 실패는 흔하고, 실패한 뉴스 단지는 '뉴스' 칩에만 나온다.
export function matchNews(c, watch) {
  const rn = regionName(c.lawdCd);
  return (watch || []).find((w) => w.lawdCd === c.lawdCd && matchesComplexName(c.aptNm, w.name, rn)) || null;
}

export function hotScore(c, newsHit) {
  let s = c.reports;
  if (c.jump && c.reports >= HOT_PRICE_MIN_REPORTS) {
    const b = HOT_JUMP_BONUS.find((x) => c.jump.pct >= x.pct);
    if (b) s += b.pts;
  }
  if (newsHit) s += HOT_NEWS_BONUS;
  return s;
}

export function rankHot({ complexes, watch, chip }) {
  if (chip === "news") {
    return (watch || []).map((w) => ({ kind: "news", key: `news|${w.name}`, news: w }));
  }
  const rows = (complexes || []).map((c) => {
    const newsHit = matchNews(c, watch);
    return { kind: "trade", key: c.key, c, newsHit, score: hotScore(c, newsHit) };
  });
  const byKey = (a, b) => a.key.localeCompare(b.key);
  let out;
  if (chip === "trade") {
    out = rows.sort((a, b) => b.c.reports - a.c.reports || byKey(a, b));
  } else if (chip === "price") {
    out = rows
      .filter((r) => r.c.jump && r.c.jump.pct > 0 && r.c.reports >= HOT_PRICE_MIN_REPORTS)
      .sort((a, b) => b.c.jump.pct - a.c.jump.pct || byKey(a, b));
  } else {
    out = rows.sort((a, b) => b.score - a.score || b.c.reports - a.c.reports || byKey(a, b));
  }
  return out.slice(0, HOT_MAX_ROWS);
}
