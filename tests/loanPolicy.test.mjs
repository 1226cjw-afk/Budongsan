import { test } from "node:test";
import assert from "node:assert/strict";
import { calcMaxLoan } from "../app/lib/loanPolicy.js";
import { calcAcquisitionCost } from "../app/lib/acquisitionCost.js";

const BASE = {
  price: 90000, lawdCd: "11680", annualIncome: 10000,
  rate: 0.04, termYears: 40, area: 84,
};

test("requiredCash에 부대비용이 포함된다", () => {
  const r = calcMaxLoan(BASE);
  const cost = calcAcquisitionCost({
    price: 90000, area: 84, householdType: "무주택",
    isFirstTime: false, regulated: true,
  });
  assert.equal(r.acquisitionCost.total, cost.total);
  assert.equal(r.requiredCash, Math.max(0, 90000 - r.maxLoan) + cost.total);
});

// 스펙의 핵심 불변식 — 구매가능 판정이 두 갈래로 갈리면 안 된다.
// gap ≥ 0  ⟺  maxLoan ≥ neededLoan
test("gap ≥ 0 과 maxLoan ≥ neededLoan 은 항상 일치한다", () => {
  for (const assets of [0, 10000, 30000, 50000, 90000, 200000]) {
    const r = calcMaxLoan({ ...BASE, assets });
    const gap = assets - r.requiredCash;
    assert.equal(
      gap >= 0,
      r.maxLoan >= r.neededLoan,
      `assets=${assets}: gap=${gap}, maxLoan=${r.maxLoan}, neededLoan=${r.neededLoan}`
    );
  }
});

test("자기자금이 많으면 실제로 빌릴 금액이 줄어든다", () => {
  const poor = calcMaxLoan({ ...BASE, assets: 10000 });
  const rich = calcMaxLoan({ ...BASE, assets: 80000 });
  assert.ok(rich.neededLoan < poor.neededLoan);
  assert.ok(rich.monthlyPayment < poor.monthlyPayment);
});

test("자기자금이 없으면 한도까지 빌린 것으로 본다", () => {
  const r = calcMaxLoan(BASE);
  assert.equal(r.plannedLoan, r.maxLoan);
});

// neededLoan은 클램프하지 않는다 — 한도를 넘는 것 자체가 자금 부족 신호다.
test("필요액이 한도를 넘으면 neededLoan이 maxLoan보다 크다", () => {
  const r = calcMaxLoan({ ...BASE, assets: 0 });
  assert.ok(r.neededLoan > r.maxLoan);
  assert.ok(r.plannedLoan <= r.maxLoan);
  assert.ok(0 - r.requiredCash < 0); // assets=0 → gap 음수 = 자금 부족
});

test("자기자금이 충분하면 필요액만 빌린다", () => {
  const r = calcMaxLoan({ ...BASE, assets: 80000 });
  assert.ok(r.neededLoan < r.maxLoan);
  assert.equal(r.plannedLoan, r.neededLoan);
});

// 월납은 실제 금리, DSR은 스트레스 금리 → DSR 쪽이 항상 더 빡빡하다
test("월납은 실제 금리, dsrRatio는 스트레스 금리 기준", () => {
  const r = calcMaxLoan({ ...BASE, assets: 30000 });
  const annualActual = r.monthlyPayment * 12;
  // 스트레스(+3%p) 기준 연상환액이 실제보다 크므로 dsrRatio도 더 크다
  assert.ok(r.dsrRatio > annualActual / 10000);
});

test("연소득이 없으면 dsrRatio는 null", () => {
  const r = calcMaxLoan({ ...BASE, annualIncome: 0 });
  assert.equal(r.dsrRatio, null);
});

test("대출이 0이면 월납도 0", () => {
  // 규제지역 다주택 → LTV 0
  const r = calcMaxLoan({ ...BASE, householdType: "다주택" });
  assert.equal(r.maxLoan, 0);
  assert.equal(r.monthlyPayment, 0);
});

test("85㎡ 초과는 농특세만큼 필요자금이 더 든다", () => {
  const small = calcMaxLoan({ ...BASE, area: 84 });
  const big = calcMaxLoan({ ...BASE, area: 114 });
  assert.equal(big.requiredCash - small.requiredCash, Math.round(90000 * 0.002));
});
