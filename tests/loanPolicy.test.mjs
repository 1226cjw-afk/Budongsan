import { test } from "node:test";
import assert from "node:assert/strict";
import { calcMaxLoan, loanCalcFor } from "../app/lib/loanPolicy.js";
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

// ── loanCalcFor: 화면 4곳이 공유하는 단일 어댑터 ─────────────────────────
// ⚠️ 지도 평형 카드 · 🆕 새 거래 피드 · ⭐ 관심 단지 · 🏗 청약 레이더가 예전엔 각자
//    calcMaxLoan 인자 10개를 손으로 조립했다. 하나만 빠져도 **그 화면만** 조용히 달라진다
//    — 2026-08-14 농특세 사고(area 누락)가 정확히 그것이었고 build도 test도 못 잡았다.
//    아래 테스트가 어댑터를 통과하는 필드를 잠근다.
const PROFILE = {
  income: "8000", assets: "50000", existingDebt: "500",
  householdType: "무주택", isFirstTime: false, rate: "4", termYears: "40",
};

test("loanCalcFor는 area를 그대로 흘려보낸다 (85㎡ 초과 농특세)", () => {
  const loanFor = loanCalcFor(PROFILE, 50000);
  const small = loanFor(110000, { lawdCd: "41173", area: 84 });
  const large = loanFor(110000, { lawdCd: "41173", area: 135 });
  assert.equal(small.acquisitionCost.ruralTax, 0); // 85㎡ 이하 — 농특세 없음
  assert.ok(large.acquisitionCost.ruralTax > 0, "85㎡ 초과인데 농특세가 0이면 area가 유실된 것");
  assert.ok(large.requiredCash > small.requiredCash);
});

test("loanCalcFor는 area를 안 주면 0으로 본다 (농특세 없음)", () => {
  const ln = loanCalcFor(PROFILE, 50000)(110000, { lawdCd: "41173" });
  assert.equal(ln.acquisitionCost.ruralTax, 0);
});

test("loanCalcFor 결과는 calcMaxLoan 직접 호출과 완전히 같다", () => {
  const viaAdapter = loanCalcFor(PROFILE, 50000)(90000, { lawdCd: "41173", area: 84.96 });
  const direct = calcMaxLoan({
    price: 90000, lawdCd: "41173", householdType: "무주택", isFirstTime: false,
    annualIncome: 8000, existingAnnualDebt: 500, rate: 0.04, termYears: 40,
    area: 84.96, assets: 50000,
  });
  assert.deepEqual(viaAdapter, direct);
});

test("연소득이 없으면 언제나 null (DSR 계산 불가)", () => {
  assert.equal(loanCalcFor({ ...PROFILE, income: "" }, 50000)(90000, { lawdCd: "41173" }), null);
  assert.equal(loanCalcFor({ ...PROFILE, income: "0" }, 50000)(90000, { lawdCd: "41173" }), null);
  assert.equal(loanCalcFor(null, 50000)(90000, { lawdCd: "41173" }), null);
});

test("가격이 없으면 null (거래 없는 평형)", () => {
  assert.equal(loanCalcFor(PROFILE, 50000)(0, { lawdCd: "41173" }), null);
  assert.equal(loanCalcFor(PROFILE, 50000)(null, { lawdCd: "41173" }), null);
});

test("문자열로 들어오는 화면 입력을 숫자로 정규화한다", () => {
  const ln = loanCalcFor(PROFILE, 50000)(90000, { lawdCd: "41173", area: 84 });
  assert.ok(Number.isFinite(ln.maxLoan) && ln.maxLoan > 0);
  assert.ok(Number.isFinite(ln.monthlyPayment));
  // 금리는 % → 소수로 나뉘어 들어간다(4 → 0.04). 안 나누면 월납이 터무니없이 커진다.
  assert.ok(ln.monthlyPayment < 2000, `월납이 ${ln.monthlyPayment}만원 — rate 변환이 빠졌나`);
});
