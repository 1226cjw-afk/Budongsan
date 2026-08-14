import { test } from "node:test";
import assert from "node:assert/strict";
import { monthsToLabel, daysBetweenYmd, kstDate } from "../app/lib/format.js";

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

// ── kstDate ────────────────────────────────────────────────────────────────
// ⚠️ 이 프로젝트에서 같은 버그가 네 번 재발한 지점이다(marketSignal 창 / briefing cutoff·
//    D-day / /api/subscription 마감 / 지도 보유주택 스냅샷). Vercel은 UTC로 돌고 cron은
//    06:00·06:30 KST라 **매일** KST 00:00~08:59 구간에서 실행된다 — UTC 날짜를 그대로 쓰면
//    그때마다 어제가 나온다. 2026-08-14에 오프셋 4벌을 이 함수 하나로 모았다.
test("kstDate: UTC 15:00 = KST 익일 00:00에서 날짜가 넘어간다", () => {
  assert.equal(kstDate(Date.parse("2026-08-05T14:59:59Z")), "2026-08-05");
  assert.equal(kstDate(Date.parse("2026-08-05T15:00:00Z")), "2026-08-06");
});

// cron이 실제로 도는 시각(06:00 KST = 전날 21:00 UTC)에서 "오늘"이 맞는지.
// UTC 날짜를 쓰면 여기서 하루 전이 나오고, 브리핑 캐시는 그 오차를 온종일 고정한다.
test("kstDate: cron 실행 시각(06:00 KST)에 KST 당일이 나온다", () => {
  assert.equal(kstDate(Date.parse("2026-08-13T21:00:00Z")), "2026-08-14");
  assert.equal(kstDate(Date.parse("2026-08-13T21:30:00Z")), "2026-08-14"); // 뉴스 cron
});

test("kstDate: 월·연 경계를 넘어간다", () => {
  assert.equal(kstDate(Date.parse("2026-08-31T15:00:00Z")), "2026-09-01");
  assert.equal(kstDate(Date.parse("2026-12-31T15:00:00Z")), "2027-01-01");
});

// ⚠️ 오프셋을 다시 흩뿌리지 못하게 하는 구조 가드. `+ 9 * 60 * 60 * 1000`을 새로 적는
//    순간(=다섯 번째 재발) 여기서 걸린다. format.js의 정의 1개만 허용한다.
test("KST 오프셋 정의는 format.js 한 곳뿐이다", async () => {
  const { readFile } = await import("node:fs/promises");
  const files = [
    "../app/lib/format.js", "../app/lib/briefingCache.js", "../app/lib/briefing.js",
    "../app/lib/marketSignal.js", "../app/api/subscription/route.js",
    "../app/components/KakaoMap.js",
  ];
  const owners = [];
  for (const f of files) {
    const src = await readFile(new URL(f, import.meta.url), "utf8");
    if (/9 \* 60 \* 60 \* 1000/.test(src)) owners.push(f);
  }
  assert.deepEqual(owners, ["../app/lib/format.js"],
    `KST 오프셋이 흩어졌다: ${owners.join(", ")} — format.kstDate()를 쓸 것`);
});
