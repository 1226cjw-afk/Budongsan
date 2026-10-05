// 🔥 핫플 단지 — trade_reports 집계(서버) + 칩별 순위(클라). 순수 함수, supabase 미의존.
// ⚠️ 확장자 import 유지 — raw node 단독 테스트 대상이다.
//
// 가점·임계값은 2026-10-05 실측으로 확정했다(배포 9/29 이후 6일치 2,129행, 해제·직거래 제외 1,610곳).
//   - 단지별 신고 건수(이번 주): p50 1 · p90 2 · p99 4 · max 6 → 가점 2~3이 건수 1~2건 차이를 뒤집는 정도.
//   - ⚠️ **가격 지표는 단지 거래들의 *중앙값*이다(최댓값 아님).** 최댓값이던 시절엔 신고가 많을수록 max가
//     커져 가점이 신고 건수를 한 번 더 셌다 — 기준가 2건↑ 단지 중 max≥5%가 109곳(46%), 종합 상위 10이
//     오늘·이번 주 모두 10/10 가격 가점이었다(2026-10-03 중간 실측). 중앙값으로는 239곳 중
//     ≥5% **38곳(16%)** · ≥10% **8곳(3%)** · p50 1.2% · p75 3.8% · p90 6.7% → 5·10% 문턱 유지.
//   - ⚠️ "2건 이상"은 **기준가(ref_median)가 있는 신고** 기준이다. 전체 신고 수로 세면 기준가 없는 한 건 +
//     30% 튄 한 건이 "2건"으로 통과한다(호평마을금강 30.1%가 단 1건이었다).
//   - ⚠️ 동점 처리: 하루치 455곳 중 419곳이 1건이라 동점이 대부분이다. 예전엔 동점을 `key` 사전순
//     (= 지역코드순)으로 잘라 "오늘 1~4위 전부 부천 원미구"가 나왔다 → 가격 중앙값 → 최근 계약일 순.

import { toPyeong, median } from "./tradeStats.js";
import { regionName } from "./regions.js";
import { matchesComplexName } from "./mapFilters.js";

export const HOT_PRICE_MIN_REPORTS = 2; // 가격 칩·가격 가점은 기준가 있는 신고 2건 이상만
export const HOT_MAX_ROWS = 10;
export const HOT_JUMP_BONUS = [ // 위에서부터 첫 매칭
  { pct: 10, pts: 3 },
  { pct: 5, pts: 2 },
];
export const HOT_NEWS_BONUS = 2;
// 오늘 신고 단지가 이보다 적으면 기본 창을 '이번 주'로. 평일 400~600곳 vs 주말·공휴일 5~38곳
// (2026-10-03 개천절·10-05 대체공휴일 실측 — 국토부 공개가 쉰다).
export const HOT_TODAY_MIN = 30;

const num = (v) => (v == null || v === "" ? null : Number(v)); // ⚠️ PostgREST numeric은 문자열로 올 수 있다
const round1 = (x) => Math.round(x * 10) / 10;

// trade_reports 행(snake_case) → 단지별 요약(신고 건수 내림차순).
// ⚠️ 해제·직거래는 여기서 뺀다 — 2026-09-18 송파해링턴타워 공공기관 직거래 170건이 하루에 몰렸다.
// jump = { pct: 기준가 대비 상승률의 중앙값, n: 기준가 있는 신고 수, pyeong: 그 신고들이 한 평형이면 그 평 }
export function summarizeReports(rows) {
  const m = new Map();
  for (const r of rows || []) {
    if (r.cdeal_type === "O" || r.dealing_gbn === "직거래") continue;
    const key = `${r.lawd_cd}|${r.umd_nm}|${r.apt_nm}`;
    let c = m.get(key);
    if (!c) {
      c = { key, lawdCd: r.lawd_cd, umdNm: r.umd_nm, aptNm: r.apt_nm, reports: 0, latest: null, jump: null, _pcts: [] };
      m.set(key, c);
    }
    c.reports += 1;
    const amount = num(r.amount);
    const area = num(r.area);
    if (!c.latest || r.deal_ymd > c.latest.dealYmd) c.latest = { dealYmd: r.deal_ymd, amount, area };
    const ref = num(r.ref_median);
    if (ref > 0 && amount > 0) c._pcts.push({ pct: ((amount - ref) / ref) * 100, pyeong: toPyeong(area) });
  }
  const out = [];
  for (const c of m.values()) {
    const { _pcts, ...rest } = c;
    if (_pcts.length) {
      const pys = new Set(_pcts.map((p) => p.pyeong));
      rest.jump = {
        pct: round1(median(_pcts.map((p) => p.pct))),
        n: _pcts.length,
        pyeong: pys.size === 1 ? _pcts[0].pyeong : null,
      };
    }
    out.push(rest);
  }
  return out.sort((a, b) => b.reports - a.reports || tieBreak(a, b));
}

// 가격 가점·가격 칩에 쓸 수 있는 점프(기준가 있는 신고 2건↑ + 상승)만. 화면 배지도 이걸 본다.
export const priceJump = (c) =>
  c.jump && c.jump.n >= HOT_PRICE_MIN_REPORTS && c.jump.pct > 0 ? c.jump : null;

// 동점 정렬 — 가격 중앙값(기준가 있는 것만) → 최근 계약일 → key. key는 결정성만을 위한 마지막 수단.
function tieBreak(a, b) {
  const pa = a.jump?.pct ?? -Infinity;
  const pb = b.jump?.pct ?? -Infinity;
  if (pa !== pb) return pb - pa;
  const da = a.latest?.dealYmd || "";
  const db = b.latest?.dealYmd || "";
  if (da !== db) return da < db ? 1 : -1;
  return a.key.localeCompare(b.key);
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
  const j = priceJump(c);
  if (j) {
    const b = HOT_JUMP_BONUS.find((x) => j.pct >= x.pct);
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
  const tie = (a, b) => tieBreak(a.c, b.c);
  let out;
  if (chip === "trade") {
    out = rows.sort((a, b) => b.c.reports - a.c.reports || tie(a, b));
  } else if (chip === "price") {
    out = rows
      .filter((r) => priceJump(r.c))
      .sort((a, b) => b.c.jump.pct - a.c.jump.pct || b.c.reports - a.c.reports || tie(a, b));
  } else {
    out = rows.sort((a, b) => b.score - a.score || b.c.reports - a.c.reports || tie(a, b));
  }
  return out.slice(0, HOT_MAX_ROWS);
}
