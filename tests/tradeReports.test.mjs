import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tradeKey, keyedTrades, diffNewTrades, shouldRecord, refMedianFor, buildReportRows,
  RECORD_MAX_AGE_MS,
} from "../app/lib/tradeReports.js";

// 🔥 핫플의 "오늘/이번 주"는 계약일이 아니라 **우리 데이터에 처음 나타난 날**이다.
// 2026-09-29 실측: ★ 지역 5곳의 최근 7일 계약은 합계 10건 — 신고 기한(계약 후 30일) 때문에
// 계약일 기준 창은 구조적으로 비어 있다. 그래서 재수집 때 옛/새 payload를 비교한다.

const T = (o = {}) => ({
  umdNm: "구로동", aptNm: "구로두산", dealYmd: "2026-09-10", area: 84.97, floor: 7,
  dealAmount: 71000, cdealType: "", dealingGbn: "중개거래", ...o,
});

test("tradeKey는 단지·계약일·면적·층·금액으로 거래를 식별한다", () => {
  assert.equal(tradeKey(T()), "구로동|구로두산|2026-09-10|84.97|7|71000");
});

test("완전히 같은 거래 2건은 #1·#2로 구분된다(멀티셋)", () => {
  const ks = keyedTrades([T(), T()]).map((x) => x.key);
  assert.deepEqual(ks, [
    "구로동|구로두산|2026-09-10|84.97|7|71000#1",
    "구로동|구로두산|2026-09-10|84.97|7|71000#2",
  ]);
});

test("새 payload에만 있는 거래를 찾는다", () => {
  const a = T();
  const b = T({ floor: 12, dealAmount: 73000 });
  const fresh = diffNewTrades([a], [a, b]);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].t, b);
});

test("같은 거래가 1건 → 2건이 되면 두 번째만 새 거래다", () => {
  const fresh = diffNewTrades([T()], [T(), T()]);
  assert.equal(fresh.length, 1);
  assert.ok(fresh[0].key.endsWith("#2"));
});

test("해제 표시가 붙은 기존 거래는 새 거래가 아니다(키에 해제 필드 없음)", () => {
  const fresh = diffNewTrades([T()], [T({ cdealType: "O" })]);
  assert.equal(fresh.length, 0);
});

test("이전 캐시가 없으면 기록하지 않는다(첫 수집 = 기준선)", () => {
  assert.equal(shouldRecord(undefined), false);
  assert.equal(shouldRecord({ trades: null, fetched_at: new Date().toISOString() }), false);
});

test("이전 수집이 48시간 이내면 기록, 넘으면 기록하지 않는다", () => {
  const now = Date.parse("2026-09-29T00:00:00Z");
  const at = (ms) => ({ trades: [], fetched_at: new Date(now - ms).toISOString() });
  assert.equal(shouldRecord(at(RECORD_MAX_AGE_MS), now), true);
  assert.equal(shouldRecord(at(RECORD_MAX_AGE_MS + 1), now), false);
});

test("가격 기준 = 같은 단지·같은 평형·더 이른 계약의 정상 거래 중앙값", () => {
  const t = T({ dealYmd: "2026-09-20", dealAmount: 80000 });
  const pool = [
    t,
    T({ dealYmd: "2026-09-01", dealAmount: 70000 }),
    T({ dealYmd: "2026-08-15", dealAmount: 72000 }),
    T({ dealYmd: "2026-08-10", dealAmount: 60000, dealingGbn: "직거래" }), // 제외
    T({ dealYmd: "2026-08-11", dealAmount: 50000, cdealType: "O" }),       // 제외
    T({ dealYmd: "2026-09-25", dealAmount: 90000 }),                        // 더 늦음 → 제외
    T({ dealYmd: "2026-09-02", dealAmount: 40000, area: 59.9 }),            // 다른 평형 → 제외
    T({ dealYmd: "2026-09-02", dealAmount: 40000, aptNm: "구로주공" }),     // 다른 단지 → 제외
  ];
  assert.deepEqual(refMedianFor(t, pool), { refMedian: 71000, refN: 2 });
});

test("비교할 거래가 없으면 기준은 null", () => {
  const t = T();
  assert.deepEqual(refMedianFor(t, [t]), { refMedian: null, refN: 0 });
});

test("buildReportRows는 trade_reports 컬럼으로 옮기고 해제·직거래도 원본대로 남긴다", () => {
  const t = T({ dealingGbn: "직거래" });
  const [row] = buildReportRows({
    lawdCd: "11530", reportedOn: "2026-09-29", fresh: [{ key: "k#1", t }], pool: [t],
  });
  assert.deepEqual(row, {
    lawd_cd: "11530", trade_key: "k#1", reported_on: "2026-09-29", deal_ymd: "2026-09-10",
    umd_nm: "구로동", apt_nm: "구로두산", area: 84.97, amount: 71000, floor: 7,
    dealing_gbn: "직거래", cdeal_type: null, ref_median: null, ref_n: 0,
  });
});
