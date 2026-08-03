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

// 자정 인접 asOf: toISOString()의 UTC 날짜를 그대로 쓰면 KST 00:00~08:59에
// 하루가 밀린다(2026-08-03 리뷰가 잡은 실제 버그 — cron이 매일 이 구간에서 돈다).
// asOf 2026-08-03T03:00:00+09:00 == 2026-08-02T18:00:00Z. UTC 기준이면 end가
// "2026-08-02"로 계산돼 dealYmd "2026-08-02"가 `< end`에 걸려 창에서 빠진다.
// KST 기준이면 end는 "2026-08-03"이라 정상적으로 now 창에 들어온다.
test("자정 인접 asOf에서도 KST 달력 날짜로 창을 나눈다", () => {
  const midnightAdjacent = new Date("2026-08-03T03:00:00+09:00");
  const s = buildSignal({
    trades: [t("2026-08-02")],
    removed: [],
    asOf: midnightAdjacent,
  });
  assert.equal(s.volume.count, 1);
});

// 반열림 경계: [start, mid)는 prev, [mid, end)는 now. mid·start 자체를 이 모듈과
// 같은 산식(KST 오프셋 + 30일/60일)으로 도출해 "값을 하드코딩"이 아니라
// "그 경계 정의를 검증"하게 한다.
test("반열림 경계: mid는 now 쪽, start는 prev 쪽에 정확히 한 번만 잡힌다", () => {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const ymd = (d) => new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
  const WINDOW_DAYS = 30;
  const midDate = ymd(new Date(ASOF.getTime() - WINDOW_DAYS * 86400000));
  const startDate = ymd(new Date(ASOF.getTime() - 2 * WINDOW_DAYS * 86400000));

  const s = buildSignal({
    trades: [t(midDate), t(startDate)],
    removed: [],
    asOf: ASOF,
  });
  assert.equal(s.volume.count, 1); // mid 거래만 now
  assert.equal(s.volume.prevCount, 1); // start 거래만 prev
});

// 해제는 창 안에 있어도 direct.total(분모)에서 빠져야 한다 — 계약이 아예
// 성사되지 않았으니 "정상 대비 직거래 비중"의 모수가 아니다.
test("해제 거래는 창 안에 있어도 direct.ratio 분모에서 빠진다", () => {
  const s = buildSignal({
    trades: [t(IN), t(IN)],
    removed: [t(IN, { reason: "direct" }), t(IN, { reason: "cancelled" })],
    asOf: ASOF,
  });
  assert.equal(s.direct.count, 1);
  assert.equal(s.direct.total, 3); // 정상 2 + 직거래 1 (해제 1건은 분모 제외)
  assert.equal(s.direct.ratio, 1 / 3);
});

// buyerGbn: "" 은 "필드가 없다"가 아니라 "필드는 있는데 값이 비었다"다.
// in 연산자로 존재 여부를 판정해야 하는 이유 — truthy 체크로 "간소화"하면
// 이 케이스가 available:false로 잘못 떨어진다.
test("buyerGbn이 빈 문자열이어도 필드는 존재하므로 available:true", () => {
  const s = buildSignal({
    trades: [{ dealYmd: IN, aptNm: "가", area: 84, dealAmount: 50000, buyerGbn: "", slerGbn: "개인" }],
    removed: [],
    asOf: ASOF,
  });
  assert.equal(s.corporate.available, true);
});
