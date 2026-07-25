import { test } from "node:test";
import assert from "node:assert/strict";
import { calcAcquisitionCost } from "../app/lib/acquisitionCost.js";

// 5억 · 59㎡ · 무주택 · 비규제
// 취득세 1% = 500 / 지방교육세 50 / 농특세 0(85㎡ 이하)
// 중개보수 0.4% = 200 + VAT = 220 / 등기 50000*0.0015+40 = 115
test("5억 아파트: 취득세 1% 구간", () => {
  const c = calcAcquisitionCost({ price: 50000, area: 59 });
  assert.equal(c.acquisitionTax, 500);
  assert.equal(c.localEduTax, 50);
  assert.equal(c.ruralTax, 0);
  assert.equal(c.brokerFee, 220);
  assert.equal(c.registryEtc, 115);
  assert.equal(c.total, 885);
});

// 7.5억: 6~9억 선형 구간 → (7.5 × 2 / 3) − 3 = 2.0%
test("7.5억: 6~9억 선형 구간은 정확히 2%", () => {
  const c = calcAcquisitionCost({ price: 75000, area: 84 });
  assert.equal(c.taxRate, 0.02);
  assert.equal(c.acquisitionTax, 1500);
});

// 9억 경계: 공식으로도 3%가 나와 9억 초과 고정세율과 연속이어야 한다
test("9억 경계에서 세율이 튀지 않는다", () => {
  const at9 = calcAcquisitionCost({ price: 90000, area: 84 });
  const over9 = calcAcquisitionCost({ price: 90001, area: 84 });
  assert.equal(at9.taxRate, 0.03);
  assert.equal(over9.taxRate, 0.03);
});

// 85㎡ 경계: 이하 비과세, 초과만 0.2%
test("농특세는 전용 85㎡ 초과에만 붙는다", () => {
  assert.equal(calcAcquisitionCost({ price: 90000, area: 85 }).ruralTax, 0);
  assert.equal(calcAcquisitionCost({ price: 90000, area: 85.01 }).ruralTax, 180);
});

// 중개보수 한도액: 5천~2억 구간은 0.5%지만 80만원 상한
test("중개보수 한도액이 요율보다 우선한다", () => {
  // 1.5억 × 0.5% = 75만 (한도 미달) + VAT
  assert.equal(calcAcquisitionCost({ price: 15000, area: 45 }).brokerFee, 83);
  // 1.8억 × 0.5% = 90만 > 한도 80만 → 80만 + VAT
  assert.equal(calcAcquisitionCost({ price: 18000, area: 45 }).brokerFee, 88);
});

// 중개보수 구간 경계: 9억 미만 0.4% → 9억 이상 0.5%
test("중개보수 9억 경계", () => {
  assert.equal(calcAcquisitionCost({ price: 89999, area: 84 }).brokerFee, 396);
  assert.equal(calcAcquisitionCost({ price: 90000, area: 84 }).brokerFee, 495);
});

// 생애최초: 12억 이하 주택 취득세 200만원 한도 감면
test("생애최초 감면은 취득세에서 최대 200만원", () => {
  const c = calcAcquisitionCost({ price: 50000, area: 59, isFirstTime: true });
  assert.equal(c.acquisitionTax, 300); // 500 − 200
  assert.equal(c.localEduTax, 50);     // 지방교육세는 감면과 별개
  assert.equal(c.total, 685);
});

test("생애최초 감면은 12억 초과 주택엔 적용되지 않는다", () => {
  const c = calcAcquisitionCost({ price: 130000, area: 84, isFirstTime: true });
  assert.equal(c.acquisitionTax, 3900); // 13억 × 3%, 감면 없음
});

// 다주택(=2주택 취급) + 조정대상지역 → 8% 중과, 지방교육세 0.4% 고정
test("규제지역 다주택은 8% 중과 + 지방교육세 0.4% 고정", () => {
  const c = calcAcquisitionCost({
    price: 90000, area: 84, householdType: "다주택", regulated: true,
  });
  assert.equal(c.acquisitionTax, 7200);
  assert.equal(c.localEduTax, 360);
  assert.equal(c.total, 8230);
});

// 비규제 2주택은 일반세율(지방세법 §13조의2 — 비조정은 3주택부터 중과)
test("비규제 다주택(2주택)은 일반세율", () => {
  const c = calcAcquisitionCost({
    price: 90000, area: 84, householdType: "다주택", regulated: false,
  });
  assert.equal(c.acquisitionTax, 2700);
});
