import { test } from "node:test";
import assert from "node:assert/strict";
import { monthsToLabel, daysBetweenYmd } from "../app/lib/format.js";

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

// ⚠️ 서버(UTC)에서도 KST 달력 기준으로 D-day를 세기 위한 순수 계산.
//    new Date(ymd) 파싱은 런타임 타임존에 끌려가므로 문자열을 직접 쪼개 UTC로 고정한다.
test("daysBetweenYmd: 달력 일수 차", () => {
  assert.equal(daysBetweenYmd("2026-08-06", "2026-08-06"), 0);
  assert.equal(daysBetweenYmd("2026-08-06", "2026-08-07"), 1);
  assert.equal(daysBetweenYmd("2026-08-06", "2026-09-05"), 30);
  assert.equal(daysBetweenYmd("2026-08-06", "2026-08-05"), -1); // 지난 일정
});

test("daysBetweenYmd: 월·연 경계와 윤년", () => {
  assert.equal(daysBetweenYmd("2026-12-31", "2027-01-01"), 1);
  assert.equal(daysBetweenYmd("2028-02-28", "2028-03-01"), 2); // 2028은 윤년
});

test("daysBetweenYmd: 형식이 잘못되면 null", () => {
  assert.equal(daysBetweenYmd("2026-08-06", null), null);
  assert.equal(daysBetweenYmd("2026-08-06", "없음"), null);
});
