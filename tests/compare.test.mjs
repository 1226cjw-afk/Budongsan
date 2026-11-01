import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPARE_MAX, COMPARE_MONTHS, compareKey, sanitizeCompareList, addToCompare, removeFromCompare,
  summarizeComplex, pickBasePyeong, allPyeongs, groupForPyeong, bestIndex,
} from "../app/lib/compare.js";

// 이 파일이 지키는 것: ⚖️ 비교 탭의 숫자가 **지도와 같은 기준**으로 나온다는 것
// (공급평 환산 · 중앙값 · /api/rank와 같은 상승률 정의 · 농특세 판정용 면적), 그리고
// 담기 목록이 localStorage의 어떤 값에도 깨지지 않는다는 것.

// 2026-11 기준 15개월 내림차순(monthsBack("202611", 15)와 같은 모양)
const YMDS = [
  "202611", "202610", "202609", "202608", "202607", "202606", "202605", "202604",
  "202603", "202602", "202601", "202512", "202511", "202510", "202509",
];
const t = (area, dealAmount, dealYmd, buildYear = 1993) => ({ area, dealAmount, dealYmd, buildYear });
const A = { lawdCd: "41173", umdNm: "평촌동", aptNm: "초원한양" };
const B = { lawdCd: "41173", umdNm: "평촌동", aptNm: "꿈우성" };

test("COMPARE_MONTHS는 12개월 + 상승률 과거 창 3개월", () => {
  assert.equal(COMPARE_MONTHS, YMDS.length);
});

test("sanitizeCompareList — 잘못된 값·중복을 버리고 상한을 지킨다", () => {
  const raw = [A, A, { ...A, lawdCd: "4117" }, null, "x", { lawdCd: "41173", umdNm: "", aptNm: "x" }, B,
    { ...B, aptNm: "c" }, { ...B, aptNm: "d" }, { ...B, aptNm: "e" }];
  const out = sanitizeCompareList(raw);
  assert.equal(out.length, COMPARE_MAX);
  assert.deepEqual(out[0], A);
  assert.deepEqual(out[1], B);
  assert.deepEqual(sanitizeCompareList({ not: "array" }), []);
  assert.deepEqual(sanitizeCompareList(null), []);
});

test("addToCompare — 중복은 무시, 꽉 차면 밀어내지 않고 full을 알린다", () => {
  let r = addToCompare([], A);
  assert.equal(r.added, true);
  r = addToCompare(r.list, A);
  assert.equal(r.added, false);
  assert.equal(r.list.length, 1);
  const full = [A, B, { ...B, aptNm: "c" }, { ...B, aptNm: "d" }];
  r = addToCompare(full, { ...B, aptNm: "e" });
  assert.equal(r.full, true);
  assert.equal(r.list, full); // 같은 배열 그대로 — 아무것도 밀려나지 않았다
  assert.deepEqual(removeFromCompare(full, compareKey(B)).map((x) => x.aptNm), ["초원한양", "c", "d"]);
});

test("summarizeComplex — 공급평으로 묶고 중앙값·최근가·평당가를 낸다", () => {
  const trades = [
    t(84.9, 90000, "2026-10-03"),
    t(85.1, 100000, "2026-09-10"), // 84.9와 같은 34평 → 한 묶음
    t(84.9, 300000, "2026-08-01"), // 이상치 — 중앙값이라 끌려가지 않는다
    t(59.9, 60000, "2026-10-20"),
    t(84.9, 50000, "2025-09-15"), // 12개월 밖(상승률 과거 창) — 시세 집계엔 안 들어간다
  ];
  const s = summarizeComplex(trades, YMDS);
  assert.equal(s.count, 4);
  assert.deepEqual(s.groups.map((g) => g.pyeong), [24, 34]);
  const g34 = s.groups.find((g) => g.pyeong === 34);
  assert.equal(g34.count, 3);
  assert.equal(g34.median, 100000);
  assert.equal(g34.recentAmount, 90000);
  assert.equal(g34.recentDate, "2026-10-03");
  assert.equal(g34.perPyeong, Math.round(100000 / 34));
  // ⚠️ 농특세(85㎡ 초과) 판정용 면적은 묶음 안의 **최대** 전용 — 작은 쪽이면 세금이 빠진다
  assert.equal(g34.m2, 85.1);
  assert.equal(s.buildYear, 1993);
});

test("summarizeComplex — 월별 추세는 과거→현재 12칸, 거래 없는 달은 null", () => {
  const s = summarizeComplex([t(84, 90000, "2026-10-03"), t(84, 110000, "2026-10-20")], YMDS);
  const ser = s.series[34];
  assert.equal(ser.length, 12);
  assert.equal(ser[0].ymd, "202512");
  assert.equal(ser[11].ymd, "202611"); // 이번 달까지(신고 지연으로 비어 있을 수 있다)
  const oct = ser.find((p) => p.ymd === "202610");
  assert.deepEqual(oct, { ymd: "202610", value: 100000, count: 2 });
  assert.equal(ser.find((p) => p.ymd === "202609").value, null);
});

test("상승률 — /api/rank와 같은 정의(최근 3개월 vs 12~14개월 전, ㎡당가, 창별 2건 이상)", () => {
  const trades = [
    t(84, 110000, "2026-11-01"), t(84, 110000, "2026-09-30"), // 최근 창(202611~202609)
    t(84, 100000, "2025-11-05"), t(84, 100000, "2025-09-01"), // 과거 창(202511~202509)
    t(84, 999999, "2026-03-01"), // 두 창 밖 — 무시
  ];
  assert.equal(summarizeComplex(trades, YMDS).yoyPct, 10);
  // 과거 창 1건뿐 → 신뢰 불가 null
  assert.equal(summarizeComplex(trades.slice(0, 3), YMDS).yoyPct, null);
});

test("pickBasePyeong — 가장 많은 단지에 있는 평형, 동률이면 거래 많은 쪽", () => {
  const e = (groups) => ({ summary: { groups } });
  const entries = [
    e([{ pyeong: 24, count: 9 }, { pyeong: 34, count: 2 }]),
    e([{ pyeong: 34, count: 3 }]),
    e([{ pyeong: 24, count: 1 }, { pyeong: 34, count: 1 }]),
  ];
  assert.equal(pickBasePyeong(entries), 34); // 34평은 3곳, 24평은 2곳
  assert.equal(pickBasePyeong([e([{ pyeong: 24, count: 5 }]), e([{ pyeong: 32, count: 9 }])]), 32);
  assert.equal(pickBasePyeong([{ summary: null }]), null);
  assert.deepEqual(allPyeongs(entries), [24, 34]);
});

test("groupForPyeong — 정확히 없으면 ±2평 안의 가장 가까운 평형을 대신(exact=false)", () => {
  const s = { groups: [{ pyeong: 24, count: 1 }, { pyeong: 32, count: 4 }, { pyeong: 36, count: 9 }] };
  assert.deepEqual(groupForPyeong(s, 24), { group: s.groups[0], exact: true });
  // 34 → 32(거리 2, 4건) vs 36(거리 2, 9건) 동거리 → 거래 많은 36
  assert.equal(groupForPyeong(s, 34).group.pyeong, 36);
  assert.equal(groupForPyeong(s, 34).exact, false);
  assert.equal(groupForPyeong(s, 28), null); // 24·32 모두 4평 차 — 대신하지 않는다
  assert.equal(groupForPyeong(null, 34), null);
});

test("bestIndex — 값 2개 미만·동률이면 강조하지 않는다", () => {
  assert.equal(bestIndex([3, 1, 2], "min"), 1);
  assert.equal(bestIndex([3, 1, 2], "max"), 0);
  assert.equal(bestIndex([null, 1, undefined], "min"), -1);
  assert.equal(bestIndex([1, 1, 2], "min"), -1);
  assert.equal(bestIndex([null, 5, 7], "max"), 2);
});
