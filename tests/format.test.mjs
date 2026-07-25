import { test } from "node:test";
import assert from "node:assert/strict";
import { monthsToLabel } from "../app/lib/format.js";

test("12개월 미만은 개월로", () => {
  assert.equal(monthsToLabel(1), "약 1개월");
  assert.equal(monthsToLabel(11), "약 11개월");
});

test("12개월 이상은 년+개월로", () => {
  assert.equal(monthsToLabel(12), "약 1년");
  assert.equal(monthsToLabel(16), "약 1년 4개월");
  assert.equal(monthsToLabel(24), "약 2년");
});

test("계산 불가는 null", () => {
  assert.equal(monthsToLabel(0), null);
  assert.equal(monthsToLabel(-3), null);
  assert.equal(monthsToLabel(Infinity), null);
  assert.equal(monthsToLabel(NaN), null);
});

test("10년을 넘으면 뭉뚱그린다", () => {
  assert.equal(monthsToLabel(200), "10년 이상");
});
