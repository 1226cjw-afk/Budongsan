import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSignal } from "../app/lib/marketSignal.js";

const ASOF = new Date("2026-08-03T12:00:00+09:00");
// 창 안(최근 30일) / 직전 창(30~60일 전) 날짜
const IN = "2026-07-20";
const PREV = "2026-06-20";

const t = (dealYmd, extra = {}) => ({
  dealYmd, aptNm: "가", area: 84, dealAmount: 50000,
  buyerGbn: "개인", slerGbn: "개인", ...extra,
});

test("거래량: 최근 30일과 직전 30일을 나눠 센다", () => {
  const s = buildSignal({
    trades: [t(IN), t(IN), t(PREV)],
    removed: [],
    asOf: ASOF,
  });
  assert.equal(s.volume.count, 2);
  assert.equal(s.volume.prevCount, 1);
  assert.equal(s.volume.delta, 1);
});

test("해제: removed의 cancelled만 세고 직거래는 안 센다", () => {
  const s = buildSignal({
    trades: [t(IN)],
    removed: [
      t(IN, { reason: "cancelled", cdealDay: "26.07.25" }),
      t(IN, { reason: "direct" }),
      t(PREV, { reason: "cancelled" }),
    ],
    asOf: ASOF,
  });
  assert.equal(s.cancelled.count, 1);
  assert.equal(s.cancelled.prevCount, 1);
  assert.equal(s.cancelled.delta, 0);
});

test("직거래 비중: 창 안 전체(정상+직거래) 대비 비율", () => {
  const s = buildSignal({
    trades: [t(IN), t(IN), t(IN)],
    removed: [t(IN, { reason: "direct" })],
    asOf: ASOF,
  });
  assert.equal(s.direct.count, 1);
  assert.equal(s.direct.total, 4); // 정상 3 + 직거래 1 (해제는 애초에 성사 안 됐으니 분모 제외)
  assert.equal(s.direct.ratio, 0.25);
});

test("법인 순매수 = 법인 매수 − 법인 매도", () => {
  const s = buildSignal({
    trades: [
      t(IN, { buyerGbn: "법인", slerGbn: "개인" }),
      t(IN, { buyerGbn: "법인", slerGbn: "개인" }),
      t(IN, { buyerGbn: "개인", slerGbn: "법인" }),
    ],
    removed: [],
    asOf: ASOF,
  });
  assert.equal(s.corporate.buy, 2);
  assert.equal(s.corporate.sell, 1);
  assert.equal(s.corporate.net, 1);
  assert.equal(s.corporate.available, true);
});

// 옛 캐시엔 buyerGbn이 없다. 0으로 표시하면 "법인 거래가 없다"는 거짓말이 되므로
// available:false로 내려 UI가 타일 자체를 숨기게 한다(2026-08-03).
test("buyerGbn이 없는 표본은 available:false", () => {
  const s = buildSignal({
    trades: [{ dealYmd: IN, aptNm: "가", area: 84, dealAmount: 50000 }],
    removed: [],
    asOf: ASOF,
  });
  assert.equal(s.corporate.available, false);
});

test("빈 표본에서도 터지지 않는다", () => {
  const s = buildSignal({ trades: [], removed: [], asOf: ASOF });
  assert.equal(s.volume.count, 0);
  assert.equal(s.direct.ratio, 0);
  assert.equal(s.corporate.available, false);
});
