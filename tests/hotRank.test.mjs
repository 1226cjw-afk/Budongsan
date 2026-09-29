import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeReports, matchNews, hotScore, rankHot,
  HOT_PRICE_MIN_REPORTS, HOT_MAX_ROWS, HOT_NEWS_BONUS,
} from "../app/lib/hotRank.js";

// 🔥 핫플 순위. ⚠️ 가점·임계값은 **임시값**이다(2026-09-29) — trade_reports가 배포일부터 쌓여
// 실측할 데이터가 없다. 7일치가 쌓이면 분포를 재서 확정한다(PROGRESS 백로그).

const R = (o = {}) => ({
  lawd_cd: "11530", umd_nm: "구로동", apt_nm: "구로두산", deal_ymd: "2026-09-10",
  area: 84.97, amount: 71000, dealing_gbn: "중개거래", cdeal_type: null, ref_median: null,
  reported_on: "2026-09-29", ...o,
});

test("단지별로 신고 건수를 센다", () => {
  const out = summarizeReports([R(), R(), R({ apt_nm: "한진", umd_nm: "개봉동" })]);
  assert.deepEqual(out.map((c) => [c.aptNm, c.reports]), [["구로두산", 2], ["한진", 1]]);
});

test("해제·직거래는 집계에서 뺀다(공공기관 일괄매입 170건 방지)", () => {
  // 2026-09-18 송파해링턴타워: 직거래·공공기관 170건이 하루에 몰렸다.
  const rows = Array.from({ length: 170 }, () => R({ apt_nm: "송파해링턴타워", dealing_gbn: "직거래" }));
  rows.push(R({ cdeal_type: "O" }), R());
  const out = summarizeReports(rows);
  assert.deepEqual(out.map((c) => [c.aptNm, c.reports]), [["구로두산", 1]]);
});

test("가격 점프 = 기준 중앙값 대비 최대 상승률(소수 1자리)", () => {
  const out = summarizeReports([
    R({ amount: 77000, ref_median: 70000 }), // +10.0
    R({ amount: 73500, ref_median: 70000 }), // +5.0
  ]);
  assert.deepEqual(out[0].jump, { pct: 10, amount: 77000, refMedian: 70000, pyeong: 34 });
});

test("문자열 숫자 필드(PostgREST numeric)도 정상 집계한다", () => {
  const out = summarizeReports([R({ area: "84.97", amount: "77000", ref_median: "70000" })]);
  assert.equal(out[0].jump.pyeong, 34);
  assert.equal(out[0].jump.pct, 10);
  assert.equal(out[0].latest.amount, 77000);
});

test("latest는 계약일이 가장 늦은 거래", () => {
  const out = summarizeReports([R({ deal_ymd: "2026-09-01", amount: 1 }), R({ deal_ymd: "2026-09-12", amount: 2 })]);
  assert.equal(out[0].latest.amount, 2);
});

const watch = [
  { name: "구로두산", lawdCd: "11530", regionName: "구로구", articles: 5, days: 3, outlets: 3, score: 9, top: { title: "t", link: "l" } },
];

test("같은 지역 뉴스 이름이 맞으면 뉴스 매칭", () => {
  const [c] = summarizeReports([R()]);
  assert.equal(matchNews(c, watch)?.name, "구로두산");
});

test("다른 지역 동명 단지는 뉴스 매칭 안 됨", () => {
  const [c] = summarizeReports([R({ lawd_cd: "11350" })]);
  assert.equal(matchNews(c, watch), null);
});

test("종합 점수 = 신고 + 가격 가점(5%↑ +2, 10%↑ +3, 신고 2건 이상만) + 뉴스 가점", () => {
  const two = (pct) => summarizeReports([R({ amount: 70000 * (1 + pct / 100), ref_median: 70000 }), R()])[0];
  assert.equal(hotScore(two(4.9), null), 2);
  assert.equal(hotScore(two(5), null), 4);
  assert.equal(hotScore(two(10), null), 5);
  assert.equal(hotScore(two(10), watch[0]), 5 + HOT_NEWS_BONUS);
  // 신고 1건짜리는 가격 가점이 없다(1건 튀는 값 방지)
  const one = summarizeReports([R({ amount: 80000, ref_median: 70000 })])[0];
  assert.equal(hotScore(one, null), 1);
});

test("가격 칩은 신고 2건 이상 + 상승(pct>0)만, 상승률순", () => {
  const rows = [
    R({ apt_nm: "A", amount: 80000, ref_median: 70000 }),               // 1건 → 제외
    R({ apt_nm: "B", amount: 77000, ref_median: 70000 }), R({ apt_nm: "B" }),
    R({ apt_nm: "C", amount: 73500, ref_median: 70000 }), R({ apt_nm: "C" }),
    R({ apt_nm: "D", amount: 60000, ref_median: 70000 }), R({ apt_nm: "D" }), // 하락 → 제외
  ];
  const out = rankHot({ complexes: summarizeReports(rows), watch: [], chip: "price" });
  assert.deepEqual(out.map((r) => r.c.aptNm), ["B", "C"]);
  assert.equal(HOT_PRICE_MIN_REPORTS, 2);
});

test("거래 칩은 신고 건수순, 상한 HOT_MAX_ROWS", () => {
  const rows = [];
  for (let i = 0; i < 15; i++) for (let k = 0; k <= i; k++) rows.push(R({ apt_nm: `N${i}` }));
  const out = rankHot({ complexes: summarizeReports(rows), watch: [], chip: "trade" });
  assert.equal(out.length, HOT_MAX_ROWS);
  assert.equal(out[0].c.aptNm, "N14");
});

test("뉴스 칩은 newsWatch 행을 그대로 싣는다", () => {
  const out = rankHot({ complexes: [], watch, chip: "news" });
  assert.deepEqual(out.map((r) => [r.kind, r.news.name]), [["news", "구로두산"]]);
});

test("종합 칩: 뉴스 가점이 동점을 가른다", () => {
  const rows = [R(), R({ apt_nm: "한진", umd_nm: "개봉동" })];
  const out = rankHot({ complexes: summarizeReports(rows), watch, chip: "total" });
  assert.equal(out[0].c.aptNm, "구로두산");
  assert.equal(out[0].newsHit.name, "구로두산");
});
