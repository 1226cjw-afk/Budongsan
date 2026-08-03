# 시장 신호 · 새 거래 피드 · 청약 레이더 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/news`를 오늘의 상황판으로 확장해 시장 신호·새 거래 피드·청약 레이더 3개 카드를 추가한다.

**Architecture:** 시장 신호와 새 거래 피드는 **외부 API 호출 0** — cron이 채워둔 `trade_raw_cache`만 읽는다. 지금 `excludeAbnormal()`이 시세에서 걷어내 버리는 해제·직거래를 배열로 함께 반환해 신호로 되살리되, 시세 경로(`trades`)는 완전히 불변으로 둔다. 청약은 미승인 API라 graceful(실패 시 카드 미렌더).

**Tech Stack:** Next.js 16 App Router · React 19 · Supabase · `node:test`(의존성 0)

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-03-market-signal-feed-subscription-design.md`
- **검증 3종**: `npx next build` + `npm test` + Playwright 실측. 각각 다른 종류의 버그를 잡는다.
- `npm test`는 글로브를 따옴표로: `node --test "tests/*.test.mjs"`. 디렉터리 형태는 `MODULE_NOT_FOUND`로 실패.
- `package.json`에 `"type":"module"` **추가 금지**(Next 빌드가 깨진다). `MODULE_TYPELESS_PACKAGE_JSON` 경고는 무해.
- **린트 없음** — eslint 미설치. 검증은 build+test가 전부.
- 주석은 한글로 **"왜"**를 남긴다. 되돌리면 안 되는 것엔 `⚠️` + 실측 날짜.
- 색: 새 색을 만들지 말고 `lib/palette.js`의 `C`를 쓴다. **상승=빨강 관례를 도입하지 않는다** — 우리 빨강은 이미 "자금부족"이다. 증감은 ▲▼ + 회색/앰버.
- 스타일 상수 추가 전 **이름 grep 필수**(`components/mapStyles.js` + 대상 파일). 중복 정의 시 dev 컴파일 에러.
- 커밋 메시지가 한글이면 PowerShell here-string이 깨진다 → **Write 도구로 `.git\COMMIT_MSG_TMP.txt`에 쓰고 `git commit -F`**. `Set-Content -Encoding utf8`은 BOM을 붙이므로 금지.
- **push 금지** — 사용자가 명시적으로 요청할 때만. push하면 Vercel이 자동 배포한다.

---

### Task 1: 실거래 원본 필드 확인 + 파서 확장

법인 지표는 `buyerGbn`/`slerGbn`에 달려 있는데 파서가 이 필드를 안 읽는다. **필드가 실제로 오는지 원본부터 확인**하고 시작한다 — 2026-07-29에 `cdealType` 누락을 이 방법으로 잡았다.

**Files:**
- Create(임시): `scripts/tmp-rtms-tags.mjs` — 확인 후 삭제
- Modify: `app/lib/trades.js:42-63` (`parseTrades`, `lacksDealFlags`)

**Interfaces:**
- Produces: `parseTrades()` 결과 항목에 `buyerGbn`·`slerGbn`·`cdealDay` 추가. `lacksDealFlags(trades)`가 `buyerGbn` 부재도 미스로 판정.

- [ ] **Step 1: 원본 XML 태그 전수 덤프 스크립트 작성**

Write 도구로 `scripts/tmp-rtms-tags.mjs` 생성:

```js
// 실거래 원본 XML에 어떤 태그가 오는지 전수 확인. 확인 후 삭제.
import { readFileSync } from "fs";
const env = readFileSync("C:\\Users\\1226c\\Projects\\Budongsan\\.env.local", "utf8");
for (const l of env.split(/\r?\n/)) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const K = process.env.DATA_GO_KR_KEY;
const url = `http://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade`
  + `?LAWD_CD=41173&DEAL_YMD=202606&numOfRows=100&serviceKey=${encodeURIComponent(K)}`;
const xml = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());

const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
console.log("items:", items.length);
const tags = new Set();
for (const it of items) for (const m of it.matchAll(/<([a-zA-Z]+)>/g)) tags.add(m[1]);
console.log("TAGS:", [...tags].sort().join(", "));

// 관심 필드 값 분포
for (const f of ["buyerGbn", "slerGbn", "cdealType", "cdealDay", "dealingGbn"]) {
  const dist = {};
  for (const it of items) {
    const m = it.match(new RegExp(`<${f}>([^<]*)</${f}>`));
    const v = m ? m[1].trim() || "(빈값)" : "(태그없음)";
    dist[v] = (dist[v] || 0) + 1;
  }
  console.log(`${f}:`, JSON.stringify(dist));
}
```

- [ ] **Step 2: 실행해서 필드 존재 확인**

Run: `node scripts/tmp-rtms-tags.mjs`

Expected: `TAGS:` 목록에 `buyerGbn`, `slerGbn`이 있고, 값 분포가 `개인`/`법인`/`공공기관`/`기타` 등으로 나온다.

⚠️ **분기**:
- `ECONNRESET`이면 data.go.kr 장애(2026-08-03 재현됨) — 몇 분 뒤 재시도. 계속 막히면 **Task 1의 법인 부분만 보류하고 Task 2로 진행**, 나중에 이어 붙인다.
- 태그가 아예 없으면 **법인 타일을 스코프에서 제외**하고 Task 4의 `corporate.available = false` 경로만 남긴다(나머지 3종은 영향 없음).

- [ ] **Step 3: `parseTrades`에 필드 3종 추가**

`app/lib/trades.js`의 `parseTrades` 안, 기존 `dealingGbn` 줄 바로 아래에 추가:

```js
    // 법인 거래 판별용(marketSignal). 값은 개인|법인|공공기관|기타로 알려져 있다.
    // ⚠️ 2026-08-03 현재 data.go.kr 장애로 **원본 미확인** — 필드가 없으면 pick()이 ""를
    //    돌려주고 marketSignal이 법인 지표를 숨긴다(0으로 표시하면 "법인 거래 없음"이라는
    //    거짓말이 된다). API 복구되면 태그 전수 덤프로 확인할 것.
    buyerGbn: pick(b, "buyerGbn"),
    slerGbn: pick(b, "slerGbn"),
    // 해제일. 해제는 계약보다 나중에 발생해 "언제 취소됐나"는 이 값이라야 맞다.
    // ⚠️ 이 필드도 위와 같이 원본 미확인 상태다.
    cdealDay: pick(b, "cdealDay"),
```

⚠️ **주석에 "원본 확인"이라 쓰지 말 것** — Step 2가 ECONNRESET으로 건너뛰어졌다면 검증은
일어나지 않았다. 이 프로젝트에서 `⚠️`+날짜는 "실측했으니 되돌리지 말 것"을 뜻하므로,
근거 없는 검증 주장은 다음 세션을 오도한다(2026-08-03 리뷰가 실제로 잡아냄).

- [ ] **Step 4: `lacksDealFlags` 확장**

`app/lib/trades.js:61-63`을 교체:

**`lacksDealFlags`는 건드리지 않는다.** (2026-08-03 정정 — 아래 근거)

원래 계획은 `buyerGbn` 부재도 미스로 판정해 자가 재수집을 태우는 것이었으나, **실측 결과
블래스트 반경이 너무 컸다**:

```
trade_raw_cache 781행 중 cdealType 보유 158 · buyerGbn 보유 0 (최종 수집 2026-08-01)
```

→ 781행 **전부**가 stale이 되고, `/api/briefing`은 `cacheOnly`라 재수집을 못 해 빈 응답이
된다. 신규 카드뿐 아니라 **기존 ⭐관심단지 브리핑까지 빈다**. 마침 국토부 API 장애까지
겹쳐 자가치유도 불가.

⚠️ **얻는 것 대비 잃는 것이 크다** — `marketSignal`의 `corporate.available=false`가 이미
필드 부재를 정확히 처리한다(0으로 표시하지 않고 타일을 숨김). 그리고 신호가 읽는 창은
60일인데 cron이 매일 최근 2개월을 재수집하므로, **하루 안에 그 범위는 자연히 채워진다**.
과거 달에 `buyerGbn`이 없는 것은 신호에 아무 영향이 없다.

- [ ] **Step 5: 임시 스크립트 삭제 + 빌드**

```bash
rm -f scripts/tmp-rtms-tags.mjs
npx next build
```

Expected: 빌드 통과, `scripts/tmp-*` 잔재 없음(`git status -s`로 확인).

- [ ] **Step 6: 커밋**

```bash
git add app/lib/trades.js
git commit -F .git/COMMIT_MSG_TMP.txt
```

메시지(Write 도구로 `.git/COMMIT_MSG_TMP.txt`에 작성):
```
feat(trades): 실거래 파서에 매수/매도자 구분·해제일 추가

법인 순매수 지표(시장 신호)에 필요한 buyerGbn/slerGbn과 해제 발생일
cdealDay를 파싱한다. lacksDealFlags가 buyerGbn 부재도 미스로 보게 해
7/29 이후 캐시가 자가 재수집되도록 했다(마이그레이션 없음).
```

---

### Task 2: `excludeAbnormal`이 제외한 거래를 배열로 함께 반환

시세 정확도의 단일 지점을 우회하지 않고 신호를 얻기 위한 핵심 변경. **`trades` 반환은 그대로**라 기존 호출부 4개(`/trades`·`/trend`·`/rank`·`/briefing`)는 영향받지 않는다.

**Files:**
- Modify: `app/lib/tradeStats.js:26-36`
- Test: `tests/tradeStats.test.mjs`

**Interfaces:**
- Produces: `excludeAbnormal(trades) -> { trades, cancelled, direct, removed }`
  - `removed`: 제외된 거래 배열. 각 항목은 원본 거래 + `reason: "cancelled" | "direct"`.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/tradeStats.test.mjs`의 이상치 제외 테스트 근처에 추가:

```js
// 시장 신호는 "걸러낸 것"을 지표로 쓴다. 걸러낸 결과를 버리면 신호를 만들 수 없어,
// excludeAbnormal이 제외 사유와 함께 배열로 돌려준다(2026-08-03).
test("excludeAbnormal이 제외한 거래를 사유와 함께 돌려준다", () => {
  const raw = [
    { aptNm: "가", dealAmount: 50000, cdealType: "", dealingGbn: "중개거래" },
    { aptNm: "나", dealAmount: 60000, cdealType: "O", dealingGbn: "중개거래" },
    { aptNm: "다", dealAmount: 30000, cdealType: "", dealingGbn: "직거래" },
  ];
  const r = excludeAbnormal(raw);

  assert.equal(r.trades.length, 1);
  assert.equal(r.trades[0].aptNm, "가");
  assert.equal(r.cancelled, 1);
  assert.equal(r.direct, 1);

  assert.equal(r.removed.length, 2);
  assert.deepEqual(
    r.removed.map((t) => [t.aptNm, t.reason]),
    [["나", "cancelled"], ["다", "direct"]]
  );
});

// 해제가 직거래보다 먼저 판정된다 — 둘 다 해당하면 해제로 한 번만 센다.
test("해제이면서 직거래인 거래는 해제로 한 번만 집계", () => {
  const r = excludeAbnormal([{ cdealType: "O", dealingGbn: "직거래" }]);
  assert.equal(r.cancelled, 1);
  assert.equal(r.direct, 0);
  assert.equal(r.removed.length, 1);
  assert.equal(r.removed[0].reason, "cancelled");
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`

Expected: FAIL — `r.removed`가 `undefined`라 `.length` 접근에서 터진다.

- [ ] **Step 3: 구현**

`app/lib/tradeStats.js`의 `excludeAbnormal`을 교체(주석은 유지·보강):

```js
// 반환 {trades, cancelled, direct, removed} — 제외 건수는 "N건 제외" 표기에,
// removed(제외된 거래 + 사유)는 시장 신호 지표에 쓴다(2026-08-03).
// ⚠️ trades 반환은 예전 그대로다. 시세 경로 4개(/trades·/trend·/rank·/briefing)가
//    이 값만 쓰므로, 신호를 얹어도 시세 정확도의 단일 지점은 깨지지 않는다.
export function excludeAbnormal(trades) {
  let cancelled = 0;
  let direct = 0;
  const kept = [];
  const removed = [];
  for (const t of trades || []) {
    if (t.cdealType === "O") {
      cancelled += 1;
      removed.push({ ...t, reason: "cancelled" });
      continue;
    }
    if (t.dealingGbn === "직거래") {
      direct += 1;
      removed.push({ ...t, reason: "direct" });
      continue;
    }
    kept.push(t);
  }
  return { trades: kept, cancelled, direct, removed };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`

Expected: PASS. 기존 36개도 전부 통과(회귀 없음).

- [ ] **Step 5: 커밋**

```bash
git add app/lib/tradeStats.js tests/tradeStats.test.mjs
git commit -F .git/COMMIT_MSG_TMP.txt
```

```
feat(tradeStats): excludeAbnormal이 제외 거래를 사유와 함께 반환

시장 신호는 시세에서 걸러낸 해제·직거래를 지표로 쓴다. trades 반환은
그대로 둬서 시세 경로 4개는 불변이고, removed만 새로 얹었다.
```

---

### Task 3: `fetchRawMonths`가 제외 거래를 실어 보내기

**Files:**
- Modify: `app/lib/trades.js` (`fetchRawMonths` 안의 `finish()`, 약 135-147행)

**Interfaces:**
- Consumes: Task 2의 `excludeAbnormal(...).removed`
- Produces: `fetchRawMonths(...) -> { byYmd, fetchedYmds, latestFetched, excluded, removed }`
  - `removed`: 조회 구간 전체의 제외 거래 **평탄 배열**(월별로 나누지 않는다 — 신호는 날짜 창으로 자르므로 `dealYmd`만 있으면 된다).

- [ ] **Step 1: `finish()` 수정**

`app/lib/trades.js`의 `finish` 안, 기존 `const excluded = { cancelled: 0, direct: 0 };` 블록을 교체:

```js
    const excluded = { cancelled: 0, direct: 0 };
    const removed = []; // 제외된 거래 원본 — 시장 신호 지표용(2026-08-03)
    for (const [ymd, raw] of byYmd) {
      const r = excludeAbnormal(raw);
      byYmd.set(ymd, r.trades);
      excluded.cancelled += r.cancelled;
      excluded.direct += r.direct;
      removed.push(...r.removed);
    }
    return { byYmd, fetchedYmds, latestFetched, excluded, removed };
```

- [ ] **Step 2: 빌드 + 기존 테스트**

Run: `npx next build && npm test`

Expected: 통과. `removed`를 안 읽는 기존 호출부는 구조분해에서 그냥 무시한다.

- [ ] **Step 3: 커밋**

```bash
git add app/lib/trades.js
git commit -F .git/COMMIT_MSG_TMP.txt
```

```
feat(trades): fetchRawMonths 반환에 removed(제외 거래) 추가
```

---

### Task 4: `marketSignal.js` — 신호 집계 (순수 함수 + 테스트)

**Files:**
- Create: `app/lib/marketSignal.js`
- Test: `tests/marketSignal.test.mjs`

**Interfaces:**
- Consumes: Task 3의 `{ byYmd, removed }`
- Produces:
  ```js
  buildSignal({ trades, removed, asOf }) -> {
    days: 30,
    volume:    { count, prevCount, delta },        // delta = count - prevCount
    cancelled: { count, prevCount, delta, latestDay },
    direct:    { count, total, ratio, prevRatio }, // ratio 0~1, total=창 내 전체(kept+direct)
    corporate: { buy, sell, net, prevNet, available },
  }
  ```
  - `trades`: 시세용 kept 거래 평탄 배열
  - `removed`: 제외 거래 평탄 배열
  - `asOf`: 기준 시각(테스트 주입용, 기본 `new Date()`)
  - `corporate.available`: 표본에 `buyerGbn` 필드가 하나라도 있으면 `true`. `false`면 UI가 타일을 숨긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

Write 도구로 `tests/marketSignal.test.mjs` 생성:

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`

Expected: FAIL — `Cannot find module '../app/lib/marketSignal.js'`

- [ ] **Step 3: 구현**

Write 도구로 `app/lib/marketSignal.js` 생성:

```js
// 시장 신호 집계 — 참조 사이트(koreamonitor /estate)의 "시장 신호" 패널을 우리 데이터로.
// ⚠️ 서버 전용 trades.js와 분리 유지 — 클라 번들에 들어가는 순수 모듈(supabase 미의존).
//
// 지표의 원천은 **시세에서 걸러낸 거래**다. excludeAbnormal이 해제·직거래를 시세에서
// 빼는데(2026-07-29), 그 "걸러낸 것" 자체가 시장 신호다 — 해제 급증은 호가가 무너지는
// 신호이고, 직거래 비중은 증여성 거래가 얼마나 섞였는지를 말해준다.

const WINDOW_DAYS = 30;

const ymd = (d) => d.toISOString().slice(0, 10);

// [start, end) 안의 거래만. dealYmd는 "YYYY-MM-DD" 문자열이라 사전순 비교가 곧 날짜순이다.
const inRange = (arr, start, end) =>
  arr.filter((t) => t.dealYmd && t.dealYmd >= start && t.dealYmd < end);

export function buildSignal({ trades = [], removed = [], asOf = new Date() } = {}) {
  const end = ymd(asOf);
  const mid = ymd(new Date(asOf.getTime() - WINDOW_DAYS * 86400000));
  const start = ymd(new Date(asOf.getTime() - 2 * WINDOW_DAYS * 86400000));

  const now = inRange(trades, mid, end);
  const prev = inRange(trades, start, mid);

  const cancelledAll = removed.filter((t) => t.reason === "cancelled");
  const directAll = removed.filter((t) => t.reason === "direct");
  const cNow = inRange(cancelledAll, mid, end);
  const cPrev = inRange(cancelledAll, start, mid);
  const dNow = inRange(directAll, mid, end);
  const dPrev = inRange(directAll, start, mid);

  // 직거래 비중의 분모는 정상 + 직거래. 해제는 계약이 성사되지 않았으니 분모에서도 뺀다.
  const total = now.length + dNow.length;
  const prevTotal = prev.length + dPrev.length;

  // 옛 캐시 행엔 buyerGbn이 없다. 이때 0을 표시하면 "법인 거래가 없다"는 거짓말이 되므로
  // 표본에 필드가 하나도 없으면 available:false로 내려 UI가 타일을 숨기게 한다.
  const hasGbn = [...now, ...prev].some((t) => "buyerGbn" in t);
  const countBuy = (a) => a.filter((t) => t.buyerGbn === "법인").length;
  const countSell = (a) => a.filter((t) => t.slerGbn === "법인").length;

  return {
    days: WINDOW_DAYS,
    volume: {
      count: now.length,
      prevCount: prev.length,
      delta: now.length - prev.length,
    },
    cancelled: {
      count: cNow.length,
      prevCount: cPrev.length,
      delta: cNow.length - cPrev.length,
      // 해제일(cdealDay, "YY.MM.DD")이 있으면 가장 최근 것 — "언제 취소됐나" 캡션용.
      latestDay: cNow.map((t) => t.cdealDay).filter(Boolean).sort().pop() || null,
    },
    direct: {
      count: dNow.length,
      total,
      ratio: total ? dNow.length / total : 0,
      prevRatio: prevTotal ? dPrev.length / prevTotal : 0,
    },
    corporate: {
      buy: countBuy(now),
      sell: countSell(now),
      net: countBuy(now) - countSell(now),
      prevNet: countBuy(prev) - countSell(prev),
      available: hasGbn,
    },
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`

Expected: PASS (신규 6개 + 기존 38개).

- [ ] **Step 5: 커밋**

```bash
git add app/lib/marketSignal.js tests/marketSignal.test.mjs
git commit -F .git/COMMIT_MSG_TMP.txt
```

```
feat(marketSignal): 시장 신호 집계 모듈 + 테스트 6종

해제·직거래·법인 순매수·거래량을 최근 30일 vs 직전 30일로 집계한다.
buyerGbn이 없는 옛 캐시 표본은 available:false로 내려 UI가 타일을
숨기게 했다 — 0으로 표시하면 "법인 거래 없음"이라는 거짓말이 된다.
```

---

### Task 5: `/api/briefing` 확장 — 시장 신호 + 새 거래 피드

⚠️ **`cacheOnly` 성질을 절대 깨지 말 것.** 이 라우트는 외부 API를 호출하지 않는 것이 설계다(cron이 채운 캐시만 읽음). 깨면 Vercel 함수 타임아웃 위험이 생긴다.

**Files:**
- Modify: `app/api/briefing/route.js`

**Interfaces:**
- Consumes: `buildSignal` (Task 4), `fetchRawMonths(...).removed` (Task 3)
- Produces: 응답에 두 키 추가
  ```js
  {
    complexes: [...],   // 기존
    upcoming: [...],    // 기존
    signal: { byRegion: [{ lawdCd, ...buildSignal결과 }], asOf },
    feed: [{ lawdCd, umdNm, aptNm, area, amount, floor, dealDate, prevAmount }]
  }
  ```
  - `feed`: ★ 지역 전체의 최근 30일 거래, 최신순 상위 `FEED_MAX`(60). 자금 판정은 **클라에서** `calcMaxLoan`으로 — 프로필이 localStorage에 있어 서버가 모른다.

- [ ] **Step 1: import와 상수 추가**

`app/api/briefing/route.js` 상단 import에 추가:

```js
import { buildSignal } from "../../lib/marketSignal";
```

상수 블록에 추가:

```js
const FEED_MAX = 60; // 새 거래 피드 최대 행수 — 클라에서 자금 필터로 더 줄인다
```

- [ ] **Step 2: 지역별 원본을 신호용으로 함께 보관**

기존 `byCode` 수집 루프(31-40행)를 교체 — `removed`도 같이 담는다:

```js
  const byCode = new Map();
  const removedByCode = new Map();
  await Promise.all(
    codes.map(async (code) => {
      try {
        const { byYmd, removed } = await fetchRawMonths(code, ymds, { cacheOnly: true });
        byCode.set(code, [...byYmd.values()].flat());
        removedByCode.set(code, removed || []);
      } catch {
        byCode.set(code, []); // 캐시 미스는 그 지역만 조용히 생략
        removedByCode.set(code, []);
      }
    })
  );
```

- [ ] **Step 3: 신호와 피드 계산 (기존 `upcoming` 블록 뒤, `return` 앞에 추가)**

```js
  // 📊 시장 신호 — 관심 지역별. 캐시에 이미 있는 원본만 쓰므로 추가 비용이 없다.
  const asOf = new Date();
  const signal = {
    asOf: asOf.toISOString(),
    byRegion: codes.map((code) => ({
      lawdCd: code,
      ...buildSignal({
        trades: byCode.get(code) || [],
        removed: removedByCode.get(code) || [],
        asOf,
      }),
    })),
  };

  // 🆕 새 거래 피드 — 관심 지역 전체의 최근 거래(최신순). 자금 판정은 클라가 한다
  // (프로필이 localStorage에 있어 서버는 모른다).
  const feed = [];
  for (const code of codes) {
    const all = byCode.get(code) || [];
    // 같은 평형 직전 거래를 찾으려면 단지+평형별로 모아야 한다.
    const byKey = new Map();
    for (const t of all) {
      const k = `${t.umdNm}|${t.aptNm}|${Math.round(t.area)}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(t);
    }
    for (const list of byKey.values()) {
      list.sort((a, b) => (a.dealYmd < b.dealYmd ? 1 : -1)); // 최신순
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (t.dealYmd < cutoff) break; // 최신순이라 창을 벗어나면 이후도 벗어난다
        feed.push({
          lawdCd: code,
          umdNm: t.umdNm,
          aptNm: t.aptNm,
          area: t.area,
          amount: t.dealAmount,
          floor: t.floor,
          dealDate: t.dealYmd,
          prevAmount: list[i + 1] ? list[i + 1].dealAmount : null,
        });
      }
    }
  }
  feed.sort((a, b) => (a.dealDate < b.dealDate ? 1 : -1));
```

- [ ] **Step 4: 응답에 추가**

마지막 `return`을 교체:

```js
  return Response.json({ complexes, upcoming, signal, feed: feed.slice(0, FEED_MAX) });
```

- [ ] **Step 5: 로컬 확인**

```bash
npm run dev
```
"Ready" 대기 후:
```bash
curl -s "http://localhost:3000/api/briefing" > /tmp-briefing.json
```
⚠️ Git Bash에서 `curl -o /tmp/x`한 파일은 node가 못 읽는다(win 경로 불일치) → 결과 확인은 `node -e`의 fetch로:
```bash
node -e "fetch('http://localhost:3000/api/briefing').then(r=>r.json()).then(d=>console.log(JSON.stringify({sig:d.signal&&d.signal.byRegion,feedLen:d.feed&&d.feed.length,feed0:d.feed&&d.feed[0]},null,1)))"
```

Expected: `signal.byRegion`에 즐겨찾기 지역 수만큼 항목, 각각 `volume/cancelled/direct/corporate`. `feedLen > 0`, `feed0`에 단지명·금액·`dealDate`.

⚠️ 즐겨찾기가 없으면 25행에서 조기 반환한다 — 그 경우 지도에서 ★를 하나 담고 다시 호출할 것.

- [ ] **Step 6: 빌드 + 커밋**

```bash
npx next build
git add app/api/briefing/route.js
git commit -F .git/COMMIT_MSG_TMP.txt
```

```
feat(briefing): 응답에 시장 신호·새 거래 피드 추가

cacheOnly 성질은 그대로 — cron이 채운 trade_raw_cache만 읽어
외부 API 호출은 여전히 0이다.
```

---

### Task 6: `Briefing.js`를 `components/briefing/` 디렉터리로 분리 (동작 불변)

카드 3개를 더 얹기 전에 쪼갠다. KakaoMap.js가 1263→1751줄로 되자란 전철을 밟지 않기 위함.

**Files:**
- Create: `app/components/briefing/FavoriteCard.js`, `ScheduleCard.js`, `ImpactNewsCard.js`, `styles.js`
- Modify: `app/components/Briefing.js` (컨테이너만 남김)

**Interfaces:**
- Produces:
  - `styles.js`: `card`, `cardHead`, `headSub`, `row`, `rowDivider`, `rowTop`, `rowName`, `rowPrice`, `rowMeta`, `rowBadges`, `tagBase`, `upTag`, `downTag`, `okTag`, `noTag`, `emptyHint` — 현 `Briefing.js:204-231`에서 그대로 옮긴다.
  - `<FavoriteCard complexes seen profile assets hasIncome />`
  - `<ScheduleCard upcoming />`
  - `<ImpactNewsCard news />`
  - `Briefing.js`가 `usableAssets(p)`를 계속 export하지 않고 내부 유지(외부 사용처 없음 — grep로 확인할 것).

- [ ] **Step 1: 스타일 상수부터 옮기기**

`app/components/briefing/styles.js`를 만들고 `Briefing.js:204-231`의 상수 16개를 **그대로** 옮겨 각각 `export const`로. import는 `../../lib/palette`(경로가 한 단계 깊어진다).

⚠️ 옮기기 전 이름 grep: `grep -rn "upTag\|okTag\|noTag\|rowBadges" app/` — `mapStyles.js`와 충돌하는 이름이 없는지 확인(충돌 시 dev 컴파일 에러).

- [ ] **Step 2: 카드 3개를 파일로 분리**

각 파일은 `"use client";` + `styles.js`에서 스타일 import + 현 `Briefing.js`의 해당 `<section>` JSX를 그대로 옮긴다. `FavoriteCard`는 `calcMaxLoan`·`formatManwon`·`shortDate`·`regionName`·`isNew`·`complexKey`를, `ImpactNewsCard`는 `classifyNews`를 쓴다(경로 `../../lib/...`).

⚠️ `FavoriteCard`는 `calcMaxLoan` 호출에 `profile`이 필요하다. `hasIncome`이 false면 `ln=null`이 되어야 하므로 **props로 `hasIncome`을 받아 그대로 쓴다**(카드 안에서 다시 판정하지 말 것 — 판정 기준이 갈리면 지도와 숫자가 어긋난다).

- [ ] **Step 3: `Briefing.js`를 컨테이너로 축소**

fetch·localStorage·`usableAssets`·빈 상태 판정만 남기고, 렌더는 카드 3개를 조립:

```jsx
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.complexes?.length > 0 && (
        <FavoriteCard
          complexes={data.complexes} seen={seen} profile={profile}
          assets={assets} hasIncome={hasIncome}
        />
      )}
      {data.upcoming?.length > 0 && <ScheduleCard upcoming={data.upcoming} />}
      {impact.length > 0 && <ImpactNewsCard news={impact} />}
    </div>
  );
```

- [ ] **Step 4: 동작 불변 확인**

Run: `npx next build && npm test`

그리고 브라우저 육안 — 분리 전후 `/news` 상단이 **똑같이** 보여야 한다.

- [ ] **Step 5: 커밋**

```bash
git add app/components/Briefing.js app/components/briefing/
git commit -F .git/COMMIT_MSG_TMP.txt
```

```
refactor(briefing): 카드별 파일로 분리 (동작 불변)

카드 3개를 더 얹기 전에 쪼갰다. KakaoMap.js가 1263→1751줄로
되자란 전철을 피하려는 것.
```

---

### Task 7: `StatTile` + 📊 시장 신호 카드

**Files:**
- Create: `app/components/StatTile.js`, `app/components/briefing/MarketSignalCard.js`
- Modify: `app/components/Briefing.js`

**Interfaces:**
- Produces: `<StatTile label value caption tone />` — `tone`: `"neutral" | "warn"` (기본 neutral)
- `<MarketSignalCard signal />` — `signal`은 Task 5의 `{ asOf, byRegion }`

- [ ] **Step 1: `StatTile` 작성**

```jsx
"use client";

// 스탯 타일 — 작은 라벨 / 큰 숫자 / 캡션. 참조 사이트(koreamonitor)의 정보 밀도를 차용.
// ⚠️ 색은 tone 2종뿐이다. 상승=빨강 관례를 쓰지 않는 이유는 이 앱에서 빨강이 이미
//    "자금부족"을 뜻해서다 — 한 색이 두 뜻이 되면 마커 색칠과 충돌한다(2026-08-03).

import { C } from "../lib/palette";

export default function StatTile({ label, value, caption, tone = "neutral" }) {
  return (
    <div style={tile}>
      <div style={tileLabel}>{label}</div>
      <div style={{ ...tileValue, color: tone === "warn" ? C.amber : C.text }}>{value}</div>
      {caption && <div style={tileCaption}>{caption}</div>}
    </div>
  );
}

const tile = {
  background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12,
  padding: "10px 12px", minWidth: 0,
};
const tileLabel = { fontSize: 10.5, fontWeight: 700, color: C.muted, whiteSpace: "nowrap" };
const tileValue = {
  fontSize: 20, fontWeight: 800, marginTop: 3, lineHeight: 1.15,
  fontVariantNumeric: "tabular-nums",
};
const tileCaption = { fontSize: 10.5, color: C.muted, marginTop: 3, lineHeight: 1.4 };
```

- [ ] **Step 2: `MarketSignalCard` 작성**

지역이 여럿이면 지역별 섹션을 세로로. 타일은 **2×2 그리드**(`/news`가 640px 단일 컬럼이라 4열은 안 들어간다).

```jsx
"use client";

// 📊 시장 신호 — 시세에서 걸러낸 거래를 지표로 되살린 카드.
// 참조: koreamonitor /estate "시장 신호" 패널.

import StatTile from "../StatTile";
import { regionName } from "../../lib/regions";
import { C } from "../../lib/palette";
import { card, cardHead, headSub } from "./styles";

// 증감 표기 — ▲▼ + 부호. 색은 쓰지 않는다(빨강=자금부족과 충돌하므로).
const deltaText = (d) => (d === 0 ? "직전 30일과 같음" : `직전 30일 대비 ${d > 0 ? "▲" : "▼"}${Math.abs(d)}`);

export default function MarketSignalCard({ signal }) {
  const regions = (signal?.byRegion || []).filter((r) => r.volume.count + r.volume.prevCount > 0);
  if (!regions.length) return null;

  return (
    <section>
      <div style={cardHead}>
        📊 시장 신호 <span style={headSub}>· 최근 30일 · 국토부 신고분</span>
      </div>
      <div style={card}>
        {regions.map((r, i) => (
          <div key={r.lawdCd} style={{ padding: "11px 15px", ...(i > 0 ? { borderTop: `1px solid ${C.divider}` } : null) }}>
            <div style={regionLabel}>{regionName(r.lawdCd)}</div>
            <div style={grid}>
              <StatTile
                label="거래량"
                value={`${r.volume.count}건`}
                caption={deltaText(r.volume.delta)}
              />
              <StatTile
                label="계약 해제"
                value={`${r.cancelled.count}건`}
                caption={r.cancelled.latestDay ? `최근 ${r.cancelled.latestDay}` : deltaText(r.cancelled.delta)}
                tone={r.cancelled.delta > 0 ? "warn" : "neutral"}
              />
              <StatTile
                label="직거래 비중"
                value={`${(r.direct.ratio * 100).toFixed(1)}%`}
                caption={`${r.direct.count}건 / 전체 ${r.direct.total}건`}
              />
              {r.corporate.available && (
                <StatTile
                  label="법인 순매수"
                  value={`${r.corporate.net > 0 ? "+" : ""}${r.corporate.net}건`}
                  caption={`매수 ${r.corporate.buy} · 매도 ${r.corporate.sell}`}
                />
              )}
            </div>
          </div>
        ))}
        <div style={footnote}>
          해제·직거래는 시세 계산에서 빠진 거래예요. ⚠️ 해제는 계약보다 나중에 신고돼
          최근 30일 수치는 나중에 더 늘 수 있어요.
        </div>
      </div>
    </section>
  );
}

const regionLabel = { fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 7 };
const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 };
const footnote = {
  padding: "9px 15px", borderTop: `1px solid ${C.divider}`,
  fontSize: 10.5, color: C.muted, lineHeight: 1.5, background: "#fafbfc",
};
```

- [ ] **Step 3: `Briefing.js`에 끼우기**

`ScheduleCard` 다음 줄에:

```jsx
      {data.signal && <MarketSignalCard signal={data.signal} />}
```

⚠️ 빈 상태 로직 주의 — 현재 `hasAny`(복수 즐겨찾기 거래/일정)가 false면 `emptyHint`로 조기 반환한다. 시장 신호도 즐겨찾기 지역 기반이라 이 조기 반환 안에 있어도 맞다. **그대로 둔다.**

- [ ] **Step 4: 빌드 + 브라우저 확인**

Run: `npx next build`

브라우저에서 `/news` — 타일 4개(또는 법인 미가용 시 3개)가 2×2로 뜨고 숫자가 채워지는지.

- [ ] **Step 5: 커밋**

```bash
git add app/components/StatTile.js app/components/briefing/MarketSignalCard.js app/components/Briefing.js
git commit -F .git/COMMIT_MSG_TMP.txt
```

```
feat(briefing): 📊 시장 신호 카드 + 스탯 타일

해제·직거래·법인 순매수·거래량을 2×2 타일로. 증감은 ▲▼로 표기하고
색을 쓰지 않았다 — 이 앱의 빨강은 이미 "자금부족"이라 충돌한다.
```

---

### Task 8: 🆕 새 거래 피드 카드

**Files:**
- Create: `app/components/briefing/DealFeedCard.js`
- Modify: `app/components/Briefing.js`

**Interfaces:**
- Consumes: Task 5의 `feed`
- Produces: `<DealFeedCard feed favorites profile assets hasIncome />`
  - `favorites`: ★ 단지 키 Set — `${lawdCd}|${umdNm}|${aptNm}`. `data.complexes`에서 만든다.

- [ ] **Step 1: 카드 작성**

탭 2종. `★단지`가 기본이고, `관심지역`은 자금 설정이 있을 때 **살 수 있는 것만** 보여준다.

```jsx
"use client";

// 🆕 새 거래 피드 — 관심 지역에 새로 신고된 실거래.
// 참조 사이트(koreamonitor)의 "방금 신고된 실거래"를 우리 맥락으로: 전국이 아니라
// 내 관심 범위만 보고, 각 거래에 **내 자금 대비 판정**을 붙인다(참조엔 없는 축).

import { useMemo, useState } from "react";
import { calcMaxLoan } from "../../lib/loanPolicy";
import { formatManwon, shortDate } from "../../lib/format";
import { toPyeong } from "../../lib/tradeStats";
import { regionName } from "../../lib/regions";
import { C } from "../../lib/palette";
import { card, cardHead, headSub, row, rowDivider, rowTop, rowName, rowPrice, rowMeta, rowBadges, okTag, noTag, upTag, downTag } from "./styles";

const MAX_ROWS = 12;

export default function DealFeedCard({ feed, favorites, profile, assets, hasIncome }) {
  const [tab, setTab] = useState("fav");

  // 자금 여유 계산은 지도·관심단지 카드와 같은 calcMaxLoan을 쓴다(숫자가 어긋나지 않게).
  const withGap = useMemo(
    () =>
      (feed || []).map((t) => {
        if (!hasIncome) return { ...t, gap: null };
        const ln = calcMaxLoan({
          price: t.amount,
          lawdCd: t.lawdCd,
          householdType: profile.householdType,
          isFirstTime: profile.isFirstTime,
          annualIncome: Number(profile.income),
          existingAnnualDebt: Number(profile.existingDebt) || 0,
          rate: (Number(profile.rate) || 0) / 100,
          termYears: Number(profile.termYears) || 40,
          area: t.area,
          assets,
        });
        return { ...t, gap: ln && ln.maxLoan > 0 ? assets - ln.requiredCash : null };
      }),
    [feed, profile, assets, hasIncome]
  );

  const rows = useMemo(() => {
    if (tab === "fav") {
      return withGap.filter((t) => favorites.has(`${t.lawdCd}|${t.umdNm}|${t.aptNm}`)).slice(0, MAX_ROWS);
    }
    // 관심지역 탭: 자금을 넣었으면 살 수 있는 것만 추린다(안 넣었으면 전부).
    const list = hasIncome ? withGap.filter((t) => t.gap != null && t.gap >= 0) : withGap;
    return list.slice(0, MAX_ROWS);
  }, [withGap, tab, favorites, hasIncome]);

  if (!feed?.length) return null;

  return (
    <section>
      <div style={cardHead}>
        🆕 새 거래 <span style={headSub}>· 최근 30일 · 국토부 신고분</span>
      </div>
      <div style={card}>
        <div style={tabRow}>
          <button onClick={() => setTab("fav")} style={{ ...tabBtn, ...(tab === "fav" ? tabBtnOn : null) }}>
            ★ 단지
          </button>
          <button onClick={() => setTab("region")} style={{ ...tabBtn, ...(tab === "region" ? tabBtnOn : null) }}>
            관심 지역{hasIncome ? " · 살 수 있는 것" : ""}
          </button>
        </div>

        {rows.length === 0 ? (
          <div style={emptyRow}>
            {tab === "fav"
              ? "★ 담은 단지에 최근 30일 새 거래가 없어요."
              : "조건에 맞는 새 거래가 없어요."}
          </div>
        ) : (
          rows.map((t, i) => {
            const chg = t.prevAmount ? ((t.amount - t.prevAmount) / t.prevAmount) * 100 : null;
            return (
              <div key={`${t.lawdCd}-${t.umdNm}-${t.aptNm}-${t.dealDate}-${t.amount}-${i}`}
                   style={{ ...row, ...(i > 0 ? rowDivider : null) }}>
                <div style={rowTop}>
                  <span style={rowName}>{t.aptNm}</span>
                  <span style={rowPrice}>{formatManwon(t.amount)}</span>
                </div>
                <div style={rowMeta}>
                  {regionName(t.lawdCd)} {t.umdNm} · {toPyeong(t.area)}평
                  {t.floor ? ` · ${t.floor}층` : ""} · {shortDate(t.dealDate)} 계약
                </div>
                <div style={rowBadges}>
                  {chg != null && (
                    <span style={chg >= 0 ? upTag : downTag}>
                      직전 대비 {chg >= 0 ? "+" : ""}{chg.toFixed(1)}%
                    </span>
                  )}
                  {t.gap != null && (
                    <span style={t.gap >= 0 ? okTag : noTag}>
                      {t.gap >= 0 ? `✓ 여유 ${formatManwon(t.gap)}` : `부족 ${formatManwon(-t.gap)}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

const tabRow = { display: "flex", gap: 6, padding: "10px 15px 0" };
const tabBtn = {
  fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 999,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.sub, cursor: "pointer",
};
const tabBtnOn = { borderColor: C.blue, background: C.blueSoft, color: C.blue };
const emptyRow = { padding: "14px 15px", fontSize: 12, color: C.muted };
```

⚠️ `tabBtn`/`tabBtnOn`은 **비shorthand `border`**를 쓴다(`borderWidth`/`borderStyle`/`borderColor`). shorthand `border`를 쓰고 On에서 `borderColor`만 덮으면 React dev 경고가 난다 — `pillBtn`이 같은 이유로 이 패턴이다.

- [ ] **Step 2: `Briefing.js`에 끼우기**

`favorites` Set을 만들어 넘긴다. `MarketSignalCard` 다음 줄:

```jsx
      {data.feed?.length > 0 && (
        <DealFeedCard
          feed={data.feed}
          favorites={new Set((data.complexes || []).map((c) => `${c.lawdCd}|${c.umdNm}|${c.aptNm}`))}
          profile={profile} assets={assets} hasIncome={hasIncome}
        />
      )}
```

- [ ] **Step 3: 빌드 + 브라우저 확인**

Run: `npx next build`

브라우저: 탭 2개가 전환되는지, `관심 지역` 탭에서 자금 배지(✓여유/부족)가 뜨는지.

- [ ] **Step 4: 커밋**

```bash
git add app/components/briefing/DealFeedCard.js app/components/Briefing.js
git commit -F .git/COMMIT_MSG_TMP.txt
```

```
feat(briefing): 🆕 새 거래 피드 카드 (★단지 / 관심지역 탭)

관심지역 탭은 내 자금으로 살 수 있는 거래만 추린다. 판정은 지도와 같은
calcMaxLoan이라 두 화면의 숫자가 어긋나지 않는다.
```

---

### Task 9: 청약 백엔드 — `applyhome.js` + 0007 + 수집 합류

✅ **2026-08-03 활용신청 승인 완료** — APT 분양 2,836건 / 무순위 1,647건 정상 응답 확인.
기존 `DATA_GO_KR_KEY` 그대로 동작한다(계정당 키 1개를 서비스별로 승인하는 구조).
그래도 `kapt.js`의 graceful 패턴은 유지한다 — 쿼터 초과·장애 시 카드만 조용히 빠져야 한다.

**Files:**
- Create: `app/lib/applyhome.js`, `supabase/migrations/0007_subscription_items.sql`, `app/api/subscription/route.js`
- Modify: `app/api/cron/news/route.js`

**Interfaces:**
- Produces:
  - `fetchSubscriptions() -> [{ houseManageNo, name, region, address, kind, receiptStart, receiptEnd, winnerDate, households, url }]` — 실패 시 `[]`
  - `isCapitalRegion(region)` — 수도권("서울"/"경기"/"인천") 판정
  - `GET /api/subscription -> { items: [...] }`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/0007_subscription_items.sql`:

```sql
-- 청약홈 분양정보 저장소 — /api/cron/news 가 매일 채우고 /api/subscription 이 읽는다.
-- house_manage_no 를 PK 로 써서 재수집 시 자연 중복 제거(upsert). news_items 와 같은 패턴.
-- RLS on + 정책 없음 → 서버(secret 키)만 접근.
create table if not exists public.subscription_items (
  house_manage_no text        primary key,          -- 청약홈 주택관리번호 (중복 제거 키)
  name            text        not null,             -- 단지명
  region          text,                             -- 시도명 (수도권 필터용)
  address         text,
  kind            text,                             -- 분양 구분 (APT / 무순위 등)
  receipt_start   date,
  receipt_end     date,
  winner_date     date,
  households      integer,
  url             text,
  fetched_at      timestamptz not null default now()
);
create index if not exists subscription_items_receipt_idx
  on public.subscription_items (receipt_end);
alter table public.subscription_items enable row level security;
```

- [ ] **Step 2: 마이그레이션 적용**

supabase MCP `apply_migration`으로 적용(2026-07-08부터 DDL 가능). 실패하면 대시보드 SQL Editor 폴백.

- [ ] **Step 3: `applyhome.js` 작성**

```js
// 청약홈 분양정보 수집 — 참조 사이트(koreamonitor)의 "청약 레이더"를 우리 수도권 범위로.
//
// ⚠️ 이 API는 data.go.kr 서비스별 **활용신청**이 필요하다. 미승인이면 401
//    {"code":-4,"msg":"등록되지 않은 인증키 입니다."}가 온다(2026-08-03 실측 — 인증 방식
//    3종 모두 동일). kapt.js와 같은 graceful 방침: 실패하면 빈 배열을 돌려주고 카드를
//    숨긴다. 승인되는 순간 재배포 없이 동작한다.
// ⚠️ 실거래가 API(XML 전용)와 달리 이 계열은 **JSON**이다.

const BASE = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1";
const PER_PAGE = 100;
const CAPITAL = ["서울", "경기", "인천"];

// 앱 전체가 수도권 범위다(regions.js 서울25+경기, news의 isCapitalAreaNews와 같은 정신).
export function isCapitalRegion(region) {
  return CAPITAL.some((r) => (region || "").includes(r));
}

async function fetchOne(path) {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) return [];
  const url = `${BASE}/${path}?page=1&perPage=${PER_PAGE}&serviceKey=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return []; // 401(미승인) 포함 — 조용히 생략
    const j = await r.json();
    return Array.isArray(j?.data) ? j.data : [];
  } catch {
    return [];
  }
}

const pickDate = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

// ⚠️ 필드명은 2026-08-03 승인 직후 실제 응답에서 확인한 것(APT 2836건·무순위 1647건).
//    키는 전부 대문자 스네이크. 추측하지 말 것 — 아래 접수일 차이가 특히 함정이다.
function normalize(row, kind) {
  const name = row.HOUSE_NM;
  const no = row.HOUSE_MANAGE_NO;
  if (!name || !no) return null;
  return {
    houseManageNo: String(no),
    name,
    region: row.SUBSCRPT_AREA_CODE_NM || "",
    address: row.HSSPLY_ADRES || "",
    kind,
    // ⚠️ 접수일 필드명이 두 엔드포인트에서 **다르다**(2026-08-03 실측):
    //    APT 분양 = RCEPT_BGNDE/RCEPT_ENDDE
    //    무순위    = SUBSCRPT_RCEPT_BGNDE/SUBSCRPT_RCEPT_ENDDE (RCEPT_BGNDE 자체가 없음)
    //    한쪽만 읽으면 무순위 접수일이 전부 null이 되어 "접수 임박순" 정렬이 무너진다.
    receiptStart: pickDate(row.RCEPT_BGNDE || row.SUBSCRPT_RCEPT_BGNDE || row.GNRL_RCEPT_BGNDE),
    receiptEnd: pickDate(row.RCEPT_ENDDE || row.SUBSCRPT_RCEPT_ENDDE || row.GNRL_RCEPT_ENDDE),
    winnerDate: pickDate(row.PRZWNER_PRESNATN_DE),
    households: Number(row.TOT_SUPLY_HSHLDCO) || null,
    url: row.PBLANC_URL || null,
  };
}

// 수도권 분양·무순위 목록. 실패하면 [] — 호출부는 카드를 숨긴다.
export async function fetchSubscriptions() {
  const [apt, remndr] = await Promise.all([
    fetchOne("getAPTLttotPblancDetail"),
    fetchOne("getRemndrLttotPblancDetail"),
  ]);
  const rows = [
    ...apt.map((r) => normalize(r, "APT")),
    ...remndr.map((r) => normalize(r, "무순위")),
  ].filter(Boolean);
  return rows.filter((r) => isCapitalRegion(r.region));
}
```

⚠️ **필드명 확인 필요** — odcloud는 한글 키를 쓰는 경우가 흔한데 미승인이라 실제 응답을 못 봤다. 위 `normalize`는 한글/영문 대문자/카멜 3형태를 모두 훑는 방어적 구현이다. 승인 후 실제 응답을 덤프해 **맞는 키만 남기고 정리할 것**.

- [ ] **Step 4: `/api/subscription` 라우트**

```js
// 🏗 청약 레이더 — cron이 채운 subscription_items를 접수 임박순으로 읽는다.
import { supabaseAdmin, noDbResponse } from "../../lib/supabaseServer";

export async function GET() {
  if (!supabaseAdmin) return noDbResponse();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("subscription_items")
    .select("*")
    .gte("receipt_end", today)
    .order("receipt_end", { ascending: true })
    .limit(20);
  // 테이블이 없거나(0007 미적용) 비어 있으면 조용히 빈 목록 — 카드가 안 뜬다.
  if (error) return Response.json({ items: [] });
  return Response.json({ items: data || [] });
}
```

- [ ] **Step 5: cron 합류**

`app/api/cron/news/route.js`의 뉴스 수집·프루닝이 끝난 뒤에 추가(⚠️ Hobby cron 한도 2개가 꽉 차 새 cron을 만들 수 없어 여기 합친다):

```js
  // 🏗 청약 수집 — Vercel Hobby는 프로젝트당 cron 2개가 한도라(refresh 06:00 + news 06:30)
  //    새 cron을 만들 수 없어 여기 합친다. 미승인 API면 []가 와서 조용히 넘어간다.
  let subscriptions = 0;
  try {
    const subs = await fetchSubscriptions();
    if (subs.length) {
      await supabaseAdmin.from("subscription_items").upsert(
        subs.map((s) => ({
          house_manage_no: s.houseManageNo, name: s.name, region: s.region,
          address: s.address, kind: s.kind, receipt_start: s.receiptStart,
          receipt_end: s.receiptEnd, winner_date: s.winnerDate,
          households: s.households, url: s.url, fetched_at: new Date().toISOString(),
        })),
        { onConflict: "house_manage_no" }
      );
      subscriptions = subs.length;
      // 접수 종료 30일 지난 건 정리(news_items 프루닝과 같은 방침).
      const cut = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      await supabaseAdmin.from("subscription_items").delete().lt("receipt_end", cut);
    }
  } catch {
    /* 청약 실패가 뉴스 수집을 망치지 않게 */
  }
```

응답 JSON에 `subscriptions`를 포함시킨다. import 추가: `import { fetchSubscriptions } from "../../../lib/applyhome";`

⚠️ 프루닝 delete는 **운영 테이블 대량 delete가 자동 권한 분류기에 막힐 수 있다**(2026-07-12 news_items). 막히면 delete를 빼고 조회에서 `gte("receipt_end", today)`로 거르는 것만으로 충분하다 — 이미 그렇게 돼 있다.

- [ ] **Step 6: 로컬 확인 + 커밋**

```bash
npm run dev
node -e "fetch('http://localhost:3000/api/subscription').then(r=>r.json()).then(d=>console.log(d.items.length,'건'))"
```

Expected: 미승인 상태면 `0 건`(에러 없이). 승인 후엔 수도권 건수.

```bash
npx next build
git add app/lib/applyhome.js app/api/subscription/route.js app/api/cron/news/route.js supabase/migrations/0007_subscription_items.sql
git commit -F .git/COMMIT_MSG_TMP.txt
```

```
feat(subscription): 청약홈 수집 + /api/subscription (graceful)

data.go.kr 활용신청 미승인 상태에선 401이 와서 빈 목록이 되고 카드가
뜨지 않는다(kapt.js와 같은 방침). 승인되면 재배포 없이 동작한다.
Hobby cron 한도 2개가 꽉 차 수집은 /api/cron/news에 합쳤다.
```

---

### Task 10: 🏗 청약 레이더 카드

**Files:**
- Create: `app/components/briefing/SubscriptionCard.js`
- Modify: `app/components/Briefing.js`

**Interfaces:**
- Consumes: `GET /api/subscription`
- Produces: `<SubscriptionCard />` — 스스로 fetch하고 **빈 목록이면 `null` 반환**(미승인 시 카드가 아예 안 뜬다)

- [ ] **Step 1: 카드 작성**

```jsx
"use client";

// 🏗 청약 레이더 — 수도권 분양·무순위, 접수 임박순.
// ⚠️ 청약홈 API가 미승인이면 목록이 비어 이 카드는 렌더되지 않는다(설계된 동작).

import { useEffect, useState } from "react";
import { daysUntil } from "../../lib/format";
import { C } from "../../lib/palette";
import { card, cardHead, headSub, row, rowDivider, rowTop, rowName, rowPrice, rowMeta } from "./styles";

const MAX_ROWS = 6;

export default function SubscriptionCard() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    fetch("/api/subscription")
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([])); // 실패해도 나머지 브리핑은 살린다
  }, []);

  if (!items?.length) return null;

  return (
    <section>
      <div style={cardHead}>
        🏗 청약 레이더 <span style={headSub}>· 수도권 · 접수 임박순</span>
      </div>
      <div style={card}>
        {items.slice(0, MAX_ROWS).map((it, i) => {
          const d = it.receipt_end ? daysUntil(it.receipt_end) : null;
          return (
            <a key={it.house_manage_no} href={it.url || "#"} target="_blank" rel="noreferrer"
               className="news-row"
               style={{ ...row, textDecoration: "none", color: "inherit", ...(i > 0 ? rowDivider : null) }}>
              <div style={rowTop}>
                <span style={rowName}>{it.name}</span>
                {d != null && (
                  <span style={{ ...rowPrice, color: d <= 3 ? C.red : "#b45309" }}>
                    {d === 0 ? "오늘 마감" : `D-${d}`}
                  </span>
                )}
              </div>
              <div style={rowMeta}>
                {it.region} · {it.kind}
                {it.households ? ` · ${it.households}세대` : ""}
                {it.receipt_start && it.receipt_end ? ` · 접수 ${it.receipt_start.slice(5)}~${it.receipt_end.slice(5)}` : ""}
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
```

⚠️ `daysUntil`은 `lib/format.js`에 이미 있다(즐겨찾기 D-day용). 새로 만들지 말 것.

- [ ] **Step 2: `Briefing.js`에 끼우기**

⚠️ **여기가 빈 상태 로직이 바뀌는 지점이다.** 청약 카드는 즐겨찾기와 무관한데, 현재 `hasAny`가 false면 `emptyHint`로 조기 반환해 청약도 같이 사라진다. `emptyHint` 반환을 다음으로 교체:

```jsx
  // 즐겨찾기가 없어도 청약 레이더는 뜬다(즐겨찾기와 무관한 정보라서).
  if (!hasAny) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={emptyHint}>
          지도에서 <b>★</b>로 관심 단지를 담으면, 여기에 그 단지의 새 실거래와 일정이 떠요.
        </div>
        <SubscriptionCard />
      </div>
    );
  }
```

그리고 정상 경로에서는 `DealFeedCard` 다음에 `<SubscriptionCard />`를 둔다.

⚠️ `emptyHint`는 Task 6에서 `./briefing/styles`로 옮겼으므로 import 경로를 확인할 것.

- [ ] **Step 3: 빌드 + 확인**

Run: `npx next build`

미승인 상태에선 카드가 **안 보이는 것이 정상**이다. `/api/subscription`이 `{items:[]}`를 주는지로 확인.

- [ ] **Step 4: 커밋**

```bash
git add app/components/briefing/SubscriptionCard.js app/components/Briefing.js
git commit -F .git/COMMIT_MSG_TMP.txt
```

```
feat(briefing): 🏗 청약 레이더 카드

미승인 상태에선 목록이 비어 카드가 렌더되지 않는다. 즐겨찾기가 없는
사용자에게도 뜨도록 빈 상태 분기에도 넣었다(청약은 ★와 무관한 정보).
```

---

### Task 11: 최종 검증

**Files:**
- Create(임시): `scripts/tmp-verify-news.mjs` — 확인 후 삭제

- [ ] **Step 1: 빌드 + 테스트**

```bash
npx next build && npm test
```

Expected: 빌드 통과 · 테스트 44개(기존 36 + 신규 8) 전부 통과.

- [ ] **Step 2: Playwright 실측 스크립트**

Write 도구로 `scripts/tmp-verify-news.mjs` 생성. 데스크톱 + 모바일 390px에서 카드 존재와 **겹침을 px 부호로** 판정:

```js
import { chromium } from "playwright";
const OUT = "C:\\Users\\1226c\\AppData\\Local\\Temp\\claude\\C--Users-1226c-Projects-Budongsan\\fa52c5aa-31da-4683-820d-182086230679\\scratchpad";
const b = await chromium.launch({ channel: "chrome", headless: true });

for (const [label, vp] of [["desktop", { width: 1280, height: 950 }], ["mobile", { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp });
  await p.goto("http://localhost:3000/news", { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(2500);

  const heads = await p.$$eval("section > div", (els) =>
    els.map((e) => e.innerText.trim().split("\n")[0]).filter((t) => /^[📊🆕🏗⭐⏳💰]/.test(t))
  );
  console.log(`[${label}] 카드:`, heads.join(" | "));

  // 스탯 타일 실측 — 2×2 그리드가 컬럼을 넘치지 않는지
  const overflow = await p.evaluate(() => {
    const d = document.documentElement;
    return { scrollW: d.scrollWidth, clientW: d.clientWidth, overflows: d.scrollWidth > d.clientWidth };
  });
  console.log(`[${label}] 가로 오버플로:`, JSON.stringify(overflow));

  await p.screenshot({ path: `${OUT}\\news-${label}.png`, fullPage: true });
  await p.close();
}
await b.close();
```

- [ ] **Step 3: 실행**

```bash
npm run dev     # 백그라운드
node scripts/tmp-verify-news.mjs
```

Expected:
- 카드 목록에 `📊 시장 신호`, `🆕 새 거래`가 있다(청약은 미승인이라 없는 것이 정상).
- **`overflows: false`** — 참조 사이트는 3열 대시보드라 타일이 4열이지만 우리는 640px 단일 컬럼이다. 2×2가 넘치면 여기서 잡힌다.

- [ ] **Step 4: 스크린샷 육안 확인 후 정리**

```bash
rm -f scripts/tmp-verify-news.mjs
git status -s   # scripts/tmp-* 잔재 없어야 함
```

- [ ] **Step 5: PROGRESS.md 갱신 + 최종 커밋**

`PROGRESS.md` 맨 위에 `## ✅ 시장 신호 · 새 거래 피드 · 청약 레이더 (2026-08-03)` 섹션 추가 — 참조 사이트 실사 내용, 채택/제외 판단과 사유, 실측 수치, 청약 미승인 상태를 기록.

`CLAUDE.md`에도 추가할 것:
- `excludeAbnormal`의 `removed` 반환과 그것이 시장 신호의 원천이라는 점
- `lacksDealFlags`가 `buyerGbn`도 검사한다는 점(지우면 법인 지표가 빈다)
- 청약 API 미승인 상태와 승인 시 자동 동작
- `components/briefing/` 분리

```bash
git add PROGRESS.md CLAUDE.md
git commit -F .git/COMMIT_MSG_TMP.txt
```

- [ ] **Step 6: push 여부 확인**

⚠️ **직접 push하지 말 것.** `git log origin/main..main`으로 나갈 커밋을 보여주고 사용자에게 확인받는다 — push하면 Vercel이 자동 배포하고, 이전 세션의 미push 커밋이 함께 나갈 수 있다.

---

## Self-Review

**스펙 커버리지**
- 시장 신호 4지표 → Task 1(필드)·2(removed)·3(전달)·4(집계)·7(UI) ✅
- 새 거래 피드 2탭 → Task 5(API)·8(UI) ✅
- 청약 레이더 → Task 9(백엔드)·10(UI) ✅
- 스탯 타일/출처 칩/각주/인라인 배지 → Task 7·8·10 ✅
- 상승=빨강 미도입 → Global Constraints + Task 7 `deltaText`(색 없음) ✅
- `briefing/` 분리 → Task 6 ✅
- 검증 3종 → Task 11 ✅

**타입 일관성**
- `excludeAbnormal.removed` (Task 2) → `fetchRawMonths.removed` (Task 3) → `buildSignal({removed})` (Task 4) ✅
- `buildSignal` 반환 키(`volume/cancelled/direct/corporate`)가 Task 7 UI와 일치 ✅
- `feed` 항목 키(`lawdCd/umdNm/aptNm/area/amount/floor/dealDate/prevAmount`)가 Task 5 생성부와 Task 8 소비부에서 일치 ✅
- `styles.js` export 이름이 Task 6 정의와 Task 7·8·10 import에서 일치 ✅

**알려진 미확정 2건** (계획에 분기를 명시해둠)
1. `buyerGbn`/`slerGbn` 실재 여부 — Task 1 Step 2에서 확인, 없으면 법인 타일 제외.
2. 청약홈 응답 필드명 — 미승인이라 미확인. `normalize`가 3형태를 방어적으로 훑고, 승인 후 정리.
