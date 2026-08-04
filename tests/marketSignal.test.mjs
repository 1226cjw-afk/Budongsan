import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSignal } from "../app/lib/marketSignal.js";

const ASOF = new Date("2026-08-03T12:00:00+09:00");
// ⚠️ 창은 신고 기한(30일)만큼 뒤로 밀려 있다 — ASOF 기준 확정 창 = [06-04, 07-04),
//    직전 창 = [05-05, 06-04). "최근 30일"이 아니다(marketSignal.js의 REPORT_LAG_DAYS).
const IN = "2026-06-20"; // 확정 창 안
const PREV = "2026-05-20"; // 직전 창 안
const TOO_FRESH = "2026-07-20"; // 아직 신고가 덜 찬 구간 — 어느 창에도 안 들어간다

const t = (dealYmd, extra = {}) => ({
  dealYmd, aptNm: "가", area: 84, dealAmount: 50000,
  buyerGbn: "개인", slerGbn: "개인", ...extra,
});

test("거래량: 확정 창과 직전 창을 나눠 센다", () => {
  const s = buildSignal({
    trades: [t(IN), t(IN), t(PREV)],
    removed: [],
    asOf: ASOF,
  });
  assert.equal(s.volume.count, 2);
  assert.equal(s.volume.prevCount, 1);
  assert.equal(s.volume.delta, 1);
});

// 이 테스트가 지연 보정 전체의 회귀 가드다. 보정을 되돌리면(REPORT_LAG_DAYS=0)
// TOO_FRESH가 now에 잡혀 count=1이 되며 여기서 터진다.
// 근거: 최근 30일은 신고 기한(계약 후 30일) 때문에 늘 과소집계라 직전 창과 비교하면
// 시장과 무관하게 매일 "급감"이 뜬다(2026-08-04 실측, marketSignal.js 주석 참조).
test("신고가 덜 찬 최근 30일은 어느 창에도 넣지 않는다", () => {
  const s = buildSignal({
    trades: [t(TOO_FRESH), t(TOO_FRESH), t(IN)],
    removed: [t(TOO_FRESH, { reason: "direct" })],
    asOf: ASOF,
  });
  assert.equal(s.volume.count, 1); // IN만
  assert.equal(s.volume.prevCount, 0);
  assert.equal(s.direct.count, 0); // 최근 직거래도 마찬가지로 제외
});

// 화면 헤더가 "최근 30일"이라 우기지 못하게 실제 창을 함께 내려준다.
test("window에 확정 창의 시작·끝을 함께 준다", () => {
  const s = buildSignal({ trades: [], removed: [], asOf: ASOF });
  assert.deepEqual(s.window, { start: "2026-06-04", end: "2026-07-04" });
  assert.equal(s.lagDays, 30);
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
  // 반대 방향 고정: 실값("법인"/"개인")이 있으면 available:true — 빈 문자열 케이스와
  // 대비되는 짝(아래 "buyerGbn이 전부 빈 문자열이면" 테스트 참고, 2026-08-03).
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
// asOf 2026-08-03T03:00:00+09:00 == 2026-08-02T18:00:00Z, 여기서 30일(신고 기한)을
// 빼면 2026-07-03T18:00:00Z. UTC 날짜를 쓰면 end="2026-07-03"이 돼 dealYmd
// "2026-07-03"이 `< end`에 걸려 창에서 빠진다. KST 보정하면 end="2026-07-04"라
// 정상적으로 확정 창에 들어온다.
test("자정 인접 asOf에서도 KST 달력 날짜로 창을 나눈다", () => {
  const midnightAdjacent = new Date("2026-08-03T03:00:00+09:00");
  const s = buildSignal({
    trades: [t("2026-07-03")],
    removed: [],
    asOf: midnightAdjacent,
  });
  assert.equal(s.volume.count, 1);
});

// 반열림 경계: [start, mid)는 prev, [mid, end)는 now. mid·start 자체를 이 모듈과
// 같은 산식(KST 오프셋 + 신고 지연 30일 + 30일/60일)으로 도출해 "값을 하드코딩"이 아니라
// "그 경계 정의를 검증"하게 한다.
test("반열림 경계: mid는 now 쪽, start는 prev 쪽에 정확히 한 번만 잡힌다", () => {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const ymd = (d) => new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
  const WINDOW_DAYS = 30;
  const LAG = 30;
  const midDate = ymd(new Date(ASOF.getTime() - (LAG + WINDOW_DAYS) * 86400000));
  const startDate = ymd(new Date(ASOF.getTime() - (LAG + 2 * WINDOW_DAYS) * 86400000));

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

// buyerGbn: "" 은 "필드가 없다"와 구분이 안 되는 상태다 — parseTrades의 pick()은 국토부가
// 태그를 아예 안 줘도 ""를 채워 넣어 키 자체는 항상 존재한다. 그래서 "값이 있느냐"로
// 판정해야 한다 — 키 존재(`"buyerGbn" in t`)로 판정하면 태그가 영영 안 와도(현재 상황)
// 모든 행이 ""를 가진 순간 available:true가 되고 net은 0으로 계산돼, 막으려던 "법인
// 거래가 없다"는 거짓말을 다시 보여주게 된다(2026-08-03 리뷰가 잡음 — 최초 스펙 오류).
test("buyerGbn이 전부 빈 문자열이면 available:false (키만 있고 값은 없음)", () => {
  const s = buildSignal({
    trades: [{ dealYmd: IN, aptNm: "가", area: 84, dealAmount: 50000, buyerGbn: "", slerGbn: "개인" }],
    removed: [],
    asOf: ASOF,
  });
  assert.equal(s.corporate.available, false);
});
