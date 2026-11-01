// ⚖️ 단지 비교 — 순수 로직(서버 라우트 /api/compare와 비교 탭이 함께 쓴다).
//
// 왜 이 탭이 생겼나(2026-11-01): 사용자가 갈아타기 후보를 Claude 대화로 비교해 왔다
// (평촌 4개 단지 · 경희궁자이4단지 vs 샛별한양 2·3단지). 그 비교를 앱 데이터로 **매일 갱신되는 화면**에
// 두려는 것. 숫자는 지도와 같은 원천·같은 기준(해제·직거래 제외, 중앙값, 공급평, loanCalcFor)을 쓴다.
//
// ⚠️ 확장자 import 유지 — raw node(npm test)가 확장자 없는 경로를 못 찾는다(complexRows.js와 같은 규칙).
// ⚠️ supabase 의존 금지 — 클라 번들 + 테스트 대상이다. 수집은 라우트가, 집계는 여기서.

import { favKey, median, toPyeong } from "./tradeStats.js";

export const COMPARE_KEY = "re_compare_list"; // localStorage — 담은 단지 [{lawdCd, umdNm, aptNm}]
export const COMPARE_EVENT = "re-compare-change"; // 같은 탭 안의 변경 알림(storage 이벤트는 다른 탭만 온다)
export const COMPARE_MAX = 4; // 4곳 넘으면 모바일에서 열이 읽히지 않는다(열 최소폭 ≈110px)

// 비교 창: 최근 12개월(시세·거래량·추세) + 상승률용으로 12~14개월 전 3개월을 더해 15개월.
// ⚠️ 상승률은 /api/rank와 **같은 정의**다(최근 3개월 vs 12~14개월 전 3개월의 ㎡당가 평균, 창별 2건 미만 null).
//    다르게 세면 지도 리스트의 "1년 +N%"와 비교 탭 숫자가 갈린다.
export const COMPARE_MONTHS = 15;
export const PRICE_MONTHS = 12;
const YOY_WINDOW = 3;
const YOY_MIN = 2;

export const compareKey = (it) => favKey(it.lawdCd, it.umdNm, it.aptNm);

// ── 담기 목록 ──────────────────────────────────────────────

// localStorage 원본(아무 값이나 올 수 있다) → 유효한 항목만, 중복 제거, 상한 적용.
export function sanitizeCompareList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const lawdCd = String(x.lawdCd || "");
    const umdNm = String(x.umdNm || "");
    const aptNm = String(x.aptNm || "");
    if (!/^\d{5}$/.test(lawdCd) || !umdNm || !aptNm) continue;
    const item = { lawdCd, umdNm, aptNm };
    const k = compareKey(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    if (out.length >= COMPARE_MAX) break;
  }
  return out;
}

// 담기. 이미 있으면 그대로, 꽉 찼으면 full=true로 알리고 목록은 그대로 둔다
// (가장 오래된 것을 몰래 밀어내면 사용자가 고른 비교 대상이 말없이 사라진다).
export function addToCompare(list, item) {
  const clean = sanitizeCompareList([item]);
  if (!clean.length) return { list, added: false, full: false };
  const k = compareKey(clean[0]);
  if (list.some((x) => compareKey(x) === k)) return { list, added: false, full: false };
  if (list.length >= COMPARE_MAX) return { list, added: false, full: true };
  return { list: [...list, clean[0]], added: true, full: false };
}

export function removeFromCompare(list, key) {
  return list.filter((x) => compareKey(x) !== key);
}

// ── 단지 한 곳 집계 ─────────────────────────────────────────

// trades: fetchRawMonths가 해제·직거래를 걷어낸 거래 [{area, dealAmount, dealYmd "YYYY-MM-DD", buildYear}]
// ymds: 비교 창 YYYYMM **내림차순**(monthsBack 결과, [0] = 이번 달), 길이 COMPARE_MONTHS.
// 반환 {count, buildYear, yoyPct, groups[], series{pyeong: [{ymd, value, count}] 과거→현재}}.
// groups는 **공급평 단위**로 묶는다 — 84㎡와 85㎡는 둘 다 34평이고, 비교 화면에선 "34평끼리"가 기준이다.
export function summarizeComplex(trades, ymds) {
  const priceYmds = new Set(ymds.slice(0, PRICE_MONTHS));
  const ym = (t) => (t.dealYmd || "").slice(0, 7).replace("-", "");
  const inPrice = (trades || []).filter((t) => t.area > 0 && t.dealAmount > 0 && priceYmds.has(ym(t)));

  // 공급평별 묶음
  const byPy = new Map();
  for (const t of inPrice) {
    const py = toPyeong(t.area);
    if (!byPy.has(py)) byPy.set(py, []);
    byPy.get(py).push(t);
  }
  const groups = [...byPy.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pyeong, arr]) => {
      const recent = arr.reduce((a, b) => (a.dealYmd >= b.dealYmd ? a : b));
      const med = median(arr.map((t) => t.dealAmount));
      return {
        pyeong,
        // 대출 계산(농특세 85㎡ 판정)에 넘길 전용면적 — 묶음 안에서 가장 큰 것.
        // ⚠️ 84.9와 85.1이 같은 34평으로 묶일 수 있는데, 작은 쪽을 넘기면 85㎡ 초과분의 농특세가 빠진다
        //    (2026-08-14 농특세 사고와 같은 방향의 오차). 보수적으로 큰 쪽을 쓴다.
        m2: Math.max(...arr.map((t) => t.area)),
        count: arr.length,
        median: Math.round(med),
        recentAmount: recent.dealAmount,
        recentDate: recent.dealYmd,
        perPyeong: Math.round(med / pyeong), // 평당가(만원) — 평형이 달라도 비교 가능한 축
      };
    });

  // 월별 중앙값 추세(평형별). 추세 차트는 같은 평형끼리만 겹쳐 그린다.
  const asc = ymds.slice(0, PRICE_MONTHS).reverse();
  const series = {};
  for (const [pyeong, arr] of byPy) {
    series[pyeong] = asc.map((y) => {
      const hits = arr.filter((t) => ym(t) === y).map((t) => t.dealAmount);
      return { ymd: y, value: hits.length ? Math.round(median(hits)) : null, count: hits.length };
    });
  }

  return {
    count: inPrice.length,
    buildYear: Number(inPrice[0]?.buildYear || (trades || [])[0]?.buildYear) || null,
    yoyPct: yoyPct(trades, ymds, ym),
    groups,
    series,
  };
}

// /api/rank와 같은 정의의 1년 상승률(%, 소수 1자리) — 위 COMPARE_MONTHS 주석 참조.
function yoyPct(trades, ymds, ym) {
  const recent = new Set(ymds.slice(0, YOY_WINDOW));
  const past = new Set(ymds.slice(12, 12 + YOY_WINDOW));
  let rs = 0, rn = 0, ps = 0, pn = 0;
  for (const t of trades || []) {
    if (!t.area || !t.dealAmount) continue;
    const y = ym(t);
    if (recent.has(y)) { rs += t.dealAmount / t.area; rn += 1; }
    else if (past.has(y)) { ps += t.dealAmount / t.area; pn += 1; }
  }
  if (rn < YOY_MIN || pn < YOY_MIN) return null;
  return Math.round((rs / rn / (ps / pn) - 1) * 1000) / 10;
}

// ── 여러 단지 비교 ──────────────────────────────────────────

// 기준 평형 자동 선택: 가장 많은 단지에 있는 평형, 동률이면 거래가 많은 평형.
// (평촌·경희궁자이 비교가 전부 "34평끼리"였듯 사람은 같은 평형을 나란히 본다.)
export function pickBasePyeong(entries) {
  const presence = new Map(); // pyeong → {n, count}
  for (const e of entries) {
    for (const g of e?.summary?.groups || []) {
      const p = presence.get(g.pyeong) || { n: 0, count: 0 };
      p.n += 1;
      p.count += g.count;
      presence.set(g.pyeong, p);
    }
  }
  let best = null;
  for (const [pyeong, p] of presence) {
    if (!best || p.n > best.n || (p.n === best.n && p.count > best.count)) best = { pyeong, ...p };
  }
  return best ? best.pyeong : null;
}

// 모든 단지에 나타난 평형 목록(오름차순) — 기준 평형 칩.
export function allPyeongs(entries) {
  const s = new Set();
  for (const e of entries) for (const g of e?.summary?.groups || []) s.add(g.pyeong);
  return [...s].sort((a, b) => a - b);
}

export const NEAR_PYEONG = 2; // 정확히 그 평형이 없을 때 ±2평까지는 "비슷한 평형"으로 대신 보여준다

// 한 단지에서 기준 평형에 해당하는 묶음. 정확히 일치 → 없으면 ±NEAR_PYEONG 안에서 가장 가까운 것
// (같은 거리면 거래 많은 쪽). 반환 {group, exact} 또는 null.
// ⚠️ 대체 평형은 화면에 "(32평)"처럼 실제 평형을 반드시 드러낼 것 — 숨기면 32평 가격이 34평 칸에 앉는다.
export function groupForPyeong(summary, pyeong) {
  const groups = summary?.groups || [];
  const exact = groups.find((g) => g.pyeong === pyeong);
  if (exact) return { group: exact, exact: true };
  let best = null;
  for (const g of groups) {
    const d = Math.abs(g.pyeong - pyeong);
    if (d > NEAR_PYEONG) continue;
    if (!best || d < best.d || (d === best.d && g.count > best.g.count)) best = { g, d };
  }
  return best ? { group: best.g, exact: false } : null;
}

// 한 행에서 "가장 좋은" 칸의 인덱스. dir = "min" | "max".
// 값이 2개 미만이거나 최상값이 여럿(동률)이면 -1 — 강조가 아무것도 가리키지 못하는 경우다.
export function bestIndex(values, dir) {
  const valid = values.map((v, i) => [v, i]).filter(([v]) => Number.isFinite(v));
  if (valid.length < 2) return -1;
  const target = dir === "min" ? Math.min(...valid.map(([v]) => v)) : Math.max(...valid.map(([v]) => v));
  const hits = valid.filter(([v]) => v === target);
  return hits.length === 1 ? hits[0][1] : -1;
}
