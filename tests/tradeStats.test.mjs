import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toPyeong, excludeAbnormal, median, groupByPyeong, summarize,
} from "../app/lib/tradeStats.js";

// ── 평 환산 ────────────────────────────────────────────────
// 화면의 "N평"은 전용이 아니라 **공급** 기준이다. 사람들이 부르는 이름과 맞는지가 전부.
test("국민평형: 전용 84~85㎡는 34평", () => {
  assert.equal(toPyeong(84), 34);
  assert.equal(toPyeong(84.96), 34); // 실제 국평 전용면적
  assert.equal(toPyeong(85), 34);
});

test("흔한 평형이 통념과 맞는다", () => {
  assert.equal(toPyeong(59.98), 24); // 59타입
  assert.equal(toPyeong(74.9), 30); // 74타입
  assert.equal(toPyeong(114.9), 46);
});

// 면적 필터 라벨(~24평 / 24~34평 / 34~54평 / 54평~)이 경계 ㎡와 어긋나면
// "24평 이하"를 골랐는데 25평이 섞이는 식으로 사용자가 속는다.
test("면적 필터 경계값이 라벨과 일치", () => {
  assert.equal(toPyeong(60), 24);
  assert.equal(toPyeong(85), 34);
  assert.equal(toPyeong(135), 54);
});

test("전용면적을 그대로 나눈 값보다 크다(공급 기준이므로)", () => {
  assert.ok(toPyeong(84) > Math.round(84 / 3.3058));
});

// ── 이상치 제외 ────────────────────────────────────────────
const t = (over) => ({ dealAmount: 50000, area: 84, dealYmd: "2026-05-01", ...over });

test("해제거래(cdealType=O)를 뺀다", () => {
  const r = excludeAbnormal([t({}), t({ cdealType: "O" }), t({ cdealType: " " })]);
  assert.equal(r.trades.length, 2);
  assert.equal(r.cancelled, 1);
});

test("직거래를 뺀다", () => {
  const r = excludeAbnormal([
    t({ dealingGbn: "중개거래" }),
    t({ dealingGbn: "직거래" }),
    t({ dealingGbn: "직거래" }),
  ]);
  assert.equal(r.trades.length, 1);
  assert.equal(r.direct, 2);
});

test("필드가 없는 옛 캐시 행은 그대로 통과", () => {
  const r = excludeAbnormal([t({}), t({})]);
  assert.equal(r.trades.length, 2);
  assert.equal(r.cancelled + r.direct, 0);
});

test("빈 입력·null을 견딘다", () => {
  assert.deepEqual(excludeAbnormal([]), { trades: [], cancelled: 0, direct: 0, removed: [] });
  assert.deepEqual(excludeAbnormal(null), { trades: [], cancelled: 0, direct: 0, removed: [] });
});

// 시장 신호는 "걸러낸 것"을 지표로 쓴다. 걸러낸 결과를 버리면 신호를 만들 수 없어,
// excludeAbnormal이 제외 사유와 함께 배열로 돌려준다(2026-08-03).
test("excludeAbnormal이 제외한 거래를 사유와 함께 돌려준다", () => {
  const raw = [
    { aptNm: "가", dealAmount: 50000, cdealType: "", dealingGbn: "중개거래" },
    { aptNm: "나", dealAmount: 60000, cdealType: "O", dealingGbn: "중개거래" },
    { aptNm: "다", dealAmount: 30000, cdealType: "", dealingGbn: "직거래" },
  ];
  const r = excludeAbnormal(raw);

  assert.equal(r.trades.length, 1);
  assert.equal(r.trades[0].aptNm, "가");
  assert.equal(r.cancelled, 1);
  assert.equal(r.direct, 1);

  assert.equal(r.removed.length, 2);
  assert.deepEqual(
    r.removed.map((t) => [t.aptNm, t.reason]),
    [["나", "cancelled"], ["다", "direct"]]
  );
});

// 해제가 직거래보다 먼저 판정된다 — 둘 다 해당하면 해제로 한 번만 센다.
test("해제이면서 직거래인 거래는 해제로 한 번만 집계", () => {
  const r = excludeAbnormal([{ cdealType: "O", dealingGbn: "직거래" }]);
  assert.equal(r.cancelled, 1);
  assert.equal(r.direct, 0);
  assert.equal(r.removed.length, 1);
  assert.equal(r.removed[0].reason, "cancelled");
});

// ── 중앙값 ─────────────────────────────────────────────────
test("중앙값은 이상치 하나에 끌려가지 않는다", () => {
  // 추세 그래프가 중앙값을 쓰는 이유 그 자체 — 평균이면 6.5억으로 튄다.
  const normal = [50000, 51000, 52000];
  assert.equal(median(normal), 51000);
  const withOutlier = [50000, 51000, 52000, 150000];
  assert.equal(median(withOutlier), 51500);
  const avg = withOutlier.reduce((s, v) => s + v, 0) / withOutlier.length;
  assert.ok(Math.abs(median(withOutlier) - 51000) < Math.abs(avg - 51000));
});

test("중앙값 기본 동작", () => {
  assert.equal(median([3, 1, 2]), 2); // 정렬되지 않은 입력
  assert.equal(median([1, 2, 3, 4]), 2.5); // 짝수 개
  assert.equal(median([7]), 7);
  assert.equal(median([]), null);
});

// ── 집계 ───────────────────────────────────────────────────
test("groupByPyeong이 공급 평형을 붙이고 면적 오름차순으로 준다", () => {
  const rows = groupByPyeong([
    t({ area: 84.96, dealAmount: 90000, dealYmd: "2026-05-02" }),
    t({ area: 59.98, dealAmount: 60000, dealYmd: "2026-05-01" }),
    t({ area: 84.9, dealAmount: 92000, dealYmd: "2026-05-09" }),
  ]);
  assert.deepEqual(rows.map((r) => r.m2), [60, 85]);
  assert.deepEqual(rows.map((r) => r.pyeong), [24, 34]);
  assert.equal(rows[1].count, 2);
  assert.equal(rows[1].recentAmount, 92000); // 가장 최근 거래가
});

test("summarize는 빈 배열에 null", () => {
  assert.equal(summarize([]), null);
});
