import { test } from "node:test";
import assert from "node:assert/strict";
import { bestFit, buildComplexRows, sortComplexRows } from "../app/lib/complexRows.js";
import { AREA_FILTERS, PRICE_FILTERS, bandFor } from "../app/lib/mapFilters.js";

// 이 파일이 지키는 것: **지도 마커와 리스트 패널이 보는 행이 같은 함수에서 나온다**는 것.
// 예전엔 renderMarkers와 listRows가 필터·집계·대출 계산을 각자 적어, 한쪽 호출부만 인자를
// 빠뜨려도 조용히 갈라졌다(2026-08-14 농특세 사고). build도 npm test도 못 잡던 계열이라
// 파생을 순수 함수로 끌어내 여기서 잠근다.

const ALL_AREA = bandFor(AREA_FILTERS, "all");
const ALL_PRICE = bandFor(PRICE_FILTERS, "all");

const t = (area, dealAmount, dealYmd, buildYear = 2000) => ({ area, dealAmount, dealYmd, buildYear });

const COMPLEXES = [
  {
    umdNm: "비산동",
    aptNm: "가나아파트",
    lat: 37.4,
    lng: 126.9,
    trades: [t(84, 90000, "2026-07-10"), t(84, 100000, "2026-08-01"), t(59, 70000, "2026-07-20")],
  },
  {
    umdNm: "관양동",
    aptNm: "다라아파트",
    lat: null, // 지오코딩 실패 — 리스트엔 남고 핀만 못 찍는다
    lng: null,
    trades: [t(59, 50000, "2026-06-05", 1988)],
  },
];

// ── 기본 파생 ──────────────────────────────────────────────
test("필터를 통과한 거래만 집계하고, 거래가 없는 단지는 행에서 빠진다", () => {
  const rows = buildComplexRows({
    complexes: COMPLEXES,
    lawdCd: "41173",
    areaBand: bandFor(AREA_FILTERS, "m"), // 전용 60~85 → 84㎡만 남고 59㎡는 탈락
    priceBand: ALL_PRICE,
    priceBasis: "recent",
    rankMap: new Map(),
    favSet: new Set(),
    thisYear: 2026,
  });
  assert.equal(rows.length, 1); // 다라아파트는 59㎡뿐이라 통째로 빠진다
  assert.equal(rows[0].c.aptNm, "가나아파트");
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].price, 100000); // recent = 가장 최근 거래가
  assert.equal(rows[0].avg, 95000);
});

test("priceBasis가 avg면 대표가는 평균, 마커용 avg는 언제나 평균", () => {
  const [row] = buildComplexRows({
    complexes: [COMPLEXES[0]],
    lawdCd: "41173",
    areaBand: bandFor(AREA_FILTERS, "m"),
    priceBand: ALL_PRICE,
    priceBasis: "avg",
    rankMap: new Map(),
    favSet: new Set(),
    thisYear: 2026,
  });
  assert.equal(row.price, 95000);
  assert.equal(row.avg, 95000);
});

test("favKey는 lawdCd를 포함한다 — 지역 전환 시 동명 단지가 섞이지 않게", () => {
  const [row] = buildComplexRows({
    complexes: [COMPLEXES[0]],
    lawdCd: "41173",
    areaBand: ALL_AREA,
    priceBand: ALL_PRICE,
    priceBasis: "recent",
    rankMap: new Map(),
    favSet: new Set(["41173|비산동|가나아파트"]),
    thisYear: 2026,
  });
  assert.equal(row.key, "41173|비산동|가나아파트");
  assert.equal(row.isFav, true);
});

test("재건축 연한 배지는 준공 30년 경계에서 켜진다", () => {
  const rows = buildComplexRows({
    complexes: COMPLEXES,
    lawdCd: "41173",
    areaBand: ALL_AREA,
    priceBand: ALL_PRICE,
    priceBasis: "recent",
    rankMap: new Map(),
    favSet: new Set(),
    thisYear: 2026,
  });
  const byName = Object.fromEntries(rows.map((r) => [r.c.aptNm, r]));
  assert.equal(byName["가나아파트"].rebuild, false); // 2000년 준공 = 26년
  assert.equal(byName["다라아파트"].rebuild, true); // 1988년 준공 = 38년
});

// ── 자금 판정 ──────────────────────────────────────────────
// fitFor가 없으면(자금 미설정) 자금 배지가 전부 꺼져야 한다 — "대출 불가"로 오표시하면
// 자금을 넣지 않은 사용자에게 전 단지가 빨갛게 보인다.
test("자금 설정이 없으면 gap·noLoan·buyable이 전부 꺼진다", () => {
  const [row] = buildComplexRows({
    complexes: [COMPLEXES[0]],
    lawdCd: "41173",
    areaBand: ALL_AREA,
    priceBand: ALL_PRICE,
    priceBasis: "recent",
    rankMap: new Map(),
    favSet: new Set(),
    fitFor: null,
    thisYear: 2026,
  });
  assert.equal(row.gap, null);
  assert.equal(row.noLoan, false);
  assert.equal(row.buyable, false);
});

test("자금 설정이 있는데 맞는 평형이 없으면 noLoan(대출 불가)", () => {
  const [row] = buildComplexRows({
    complexes: [COMPLEXES[0]],
    lawdCd: "41173",
    areaBand: ALL_AREA,
    priceBand: ALL_PRICE,
    priceBasis: "recent",
    rankMap: new Map(),
    favSet: new Set(),
    fitFor: () => null, // 어떤 평형도 대출이 안 나오는 상황
    thisYear: 2026,
  });
  assert.equal(row.gap, null);
  assert.equal(row.noLoan, true);
  assert.equal(row.buyable, false);
});

test("여유가 0이면 구매가능이다 (경계 포함)", () => {
  const mk = (gap) =>
    buildComplexRows({
      complexes: [COMPLEXES[0]],
      lawdCd: "41173",
      areaBand: ALL_AREA,
      priceBand: ALL_PRICE,
      priceBasis: "recent",
      rankMap: new Map(),
      favSet: new Set(),
      fitFor: () => ({ gap, monthly: 100 }),
      thisYear: 2026,
    })[0];
  assert.equal(mk(0).buyable, true);
  assert.equal(mk(-1).buyable, false);
  assert.equal(mk(1).buyable, true);
});

// ── bestFit: 같은 평형에서 gap과 monthly가 나와야 한다 ─────────
// ⚠️ 평형을 넘나들며 고르면 "A평형은 살 수 있고 B평형은 월납이 싸다"는 이유로
//    실제로는 못 사는 단지가 통과한다.
test("bestFit은 여유가 가장 큰 평형의 gap과 월납을 함께 돌려준다", () => {
  const hits = [t(59, 50000, "2026-07-01"), t(84, 90000, "2026-07-02")];
  const loanForGroup = (g) => ({
    ln: { maxLoan: 40000, monthlyPayment: g.m2 === 59 ? 120 : 200 },
    gap: g.m2 === 59 ? 500 : 3000,
  });
  const fit = bestFit(hits, { loanForGroup, monthlyCap: Infinity });
  assert.deepEqual(fit, { gap: 3000, monthly: 200 }); // 84㎡ 쪽 — 월납도 그 평형 것
});

test("월납 상한을 넘는 평형은 후보에서 빠진다", () => {
  const hits = [t(59, 50000, "2026-07-01"), t(84, 90000, "2026-07-02")];
  const loanForGroup = (g) => ({
    ln: { maxLoan: 40000, monthlyPayment: g.m2 === 59 ? 120 : 200 },
    gap: g.m2 === 59 ? 500 : 3000,
  });
  const fit = bestFit(hits, { loanForGroup, monthlyCap: 150 });
  assert.deepEqual(fit, { gap: 500, monthly: 120 }); // 84㎡는 월 200이라 탈락
});

test("대출 한도가 0 이하인 평형은 후보가 아니다", () => {
  const hits = [t(84, 90000, "2026-07-02")];
  const loanForGroup = () => ({ ln: { maxLoan: 0, monthlyPayment: 10 }, gap: 9999 });
  assert.equal(bestFit(hits, { loanForGroup, monthlyCap: Infinity }), null);
});

// ── 정렬 ───────────────────────────────────────────────────
// ⚠️ 입력 배열은 지도 마커와 공유하므로 in-place 정렬이면 핀 렌더 순서가 흔들린다.
test("정렬은 원본을 건드리지 않는다 (마커와 공유하는 배열)", () => {
  const rows = [
    { price: 3, count: 1, yoy: 1, buildYear: 2000, gap: 1 },
    { price: 1, count: 2, yoy: 9, buildYear: 1990, gap: 5 },
  ];
  const before = [...rows];
  const sorted = sortComplexRows(rows, "priceAsc");
  assert.deepEqual(rows, before); // 원본 순서 유지
  assert.equal(sorted[0].price, 1);
});

test("값이 없는 행(yoy·gap null)은 항상 뒤로 간다", () => {
  const rows = [
    { price: 1, count: 1, yoy: null, buildYear: 2000, gap: null },
    { price: 2, count: 1, yoy: 5, buildYear: 2000, gap: 100 },
  ];
  assert.equal(sortComplexRows(rows, "yoy")[0].yoy, 5);
  assert.equal(sortComplexRows(rows, "gap")[0].gap, 100);
});

test("준공 오래된순은 연도 미상을 뒤로 보낸다", () => {
  const rows = [
    { price: 1, count: 1, yoy: 0, buildYear: null, gap: 0 },
    { price: 1, count: 1, yoy: 0, buildYear: 1985, gap: 0 },
  ];
  assert.equal(sortComplexRows(rows, "old")[0].buildYear, 1985);
});

test("모르는 정렬 키는 원래 순서를 그대로 둔다", () => {
  const rows = [{ price: 2 }, { price: 1 }];
  assert.equal(sortComplexRows(rows, "없는키")[0].price, 2);
});
