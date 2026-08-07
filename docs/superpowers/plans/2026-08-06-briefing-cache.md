# 브리핑 페이로드 캐시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/api/briefing`의 매 요청 재집계(0.48MB·거래 3,003건)를 없애고, 입력 지문이 같으면 DB에 저장된 응답 페이로드를 그대로 돌려준다.

**Architecture:** 집계 로직을 `app/lib/briefing.js`로 추출하고, 그 위에 **지문(fingerprint) 판정 캐시**를 얹는다. 지문 = `favorites` + 대상 캐시 행의 `max(fetched_at)` + KST 달력 날짜. 지문이 입력 전체를 덮으므로 별도 무효화 로직이 없고 ★ 변경 즉시 반영이 자동으로 따라온다. 캐시 계층은 전 구간 graceful — 테이블이 없든 조회가 깨지든 라이브 계산으로 폴백해 현재 동작과 같아진다. cron이 06:00 KST에 미리 데운다.

**Tech Stack:** Next.js 16 App Router (Node 런타임) · Supabase(postgrest) · `node:crypto` sha1 · `node:test`(의존성 0)

**설계 문서:** `docs/superpowers/specs/2026-08-05-briefing-cache-design.md` (승인됨)

## Global Constraints

- **비밀키·env 값은 절대 커밋 금지.** 새 환경변수를 도입하지 않는다(이 작업엔 불필요).
- **주석은 한글로 "왜"를 남긴다.** 되돌리면 안 되는 것엔 `⚠️` + 실측 날짜.
- **테스트는 순수 함수만** — `node:test`, 의존성 0. supabase에 의존하는 파일(`lib/briefing.js`)은 raw node로 import 불가라 테스트 대상이 아니다.
- **검증은 `npx next build` + `npm test`** 둘뿐(이 프로젝트에 린트 없음). 테스트 실행은 반드시 글로브를 따옴표로: `node --test "tests/*.test.mjs"` — 디렉터리 형태는 `MODULE_NOT_FOUND`로 실패한다.
- **`package.json`에 `"type":"module"` 추가 금지**(Next 빌드가 깨진다). `MODULE_TYPELESS_PACKAGE_JSON` 경고는 무해.
- **날짜 비교는 전부 KST 보정을 거친다.** Vercel은 UTC로 돈다 — `toISOString()`을 그대로 쓰면 KST 00:00~08:59에 어제가 나온다(`marketSignal.ymd()`·briefing `cutoff`·`/api/subscription`에 이미 같은 보정이 있다).
- **캐시 계층의 모든 실패는 라이브 계산으로 폴백**한다. 실패가 "옛 payload를 내보내는" 쪽으로 기울면 안 된다.
- **한글 커밋 메시지는 임시파일 + `git commit -F`** (PowerShell here-string은 괄호·특수문자에서 깨진다). 임시파일은 **Write 도구로** `.git\COMMIT_MSG_TMP.txt`에 쓸 것 — PS5.1 `Set-Content -Encoding utf8`은 BOM을 붙여 제목 첫머리에 U+FEFF가 박힌다.
- 한글 인자가 필요한 API 호출은 bash `curl` 금지(명령줄 UTF-8 깨짐) → `.mjs` 스크립트의 `fetch`로.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `app/lib/briefingCache.js` | **순수** — KST 달력 날짜(`kstDate`), 지문 생성(`buildFingerprint`) | 생성 (Task 1) |
| `tests/briefingCache.test.mjs` | 위 두 함수의 회귀 가드 | 생성 (Task 1) |
| `supabase/migrations/0008_briefing_cache.sql` | 단일 행 페이로드 캐시 테이블 | 생성 (Task 2) |
| `app/lib/format.js` | `daysBetweenYmd` 추가(타임존 무관 D-day) | 수정 (Task 3) |
| `tests/format.test.mjs` | `daysBetweenYmd` 테스트 추가 | 수정 (Task 3) |
| `app/lib/briefing.js` | **서버 전용** — 집계(`buildBriefingPayload`) + 캐시 판정(`getBriefing`) | 생성 (Task 3·4) |
| `app/api/briefing/route.js` | 얇은 라우트 — `getBriefing` 호출 + 응답 | 수정 (Task 3·4) |
| `app/api/cron/refresh/route.js` | 재수집 직후 브리핑 워밍 | 수정 (Task 5) |

⚠️ `app/lib/briefing.js`는 supabase에 의존하므로 **서버 전용**이다(CLAUDE.md 코드 위치 규약). 클라이언트에서 import하지 말 것.

---

### Task 1: 지문 모듈 (`app/lib/briefingCache.js`)

**Files:**
- Create: `app/lib/briefingCache.js`
- Test: `tests/briefingCache.test.mjs`

**Interfaces:**
- Consumes: 없음(순수 함수, 프로젝트 파일 import 0)
- Produces:
  - `kstDate(nowMs = Date.now()) -> string` — `"YYYY-MM-DD"` (KST 달력 날짜)
  - `buildFingerprint({ favs, latestFetched, kstDate }) -> string` — 16자 hex.
    `favs`는 `favorites` 행 배열(`{lawd_cd, umd_nm, apt_nm, lease_end, note, note_date, ...}`),
    `latestFetched`는 ISO 문자열 또는 `null`, `kstDate`는 `"YYYY-MM-DD"` 문자열.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/briefingCache.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFingerprint, kstDate } from "../app/lib/briefingCache.js";

const FAVS = [
  { id: 1, lawd_cd: "41173", umd_nm: "호계동", apt_nm: "평촌어바인퍼스트",
    lat: 37.39, lng: 126.96, lease_end: null, note: null, note_date: null },
  { id: 2, lawd_cd: "11710", umd_nm: "거여동", apt_nm: "거여1단지",
    lat: 37.49, lng: 127.14, lease_end: "2026-11-30", note: "메모", note_date: null },
];
const BASE = { favs: FAVS, latestFetched: "2026-08-06T21:00:00.000Z", kstDate: "2026-08-06" };
const fp = (over = {}) => buildFingerprint({ ...BASE, ...over });

test("지문은 hex 문자열", () => {
  assert.match(fp(), /^[0-9a-f]{16}$/);
});

// 즐겨찾기 조회 순서(created_at desc)는 행 추가로 뒤바뀐다 — 순서만 달라진 것을
// 변경으로 오인하면 매번 재계산이라 캐시가 죽는다.
test("favorites 순서가 달라도 같은 지문", () => {
  assert.equal(fp({ favs: [...FAVS].reverse() }), fp());
});

test("★ 추가하면 지문이 바뀐다", () => {
  const added = [...FAVS, { lawd_cd: "11680", umd_nm: "대치동", apt_nm: "은마" }];
  assert.notEqual(fp({ favs: added }), fp());
});

test("★ 삭제하면 지문이 바뀐다", () => {
  assert.notEqual(fp({ favs: [FAVS[0]] }), fp());
});

test("메모·임대차 만기 수정하면 지문이 바뀐다", () => {
  const edited = [FAVS[0], { ...FAVS[1], note: "다른 메모" }];
  assert.notEqual(fp({ favs: edited }), fp());
  const lease = [FAVS[0], { ...FAVS[1], lease_end: "2027-01-31" }];
  assert.notEqual(fp({ favs: lease }), fp());
});

// 지도의 /api/trades가 캐시를 채워도 fetched_at이 올라간다 — cron만이 아니다.
test("max(fetched_at)이 바뀌면 지문이 바뀐다", () => {
  assert.notEqual(fp({ latestFetched: "2026-08-07T21:00:00.000Z" }), fp());
});

test("캐시가 비어 latestFetched가 null이어도 터지지 않는다", () => {
  assert.match(fp({ latestFetched: null }), /^[0-9a-f]{16}$/);
});

// ⚠️ KST 경계 회귀 가드. UTC로 계산하면 KST 00:00~08:59에 어제 날짜가 나와
//    자정을 넘겨도 옛 30일 창·D-day를 재사용하게 된다(이 프로젝트 4번째 재발 지점).
test("UTC 15:00 = KST 익일 00:00에서 날짜가 넘어간다", () => {
  assert.equal(kstDate(Date.parse("2026-08-05T14:59:59Z")), "2026-08-05");
  assert.equal(kstDate(Date.parse("2026-08-05T15:00:00Z")), "2026-08-06");
});

test("날짜가 바뀌면 지문이 바뀐다", () => {
  assert.notEqual(fp({ kstDate: "2026-08-07" }), fp());
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `npm test`
Expected: FAIL — `Cannot find module ... app/lib/briefingCache.js`

- [ ] **Step 3: 최소 구현을 쓴다**

`app/lib/briefingCache.js`:

```js
// 브리핑 페이로드 캐시의 지문(fingerprint) — 순수 함수만 둔다(테스트 대상).
// 지문이 입력 전체를 덮으므로 별도의 캐시 무효화 로직이 필요 없다: ★ 변경이 곧
// 지문 변경이라 즉시 반영이 자동으로 따라온다.

import { createHash } from "node:crypto";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// ⚠️ KST 달력 날짜. Vercel은 UTC로 돌아 toISOString()을 그대로 쓰면 KST 00:00~08:59에
//    어제가 나온다 → 자정을 넘겨도 옛 30일 창·D-day를 재사용하게 된다.
//    marketSignal.ymd()·briefing cutoff·/api/subscription과 같은 계열의 보정.
export function kstDate(nowMs = Date.now()) {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// ⚠️ 지문에 넣는 favorites 필드는 **페이로드가 실제로 읽는 것과 같아야 한다**
//    (buildBriefingPayload가 쓰는 6개). lat/lng/created_at은 브리핑 출력에 안 쓰이므로
//    넣지 않는다 — 넣으면 무관한 변경으로 캐시가 헛되이 무효화된다.
//    반대로 payload가 새 필드를 읽기 시작하면 여기에도 반드시 추가할 것.
const SEP = "\u001f"; // 필드 구분자(unit separator)

const FAV_FIELDS = ["lawd_cd", "umd_nm", "apt_nm", "lease_end", "note", "note_date"];

// U+001F(unit separator) — 단지명·메모에 나올 리 없는 문자라 필드 경계가 안전하다.
function normalizeFav(f) {
  return FAV_FIELDS.map((k) => (f[k] == null ? "" : String(f[k]))).join(SEP);
}

export function buildFingerprint({ favs = [], latestFetched = null, kstDate: day = "" }) {
  // 조회 순서(created_at desc)는 행 추가로 뒤바뀌므로 정렬해 정규화한다.
  const rows = favs.map(normalizeFav).sort();
  const material = JSON.stringify([day, latestFetched || "", rows]);
  // sha1 16자면 충돌 확률이 무의미하게 낮고(개인용 단일 행) 로그로 보기 좋다.
  return createHash("sha1").update(material).digest("hex").slice(0, 16);
}
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `npm test`
Expected: PASS — 기존 50개 + 신규 9개 = **59 pass / 0 fail**

- [ ] **Step 5: 커밋**

```bash
git add app/lib/briefingCache.js tests/briefingCache.test.mjs
git commit -F .git/COMMIT_MSG_TMP.txt
```
(메시지: `feat(briefing): 페이로드 캐시 지문 함수 + 테스트`)

---

### Task 2: 마이그레이션 0008 (`briefing_cache` 테이블)

**Files:**
- Create: `supabase/migrations/0008_briefing_cache.sql`

**Interfaces:**
- Consumes: 없음
- Produces: `public.briefing_cache` 테이블 — 컬럼 `id smallint PK(=1)`, `fingerprint text`, `payload jsonb`, `computed_at timestamptz`. Task 4의 `readCache`/`writeCache`가 이 이름들을 그대로 쓴다.

- [ ] **Step 1: 마이그레이션 파일을 쓴다**

`supabase/migrations/0008_briefing_cache.sql`:

```sql
-- 📋 브리핑 응답 페이로드 캐시 — /api/briefing 이 읽고 쓰고, /api/cron/refresh 가 데운다.
-- 재계산 여부는 fingerprint(= favorites + max(fetched_at) + KST 날짜)로만 판정한다.
-- 지문이 입력 전체를 덮으므로 별도 무효화 로직이 없다(★ 변경 = 지문 변경 = 즉시 반영).
--
-- favorites 가 전역 하나뿐인 개인용 앱이라 **단일 행**으로 충분하다(지문 불일치 시 덮어씀).
-- 그래서 프루닝도 불필요 — news_items/subscription_items 와 달리 행이 늘지 않는다.
-- RLS on + 정책 없음 → 서버(secret 키)만 접근. 기존 캐시 테이블과 같은 패턴.
create table if not exists public.briefing_cache (
  id          smallint    primary key default 1,
  fingerprint text        not null,
  payload     jsonb       not null,
  computed_at timestamptz not null default now(),
  constraint briefing_cache_single_row check (id = 1)
);
alter table public.briefing_cache enable row level security;
```

- [ ] **Step 2: supabase MCP로 적용한다**

`mcp__supabase__apply_migration` — `name: "0008_briefing_cache"`, `query`: 위 SQL 전문.
(⚠️ 실패하면 대시보드 **SQL Editor** 폴백. 2026-07-08 이후 MCP `apply_migration`은 동작 확인됨.)

- [ ] **Step 3: 테이블이 생겼는지 확인한다**

`mcp__supabase__execute_sql` — `query`:
```sql
select column_name, data_type from information_schema.columns
where table_name = 'briefing_cache' order by ordinal_position;
```
Expected: 4행 — `id smallint` / `fingerprint text` / `payload jsonb` / `computed_at timestamp with time zone`

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/0008_briefing_cache.sql
git commit -F .git/COMMIT_MSG_TMP.txt
```
(메시지: `feat(db): 0008 briefing_cache 단일 행 페이로드 캐시`)

---

### Task 3: 집계 로직 추출 + 서버 D-day KST 교정

**Files:**
- Create: `app/lib/briefing.js`
- Modify: `app/lib/format.js` (함수 1개 추가)
- Modify: `app/api/briefing/route.js` (전체 교체 — 얇은 라우트로)
- Test: `tests/format.test.mjs` (케이스 추가)
- 임시: `scripts/tmp-briefing-parity.mjs` (Task 끝에서 삭제)

**Interfaces:**
- Consumes: `fetchRawMonths`, `currentYmd`, `monthsBack` (`app/lib/trades.js`) · `buildSignal` (`app/lib/marketSignal.js`) · `kstDate` (Task 1)
- Produces:
  - `daysBetweenYmd(fromYmd, toYmd) -> number|null` (`app/lib/format.js`) — 달력 일수 차(타임존 무관). 형식이 잘못되면 `null`.
  - `buildBriefingPayload(favs) -> Promise<{complexes, upcoming, signal, feed}>` (`app/lib/briefing.js`)
    — supabase 클라이언트를 받지 않는다. 집계가 쓰는 `fetchRawMonths`가 자체 클라이언트를 들고 있어서 넘길 게 없다.

**이 Task의 성격:** 순수 이동(동작 불변) **+ 교정 1건**. 교정은 서버 D-day의 타임존이다 —
현재 `ddayFrom`은 `new Date().setHours(0,0,0,0)`(=Vercel에선 UTC 자정)을 기준으로 삼아
KST 00:00~09:00 구간에 D-day가 하루 크게 나온다. 지금은 그 시간대 방문이 드물어 눈에 안 띄지만,
**cron이 06:00 KST에 계산한 페이로드를 하루 종일 재사용하는 순간 그 오차가 온종일 고정된다** →
캐시를 얹기 전에 반드시 고쳐야 한다.

- [ ] **Step 1: `daysBetweenYmd`의 실패하는 테스트를 쓴다**

`tests/format.test.mjs` 맨 아래에 추가(맨 위 import에 `daysBetweenYmd`를 합류시킬 것):

```js
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
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `npm test`
Expected: FAIL — `daysBetweenYmd is not a function` (또는 import 오류)

- [ ] **Step 3: `daysBetweenYmd`를 구현한다**

`app/lib/format.js`의 `daysUntil` 바로 아래에 추가:

```js
// 두 "YYYY-MM-DD" 사이의 달력 일수. ⚠️ 서버는 UTC로 돌기 때문에 new Date(ymd)로 파싱하면
// 기준일이 런타임 타임존에 끌려간다 — 문자열을 직접 쪼개 UTC로 고정해 타임존을 배제한다.
// (브라우저 전용인 daysUntil과 달리, 이건 서버가 KST 날짜를 받아 세는 용도다.)
export function daysBetweenYmd(fromYmd, toYmd) {
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const a = parse(fromYmd);
  const b = parse(toYmd);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86400000);
}
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `npm test`
Expected: PASS — 62 pass / 0 fail

- [ ] **Step 5: 추출 **전** 응답을 기록해둔다 (parity 기준선)**

먼저 dev 서버를 띄운다(백그라운드): `npm run dev` → 로그에 "Ready" 뜰 때까지 대기.

`scripts/tmp-briefing-parity.mjs` 를 **Write 도구로** 생성:

```js
// 임시 검증 — /api/briefing 응답을 비교 가능한 형태로 파일에 떨군다.
// 사용: node scripts/tmp-briefing-parity.mjs <출력경로>
import { writeFileSync } from "node:fs";

const out = process.argv[2];
const t0 = Date.now();
const res = await fetch("http://localhost:3000/api/briefing");
const j = await res.json();
const ms = Date.now() - t0;
if (j.signal) delete j.signal.asOf; // 매 호출 달라지는 값 — 비교에서 뺀다
delete j.cached;                    // Task 4에서 추가되는 관측 필드
delete j.computedAt;
writeFileSync(out, JSON.stringify(j, null, 2));
console.log(out, "· complexes", j.complexes?.length, "· feed", j.feed?.length,
  "· signal", j.signal?.byRegion?.length, "·", ms + "ms");
```

Run: `node scripts/tmp-briefing-parity.mjs .git/briefing-base.json`
Expected: 개수들이 찍히고 파일 생성. 이 숫자와 시간(1.2~1.7s 예상)을 기록해둘 것.

- [ ] **Step 6: `app/lib/briefing.js`로 집계 로직을 옮긴다**

`app/api/briefing/route.js`의 상수·헬퍼·GET 본문을 **그대로** 옮기되, ①`ddayFrom`을 KST 기준으로 교정하고 ②favorites 조회는 라우트에 남긴다.

`app/lib/briefing.js` (신규):

```js
// 📋 오늘의 브리핑 집계 — 라우트(/api/briefing)와 cron 워밍이 공유한다.
//
// ⚠️ 외부 API를 호출하지 않는다. /api/cron/refresh 가 매일 06:00에 즐겨찾기 지역
//    최근 2개월을 재수집해 trade_raw_cache에 넣어두므로 캐시만 읽으면 된다
//    (fetchRawMonths의 cacheOnly). 캐시에 없는 지역은 조용히 건너뛴다.
// ⚠️ supabase 의존 = 서버 전용. 클라이언트에서 import하지 말 것(raw node 단독 import도 불가).

import { fetchRawMonths, currentYmd, monthsBack } from "./trades";
import { buildSignal } from "./marketSignal";
import { kstDate } from "./briefingCache";
import { daysBetweenYmd } from "./format";

const RECENT_DAYS = 30; // 브리핑에 보여줄 최근 거래 기간
const UPCOMING_DAYS = 30; // D-day 알림 범위
// ⚠️ 2개월도 3개월도 아니라 4개월. buildSignal의 창이 신고 기한(30일)만큼 밀려 있어
//    prev 창이 [asOf−90일, asOf−60일)까지 내려가고, 90일은 최악의 경우(예: 3/1 기준
//    90일 전=작년 12/1) 달력월 4개를 걸친다. 창보다 짧게 잡으면 prev가 데이터
//    부족(starved)해져 delta가 항상 "급증"으로 보인다 — 2026-08-03에 2→3으로 늘린
//    것도 같은 버그였다(41173 vol=134/42, 11530 180/40 처럼 prevCount만 저평가).
//    추가된 달은 cacheOnly라 캐시 조회 한 번 더일 뿐이고(이미 /api/trades·/api/trend로
//    영구 캐시된 달이면 공짜), 한 번도 안 데운 지역이면 그 달만 조용히 빠진다.
//    ⚠️ marketSignal.js의 REPORT_LAG_DAYS를 바꾸면 이 값도 함께 봐야 한다.
export const MONTHS = 4;
const FEED_MAX = 60; // 새 거래 피드 최대 행수 — 클라에서 자금 필터로 더 줄인다

// dealYmd는 KST 달력 날짜인데 toISOString()은 UTC 날짜를 준다 → Vercel은 UTC로 돌고
// cron은 06:00·06:30 KST라 매일 KST 00:00~08:59(=UTC 전날 15:00~23:59) 구간에 걸린다.
// marketSignal.js의 ymd()와 같은 이유로 같은 보정을 쓴다 — 안 그러면 이 cutoff(기존
// complexes/feed 창)와 buildSignal의 30일 창이 하루 어긋나, 같은 화면의 "시장 신호"
// 카드와 "새 거래 피드" 카드가 자정 근처에 서로 다른 개수를 보여주게 된다(2026-08-03).
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export async function buildBriefingPayload(favs) {
  // 즐겨찾기가 걸린 지역만 캐시에서 읽는다.
  const ymds = monthsBack(currentYmd(), MONTHS);
  const codes = [...new Set(favs.map((f) => f.lawd_cd))];
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

  const cutoff = new Date(Date.now() - RECENT_DAYS * 86400000 + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);

  const complexes = [];
  for (const f of favs) {
    const all = (byCode.get(f.lawd_cd) || []).filter(
      (t) => t.aptNm === f.apt_nm && t.umdNm === f.umd_nm
    );
    if (!all.length) continue;
    all.sort((a, b) => (a.dealYmd < b.dealYmd ? 1 : -1)); // 최신순

    const recent = all
      .filter((t) => t.dealYmd >= cutoff)
      .map((t) => ({ area: t.area, amount: t.dealAmount, dealDate: t.dealYmd }));
    if (!recent.length) continue;

    // 변동률 기준: 같은 평형의 직전 거래. 평형이 다르면 비교가 무의미하다.
    const top = recent[0];
    const prev = all.find(
      (t) => t.dealYmd < top.dealDate && Math.round(t.area) === Math.round(top.area)
    );

    complexes.push({
      lawdCd: f.lawd_cd,
      umdNm: f.umd_nm,
      aptNm: f.apt_nm,
      buildYear: all[0].buildYear || null,
      recent: recent.slice(0, 5),
      prevAmount: prev ? prev.dealAmount : null,
    });
  }
  // 최근 거래가 있는 단지를 최신순으로.
  complexes.sort((a, b) => (a.recent[0].dealDate < b.recent[0].dealDate ? 1 : -1));

  // 다가오는 일정. 0004 마이그레이션 미적용 환경에는 컬럼이 없으므로
  // 값이 없으면 그냥 빠진다(/api/favorites GET 폴백과 같은 방침).
  // ⚠️ 기준일은 **KST 달력 날짜**다. 예전엔 new Date().setHours(0,0,0,0)(=Vercel에선 UTC
  //    자정)을 썼는데, 그러면 KST 00:00~09:00에 D-day가 하루 크게 나온다. 페이로드를
  //    캐시하면(cron이 06:00 KST에 계산) 그 오차가 온종일 고정되므로 반드시 KST여야 한다.
  const todayKst = kstDate();
  const upcoming = [];
  for (const f of favs) {
    for (const [kind, ymd, label] of [
      ["lease", f.lease_end, "임대차 만기"],
      ["note", f.note_date, f.note || "메모"],
    ]) {
      if (!ymd) continue;
      const dday = daysBetweenYmd(todayKst, ymd);
      if (dday == null || dday < 0 || dday > UPCOMING_DAYS) continue;
      upcoming.push({ aptNm: f.apt_nm, kind, label, dday });
    }
  }
  upcoming.sort((a, b) => a.dday - b.dday);

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

  // ⚠️ ★ 단지 거래는 상한에서 보호한다 — 그냥 최신순 60건으로 자르면 ★ 탭이 통째로
  //    빈다. ★ 단지의 새 거래는 지역 전체보다 훨씬 드물어(2026-08-04 실측: 최신 60건이
  //    전부 7/30~8/01, ★ 4곳의 거래는 7/07~7/18이라 컷 밖) 기본 탭이 늘 "거래 없음"으로
  //    보였다. ★ 것을 먼저 담고 남은 자리를 최신순으로 채운 뒤 다시 날짜순 정렬한다.
  const favKeys = new Set(favs.map((f) => `${f.lawd_cd}|${f.umd_nm}|${f.apt_nm}`));
  const isFav = (t) => favKeys.has(`${t.lawdCd}|${t.umdNm}|${t.aptNm}`);
  const favRows = feed.filter(isFav).slice(0, FEED_MAX);
  const rest = feed.filter((t) => !isFav(t)).slice(0, Math.max(0, FEED_MAX - favRows.length));
  const merged = [...favRows, ...rest].sort((a, b) => (a.dealDate < b.dealDate ? 1 : -1));

  return { complexes, upcoming, signal, feed: merged };
}
```

⚠️ `buildBriefingPayload`는 supabase 클라이언트를 **받지 않는다** — 집계가 쓰는 `fetchRawMonths`가 자체 클라이언트를 들고 있어 넘길 게 없다. Task 4의 `getBriefing`도 `buildBriefingPayload(favs)`로 부른다(시그니처가 중간에 바뀌지 않는다).

- [ ] **Step 7: 라우트를 얇게 바꾼다**

`app/api/briefing/route.js` **전체 교체**:

```js
// 📋 오늘의 브리핑 — 즐겨찾기 단지의 최근 실거래 + 다가오는 일정 + 시장 신호 + 새 거래 피드.
// 집계는 lib/briefing.js가 한다(cron 워밍과 공유).

import { supabaseAdmin, noDbResponse } from "../../lib/supabaseServer";
import { buildBriefingPayload } from "../../lib/briefing";

export async function GET() {
  if (!supabaseAdmin) return noDbResponse();

  const { data: favs, error } = await supabaseAdmin.from("favorites").select("*");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // ⚠️ ★가 하나도 없을 때의 응답 형태는 그대로 유지한다 — Briefing.js의 빈 상태 판정이
  //    이 모양(키 2개)에 맞춰져 있다.
  if (!favs?.length) return Response.json({ complexes: [], upcoming: [] });

  const payload = await buildBriefingPayload(favs);
  return Response.json(payload);
}
```

- [ ] **Step 8: parity — 추출 전후 응답이 완전히 같은지 확인한다**

Run:
```bash
node scripts/tmp-briefing-parity.mjs .git/briefing-after.json
git diff --no-index .git/briefing-base.json .git/briefing-after.json
```
Expected: **diff 출력 없음(exit 0)**.
⚠️ `upcoming`의 `dday`만 달라졌다면 그건 KST 교정 때문이다 — 실행 시각이 KST 09:00~24:00 사이면 값이 같아야 하고, 00:00~09:00 사이면 **1 작아진 값이 맞다**(교정된 값). 그 경우 다른 키가 전부 동일한지만 확인하고 넘어갈 것.

- [ ] **Step 9: 빌드·테스트·정리**

Run: `npx next build` → Expected: 통과(prerender 포함)
Run: `npm test` → Expected: 62 pass / 0 fail
그다음 임시 파일 삭제: `rm scripts/tmp-briefing-parity.mjs .git/briefing-base.json .git/briefing-after.json`
(⚠️ `scripts/tmp-*.mjs`는 커밋 금지 — 프로젝트 규약)

- [ ] **Step 10: 커밋**

```bash
git add app/lib/briefing.js app/lib/format.js app/api/briefing/route.js tests/format.test.mjs
git commit -F .git/COMMIT_MSG_TMP.txt
```
(메시지: `refactor(briefing): 집계를 lib/briefing.js로 추출 + 서버 D-day KST 교정`)

---

### Task 4: 지문 캐시 판정 (`getBriefing`) + 라우트 연결

**Files:**
- Modify: `app/lib/briefing.js` (`getBriefing` 및 3개 헬퍼 추가)
- Modify: `app/api/briefing/route.js` (`getBriefing` 호출로 교체)

**Interfaces:**
- Consumes: `buildBriefingPayload(favs)` (Task 3) · `buildFingerprint`, `kstDate` (Task 1) · `briefing_cache` 테이블 (Task 2)
- Produces: `getBriefing(supabase) -> Promise<{ payload?, cached?, computedAt?, error? }>`
  — `error`가 있으면 favorites 조회 실패(라우트가 500). Task 5의 cron 워밍도 이 함수를 쓴다.

**왜 cron과 라우트가 같은 함수를 쓰는가:** 지문을 계산하는 코드 경로가 **하나뿐**이어야
cron이 저장한 지문과 라우트가 계산하는 지문이 구조적으로 일치한다. 두 곳에서 각자 조립하면
재료 하나만 어긋나도 캐시가 영원히 미스가 되고, 그건 조용히 느려질 뿐이라 눈치채기 어렵다.

- [ ] **Step 1: `getBriefing`과 헬퍼를 추가한다**

`app/lib/briefing.js` — import 줄에 지문 함수를 합류시키고(`import { kstDate, buildFingerprint } from "./briefingCache";`), 파일 **맨 아래**에 추가:

```js
// ── 페이로드 캐시 ──────────────────────────────────────────────────────────
// ⚠️ 이 계층의 실패는 **전부 라이브 계산으로 폴백**한다(테이블 부재·조회 실패·지문 실패).
//    캐싱이 통째로 죽어도 동작은 캐시 도입 전과 같아진다. 반대 방향(실패 시 옛 payload를
//    내보내는 것)으로 기울면 안 된다 — 그건 조용히 틀린 화면이 된다.

// 대상 캐시 행의 최신 fetched_at 1건만. postgrest 집계 대신 order+limit(1)로 받는다
// (전송량 1행). 실패하면 null → 지문 불일치 → 재계산 쪽으로 기운다(안전한 방향).
async function latestFetchedAt(supabase, codes, ymds) {
  try {
    const { data, error } = await supabase
      .from("trade_raw_cache")
      .select("fetched_at")
      .in("lawd_cd", codes)
      .in("deal_ymd", ymds)
      .order("fetched_at", { ascending: false })
      .limit(1);
    if (error) return null;
    return data?.[0]?.fetched_at || null;
  } catch {
    return null;
  }
}

async function readCache(supabase) {
  try {
    const { data, error } = await supabase
      .from("briefing_cache")
      .select("fingerprint, payload, computed_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) return null; // 0008 미적용(테이블 부재) 포함 — 조용히 라이브 계산
    return data || null;
  } catch {
    return null;
  }
}

async function writeCache(supabase, fingerprint, payload, computedAt) {
  try {
    const { error } = await supabase
      .from("briefing_cache")
      .upsert({ id: 1, fingerprint, payload, computed_at: computedAt }, { onConflict: "id" });
    if (error) console.error("[briefing_cache] upsert:", error.message);
  } catch (e) {
    console.error("[briefing_cache] upsert:", e.message);
  }
}

// 브리핑 응답을 돌려준다 — 지문이 같으면 저장된 payload, 아니면 계산 후 저장.
// 라우트와 cron 워밍이 **둘 다 이 함수만** 호출한다(지문 계산 경로를 하나로 유지).
export async function getBriefing(supabase) {
  const { data: favs, error } = await supabase.from("favorites").select("*");
  if (error) return { error: error.message };
  // ⚠️ ★가 없을 때의 응답 형태는 그대로(Briefing.js 빈 상태 판정). 캐시하지 않는다.
  if (!favs?.length) return { payload: { complexes: [], upcoming: [] }, cached: false, computedAt: null };

  const ymds = monthsBack(currentYmd(), MONTHS);
  const codes = [...new Set(favs.map((f) => f.lawd_cd))];

  // 지문 재료 2종은 서로 무관하니 동시에 — 둘 다 실패해도 계산으로 이어간다.
  const [latestFetched, cacheRow] = await Promise.all([
    latestFetchedAt(supabase, codes, ymds),
    readCache(supabase),
  ]);

  let fingerprint = null;
  try {
    fingerprint = buildFingerprint({ favs, latestFetched, kstDate: kstDate() });
  } catch (e) {
    console.error("[briefing_cache] fingerprint:", e.message);
  }

  if (fingerprint && cacheRow?.fingerprint === fingerprint) {
    return { payload: cacheRow.payload, cached: true, computedAt: cacheRow.computed_at };
  }

  const payload = await buildBriefingPayload(favs);
  const computedAt = new Date().toISOString();
  if (fingerprint) await writeCache(supabase, fingerprint, payload, computedAt);
  return { payload, cached: false, computedAt };
}
```

- [ ] **Step 2: 라우트를 `getBriefing`으로 바꾼다**

`app/api/briefing/route.js` **전체 교체**:

```js
// 📋 오늘의 브리핑 — 즐겨찾기 단지의 최근 실거래 + 다가오는 일정 + 시장 신호 + 새 거래 피드.
// 집계·캐시 판정은 lib/briefing.js가 한다(cron 워밍과 공유).
// 응답의 cached/computedAt은 관측용 — curl 한 번으로 히트 여부를 알 수 있다.

import { supabaseAdmin, noDbResponse } from "../../lib/supabaseServer";
import { getBriefing } from "../../lib/briefing";

export async function GET() {
  if (!supabaseAdmin) return noDbResponse();
  const { payload, cached, computedAt, error } = await getBriefing(supabaseAdmin);
  if (error) return Response.json({ error }, { status: 500 });
  return Response.json({ ...payload, cached, computedAt });
}
```

- [ ] **Step 3: 빌드 + 테스트**

Run: `npx next build` → Expected: 통과
Run: `npm test` → Expected: 62 pass / 0 fail

- [ ] **Step 4: 로컬 실측 — 미스 → 히트**

dev 서버가 떠 있는 상태에서 `scripts/tmp-briefing-check.mjs` 를 **Write 도구로** 생성:

```js
// 임시 검증 — /api/briefing 을 두 번 부르고 cached/시간을 찍는다.
// ★ 변경 즉시 반영도 확인: favorites 1건의 note를 PATCH → 다시 호출 → 원복.
const call = async (label) => {
  const t0 = Date.now();
  const j = await (await fetch("http://localhost:3000/api/briefing")).json();
  console.log(label, "cached=" + j.cached, (Date.now() - t0) + "ms",
    "complexes=" + (j.complexes?.length ?? "-"), "feed=" + (j.feed?.length ?? "-"),
    "signal=" + (j.signal?.byRegion?.length ?? "-"), "computedAt=" + j.computedAt);
  return j;
};

const a = await call("1회차");
const b = await call("2회차");

const favs = (await (await fetch("http://localhost:3000/api/favorites")).json()).favorites;
const target = favs[0];
console.log("PATCH 대상:", target.apt_nm, "(id=" + target.id + ") 기존 note:", target.note);

const patch = (note) =>
  fetch("http://localhost:3000/api/favorites", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: target.id, leaseEnd: target.lease_end, note, noteDate: target.note_date }),
  }).then((r) => r.json());

console.log("patch →", await patch("캐시검증"));
await call("★ 변경 직후");
console.log("원복 →", await patch(target.note)); // null이면 null 그대로 들어간다
await call("원복 직후");

// payload 동일성: 1회차(계산)와 2회차(캐시)가 asOf까지 완전히 같아야 한다.
const strip = (j) => { const c = { ...j }; delete c.cached; delete c.computedAt; return JSON.stringify(c); };
console.log("payload 일치:", strip(a) === strip(b));
```

Run: `node scripts/tmp-briefing-check.mjs`

Expected:
- 1회차 `cached=false` (1.2~1.7s), 2회차 `cached=true` (**0.2s 이하**), `payload 일치: true`
- `★ 변경 직후` `cached=false` (지문이 바뀌어 재계산 = 즉시 반영 확인)
- `원복 직후` `cached=false` (원복도 변경이므로 재계산이 맞다)

⚠️ 만약 2회차가 `cached=false`면 지문이 매번 달라지는 것이다 — `latestFetchedAt`이 `null`을 돌려주는지(테이블/컬럼명), `favs`에 매 호출 달라지는 값이 섞였는지 순서로 확인할 것.

- [ ] **Step 5: 캐시 계층 부재 폴백을 확인한다**

`mcp__supabase__execute_sql`로 테이블을 잠시 감춘다:
```sql
alter table public.briefing_cache rename to briefing_cache_tmp;
```
Run: `node scripts/tmp-briefing-check.mjs` → Expected: **에러 없이** 매번 `cached=false`로 정상 응답(내용 동일).
되돌리기:
```sql
alter table public.briefing_cache_tmp rename to briefing_cache;
```
Run: `node scripts/tmp-briefing-check.mjs` → Expected: 2회차 `cached=true` 복귀.
그다음 임시 스크립트 삭제: `rm scripts/tmp-briefing-check.mjs`

- [ ] **Step 6: 커밋**

```bash
git add app/lib/briefing.js app/api/briefing/route.js
git commit -F .git/COMMIT_MSG_TMP.txt
```
(메시지: `perf(briefing): 지문 기반 페이로드 캐시 — 재집계 제거`)

---

### Task 5: cron 워밍 (`/api/cron/refresh`)

**Files:**
- Modify: `app/api/cron/refresh/route.js:46-62` (실거래 재수집 루프와 추세 워밍 **사이**에 삽입) + 응답 JSON

**Interfaces:**
- Consumes: `getBriefing(supabase)` (Task 4)
- Produces: cron 응답에 `briefingWarm: { cached, computedAt } | { error }`

- [ ] **Step 1: import를 추가한다**

`app/api/cron/refresh/route.js` 상단 import 블록에:

```js
import { getBriefing } from "../../../lib/briefing";
```

- [ ] **Step 2: 재수집 루프 직후, 추세 워밍 직전에 워밍을 넣는다**

`const total = months.reduce(...)` 루프가 끝나는 `}` 다음, `// 추세 3년 캐시 워밍:` 주석 **앞**에 삽입:

```js
  // 📋 브리핑 워밍 — 위 재수집으로 fetched_at이 올라가 지문이 막 무효화된 참이다.
  // 지금 한 번 계산해 두면 그날 첫 방문이 캐시 히트로 시작한다.
  // ⚠️ **추세 워밍보다 앞에 둘 것.** 추세 워밍은 WARM_DEADLINE_MS(40s)로 미완주분을
  //    다음 실행에 넘기는 '양보 가능한' 작업이라, 브리핑을 뒤에 두면 데드라인에 밀려
  //    영영 안 돌 수 있다(그러면 매일 첫 방문이 1.5s 라이브 계산으로 떨어진다).
  // 실패는 삼킨다 — 캐시 워밍이 실거래 갱신 cron을 죽이면 안 된다(청약 수집과 같은 방침).
  let briefingWarm;
  try {
    const { cached, computedAt, error: briefErr } = await getBriefing(supabaseAdmin);
    briefingWarm = briefErr ? { error: briefErr } : { cached, computedAt };
  } catch (e) {
    briefingWarm = { error: e.message };
  }
```

- [ ] **Step 3: 응답에 실어 보낸다**

`Response.json({...})`의 `trendWarm,` 줄 **바로 위**에 `briefingWarm,` 추가:

```js
  return Response.json({
    ok: true,
    refreshedAt: new Date().toISOString(),
    regionCount: regions.length,
    monthsRefreshed: ymds,
    briefingWarm,
    trendWarm,
    durationMs: Date.now() - started,
    results,
  });
```

- [ ] **Step 4: 빌드 + 로컬 cron 호출**

Run: `npx next build` → Expected: 통과

dev 서버가 뜬 상태에서 (로컬은 `CRON_SECRET` 미설정이라 인증 없이 호출 가능):
```bash
curl -s "http://localhost:3000/api/cron/refresh" -o .git/cron.json
node -e "const j=require('./.git/cron.json');console.log('briefingWarm',JSON.stringify(j.briefingWarm),'| trendWarm',j.trendWarm.length,'| durationMs',j.durationMs)"
```
Expected: `briefingWarm {"cached":false,"computedAt":"..."}` — 재수집으로 `fetched_at`이 갱신됐으니 **`cached:false`(=새로 계산해 저장)가 정상**이다. `trendWarm`도 그대로 채워져 있어야 한다.

- [ ] **Step 5: 워밍이 실제로 효과가 있는지 확인한다**

Run: `curl -s -o /dev/null -w "%{time_total}\n" "http://localhost:3000/api/briefing"`
그다음 `curl -s "http://localhost:3000/api/briefing" -o .git/b.json` → `node -e "console.log(require('./.git/b.json').cached)"`
Expected: `true` — cron이 데워둔 것을 그대로 받는다(0.2s 이하).
정리: `rm .git/cron.json .git/b.json`

- [ ] **Step 6: 커밋**

```bash
git add app/api/cron/refresh/route.js
git commit -F .git/COMMIT_MSG_TMP.txt
```
(메시지: `feat(cron): 재수집 직후 브리핑 캐시 워밍 (추세 워밍 앞)`)

---

### Task 6: 배포 · prod 실측 · 문서

**Files:**
- Modify: `CLAUDE.md` (개발 메모 — 브리핑 캐시 규약)
- Modify: `PROGRESS.md` (새 섹션 + "다음 세션 시작점" 갱신)

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 없음(문서·검증)

- [ ] **Step 1: push 전에 미push 커밋을 확인한다**

Run: `git log origin/main..main --oneline`
Expected: 이 계획의 커밋 5개만. ⚠️ 예상 밖의 커밋이 있으면 **push 전에 사용자에게 알릴 것**
(2026-08-05에 17커밋이 누적돼 통째로 미배포였던 전례가 있다).

- [ ] **Step 2: push하고 배포를 확인한다**

Run: `git push origin main`
그다음 (서버 코드만 바뀐 배포라 **청크 해시가 안 변한다** — 커밋 상태로 확인할 것):
```bash
gh api repos/1226cjw-afk/Budongsan/commits/$(git rev-parse HEAD)/status --jq '.state, (.statuses[]|"\(.context) \(.state) \(.description)")'
```
Expected: `success` / `Vercel success Deployment has completed`

- [ ] **Step 3: prod 실측 — 히트/미스와 응답 시간**

```bash
for i in 1 2 3; do
  curl -s "https://budongsan-virid.vercel.app/api/briefing" -o .git/p$i.json \
    -w "$i회차 %{time_total}s\n";
done
node -e "for(const i of [1,2,3]){const j=require('./.git/p'+i+'.json');console.log(i,'cached='+j.cached,'complexes='+j.complexes.length,'feed='+(j.feed?j.feed.length:'-'),'signal='+(j.signal?j.signal.byRegion.length:'-'))}"
```
Expected: 1회차는 `cached=false`(지문이 처음 저장됨, 콜드스타트 포함 3s대 가능), **2·3회차 `cached=true` + 1s 미만**. 세 응답의 `complexes`/`feed`/`signal` 개수가 서로 같아야 한다.
정리: `rm .git/p1.json .git/p2.json .git/p3.json`

- [ ] **Step 4: prod에서 ★ 즉시 반영을 확인한다**

브라우저로 https://budongsan-virid.vercel.app 접속 → 아무 단지나 ★ 토글 → `/news` 이동 →
⭐관심단지 카드에 그 변경이 **즉시** 반영되는지 확인. 그다음 ★를 원래대로 되돌린다.
(원한다면 Task 4의 `tmp-briefing-check.mjs`의 URL만 prod로 바꿔 같은 확인을 CLI로 해도 된다.)
Expected: 지연 없음 — 지문에 favorites가 들어 있어 토글이 곧 재계산이다.

- [ ] **Step 5: CLAUDE.md에 규약을 기록한다**

"개발 메모"의 `API(브리핑)` 항목 끝에 이어 붙일 것:

```markdown
  - **브리핑 페이로드 캐시**(`briefing_cache` 0008, 2026-08-06): `/api/briefing`은 `lib/briefing.js`의
    `getBriefing()`만 호출한다 — 지문(`favorites` 6필드 + 대상 행 `max(fetched_at)` + KST 날짜)이
    일치하면 저장된 payload를 그대로 반환(warm 1.5s → 0.2s대). ⚠️ **지문 계산 경로는 하나여야 한다**
    — cron 워밍도 같은 `getBriefing()`을 부른다. 두 곳에서 각자 조립하면 재료 하나만 어긋나도
    캐시가 영원히 미스가 되고, 조용히 느려질 뿐이라 눈치채기 어렵다. ⚠️ `buildFingerprint`의
    `FAV_FIELDS`는 **payload가 실제로 읽는 favorites 필드와 같아야** 한다(payload가 새 필드를
    읽으면 여기에도 추가 — 안 그러면 그 변경이 화면에 안 뜬다). ⚠️ 캐시 계층 실패(테이블 부재·
    조회 실패·지문 실패)는 **전부 라이브 계산 폴백** — 반대로 기울면 조용히 틀린 화면이 된다.
    ⚠️ cron 워밍은 **추세 워밍보다 앞**에 둘 것(`/api/cron/refresh`) — 추세 워밍은 40s 데드라인으로
    미완주분을 다음 실행에 넘기는 양보 가능한 작업이라, 뒤에 두면 영영 안 돈다.
    ⚠️ 서버 D-day(`upcoming.dday`)는 `daysBetweenYmd(kstDate(), ymd)` — 예전 `setHours(0,0,0,0)`
    기준은 Vercel(UTC)에서 KST 00:00~09:00에 하루 크게 나오고, 캐시하면 그 오차가 온종일 고정된다.
```

- [ ] **Step 6: PROGRESS.md에 섹션을 추가한다**

`## 상태:` 줄 바로 다음(= 최신 섹션 자리)에 삽입하고, `## ▶ 다음 세션 시작점`의 "최신 작업" 줄을 이 작업으로 갱신할 것:

```markdown
## ✅ 브리핑 페이로드 캐시 (2026-08-06)
**문제**: `/api/briefing` warm 1.2~1.7s. 매 요청마다 `trade_raw_cache`에서 0.48MB·거래 3,003건
(4개월 × 관심지역 4곳)을 받아 `excludeAbnormal`→`buildSignal`→피드 조립을 다시 했다. 출력은
11.4KB뿐인데 입력이 크고, 데이터는 cron이 하루 한 번 갱신하므로 재계산이 순수 낭비.
- **지문 캐시**: 응답 JSON을 `briefing_cache`(단일 행, 0008)에 저장하고 **입력의 지문**이 같을
  때만 재사용. 지문 = favorites 6필드 + 대상 행 `max(fetched_at)` + KST 날짜 → 지문이 입력
  전체를 덮으므로 **별도 무효화 로직 없이** ★ 변경 즉시 반영이 자동으로 따라온다.
- **경로 단일화**: 라우트와 cron 워밍이 둘 다 `getBriefing()`만 부른다 — 지문을 두 곳에서
  조립하면 재료 하나만 어긋나도 캐시가 영원히 미스가 되는데, 그건 조용히 느려질 뿐이라
  발견이 어렵다.
- **워밍 순서**: 재수집 직후·추세 워밍 **앞**(추세 워밍은 40s 데드라인으로 양보하는 작업이라
  뒤에 두면 영영 안 돈다).
- **덤으로 잡은 버그**: 서버 D-day가 `setHours(0,0,0,0)`(Vercel=UTC 자정) 기준이라 KST
  00:00~09:00에 하루 크게 나왔다. 지금은 그 시간대 방문이 드물어 안 보였지만 **06:00 KST에
  계산한 페이로드를 온종일 재사용하면 그 오차가 고정**된다 → `daysBetweenYmd(kstDate(), ymd)`로
  교정(순수 함수 + 테스트). 이 프로젝트 KST 재발 지점 5번째.
- 전 구간 graceful: 테이블 부재·조회 실패·지문 실패 → 라이브 계산 폴백(실측으로 확인).
- **검증**: `npm test` 62개(신규 12) + `npx next build` + 추출 전후 응답 diff 0 +
  로컬/prod 실측(캐시 히트 시 ⟨측정값⟩, ★ 토글 직후 즉시 반영).
```
⟨측정값⟩ 자리에 Step 3에서 잰 실제 숫자를 넣을 것.

- [ ] **Step 7: 커밋 & push**

```bash
git add CLAUDE.md PROGRESS.md
git commit -F .git/COMMIT_MSG_TMP.txt
git push origin main
```
(메시지: `docs: 브리핑 페이로드 캐시 진척·규약 기록`)

---

## Self-Review

**Spec coverage** (`2026-08-05-briefing-cache-design.md` 대비)

| 스펙 항목 | 담당 |
|---|---|
| 1. 로직 추출 `lib/briefing.js` | Task 3 |
| 2. 마이그레이션 0008 | Task 2 |
| 3. 지문 `lib/briefingCache.js` | Task 1 |
| 4. 요청 흐름(favorites → 지문 재료 2종 Promise.all → 일치 시 payload → 불일치 시 계산·upsert) | Task 4 |
| 5. cron 워밍(추세 워밍 앞, 실패 삼킴, `briefingWarm`) | Task 5 |
| 6. 에러 처리 전부 graceful | Task 4 Step 1·5 |
| 7. 테스트 4종(순서 정규화 / ★ 추가·삭제·메모 / fetched_at / KST 경계) | Task 1 Step 1 |
| 8. 관측 `cached`·`computedAt` | Task 4 Step 2 |
| 검증 계획(`npm test`+build, 실측, CLAUDE.md 기록) | Task 3·4·6 |

**스펙에 없던 추가분 2건**(구현 중 발견):
- 서버 D-day KST 교정 — 캐시가 오차를 온종일 고정시키므로 **캐시의 선결 조건**이다(Task 3).
- 추출 전후 parity diff — "순수 이동"을 주장하려면 증거가 필요하다(Task 3 Step 5·8).

**Type consistency**: `buildFingerprint({favs, latestFetched, kstDate})` / `kstDate(nowMs)` /
`daysBetweenYmd(fromYmd, toYmd)` / `buildBriefingPayload(favs)` /
`getBriefing(supabase) -> {payload, cached, computedAt, error?}` — Task 1·3·4·5의 호출부에서
같은 이름·같은 인자 순서로 쓰였는지 확인함. DB 컬럼(`fingerprint`/`payload`/`computed_at`)도
0008과 `readCache`/`writeCache`가 일치.
