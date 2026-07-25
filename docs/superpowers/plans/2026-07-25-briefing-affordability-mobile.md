# 브리핑 · 자금 정확도 · 모바일 레이아웃 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실거래 탐색 앱에 (1) 취득세·중개보수를 포함한 정확한 필요자금과 월 상환액, (2) 월상환액 기준 매물 필터, (3) 즐겨찾기 단지 변동을 매일 보여주는 브리핑, (4) 겹치지 않는 모바일 레이아웃을 추가한다.

**Architecture:** 순수 계산은 `app/lib/`의 supabase-비의존 모듈에 모아 `node:test`로 테스트한다. `requiredCash` 한 곳만 고치면 마커 색칠·리스트 배지·평형 카드가 자동 전파되는 기존 구조를 유지한다. 브리핑은 이미 매일 도는 cron이 채워둔 `trade_raw_cache`만 읽어 새 외부 호출 없이 만든다. 모바일은 "상단 1줄 바 + 하단 시트 단일 슬롯"으로 바꿔 겹침을 구조적으로 불가능하게 한다.

**Tech Stack:** Next.js 16 (App Router) · React 19 · Supabase · 카카오맵 JS SDK · `node:test`(신규, 의존성 0) · Playwright(임시 스크립트)

**Spec:** `docs/superpowers/specs/2026-07-25-briefing-affordability-mobile-design.md`

## Global Constraints

- **금액 단위는 전부 만원.** 국토부 `dealAmount`와 동일. 면적은 전용 ㎡.
- **비밀키 커밋 절대 금지.** `.env.local`·`.mcp.json`은 gitignore 확인 완료 상태를 유지한다.
- **정책·세율 하드코딩 시 출처 법령 조항과 시행일을 주석으로 남긴다.** (CLAUDE.md 작업 규칙)
- **`app/lib/loanPolicy.js`·`app/lib/acquisitionCost.js`는 supabase에 의존하지 않는다.** 이 성질이 깨지면 `node:test` 단독 실행이 불가능해진다. `trades.js`는 `./supabaseServer`(확장자 없는 import) 때문에 raw node에서 `ERR_MODULE_NOT_FOUND`로 죽으므로 절대 import하지 말 것.
- **lib 간 import는 확장자를 붙인다** (`./regions.js` 꼴). `news.js`가 이 패턴을 이미 따른다.
- **테스트 실행은 `npm test` = `node --test "tests/*.test.mjs"`.** 디렉터리 형태(`node --test tests/`)는 `MODULE_NOT_FOUND`로 실패한다(2026-07-25 실측). 글로브를 따옴표로 감쌀 것.
- `MODULE_TYPELESS_PACKAGE_JSON` 경고는 무해하다. 없애려고 `package.json`에 `"type": "module"`을 **추가하지 말 것** — Next.js 빌드가 깨진다.
- **한글 커밋 메시지는 `git commit -F <파일>`.** 임시파일은 Write 도구로 `.git\COMMIT_MSG_TMP.txt`에 쓴다. PowerShell `Set-Content -Encoding utf8`은 BOM을 붙여 제목 첫머리에 U+FEFF가 박히므로 금지.
- **한글 인자 API 테스트에 bash `curl` 금지.** `node -e`의 `fetch` + `encodeURIComponent`를 쓴다.
- **컴파일 검증은 `npx next build`.** `next lint --file` 옵션은 존재하지 않는다.

---

## File Structure

**신규**

| 파일 | 책임 |
|---|---|
| `app/lib/acquisitionCost.js` | 취득세·지방교육세·농특세·중개보수·등기비 순수 계산. 지방세법/공인중개사법 도메인 — 은행 규제(loanPolicy)와 갱신 주기가 달라 분리 |
| `app/lib/briefingSeen.js` | localStorage 기반 🆕 판정. 지도 배지와 뉴스 브리핑 양쪽에서 공유 |
| `app/api/briefing/route.js` | 즐겨찾기 단지 최근 거래 + 다가오는 일정. 캐시 전용 |
| `app/components/Briefing.js` | 브리핑 3카드 UI |
| `app/components/MobileShell.js` | 모바일 상단 1줄 바 + 하단 시트 셸 |
| `tests/acquisitionCost.test.mjs` | 세율 경계값 |
| `tests/loanPolicy.test.mjs` | neededLoan·gap 일치성, 월납 |

**수정**

| 파일 | 변경 |
|---|---|
| `app/lib/loanPolicy.js` | `calcMaxLoan`에 `area`·`assets` 인자, `acquisitionCost`·`neededLoan`·`monthlyPayment`·`dsrRatio` 반환, `affordable` 제거 |
| `app/lib/trades.js` | `fetchRawMonths`에 `cacheOnly` 옵션 |
| `app/components/KakaoMap.js` | `loanForPrice(price, m2)`, `bestGap`→`bestFit`, 월상환 필터, 모바일 셸 사용, 📰 배지 |
| `app/components/mapStyles.js` | `Z` 상수, 모바일 바/시트/백드롭, 부대비용 내역 스타일 |
| `app/components/HelpModal.js` | 실제금리 vs 스트레스금리 설명 |
| `app/news/page.js` | `Briefing` 삽입 |
| `package.json` | `"test"` 스크립트 |

`KakaoMap.js`가 이미 1,279줄이라 이 작업으로 더 커진다. `MobileShell.js` 분리로 상쇄하되, **세부패널 본문·리스트 본문은 그대로 두고 껍데기만** 옮겨 변경 범위를 좁힌다.

---

## Task 1: 부대비용 계산 모듈

**Files:**
- Create: `app/lib/acquisitionCost.js`
- Create: `tests/acquisitionCost.test.mjs`
- Modify: `package.json` (test 스크립트)

**Interfaces:**
- Consumes: 없음 (순수 함수, 의존성 0)
- Produces: `calcAcquisitionCost({ price, area, householdType, isFirstTime, regulated })` → `{ acquisitionTax, localEduTax, ruralTax, brokerFee, registryEtc, total, taxRate }` — 전부 만원 단위 정수, `taxRate`만 소수(0.01 = 1%)

- [ ] **Step 1: `package.json`에 test 스크립트 추가**

`scripts`에 한 줄 추가한다. **글로브를 따옴표로 감싸는 것이 필수** — 디렉터리 형태는 실패한다.

```json
"test": "node --test \"tests/*.test.mjs\""
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/acquisitionCost.test.mjs`:

```js
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../app/lib/acquisitionCost.js'`

- [ ] **Step 4: 구현**

`app/lib/acquisitionCost.js`:

```js
// 주택 매수 부대비용 — 취득세·지방교육세·농어촌특별세·중개보수·등기비.
//
// ⚠️ 공식 API가 없어 법정 요율을 하드코딩한다. 변경 시 이 파일만 갱신.
// 모든 금액 단위는 **만원** (loanPolicy.js·국토부 dealAmount와 동일). 면적은 전용 ㎡.
//
// ── 출처 / 시행일 ─────────────────────────────────────────────
// [취득세]     지방세법 §11①8 (주택 유상거래) — 6억↓ 1% / 6~9억 선형 / 9억↑ 3%
// [중과]       지방세법 §13조의2 — 조정대상지역 2주택 8%, 3주택↑ 12% / 비조정 3주택 8%
// [지방교육세] 지방세법 §151①1나 — 주택 유상거래는 취득세율 × 10%. 중과 시 0.4% 고정
// [농특세]     농어촌특별세법 §5 — 전용 85㎡ **초과**분 0.2% (85㎡ 이하 비과세)
// [생애최초]   지방세특례제한법 §36조의3 — 12억 이하 주택, 취득세 200만원 한도 감면
//              (2022-06-21 이후 취득분, 소득·주택가격 요건 폐지)
// [중개보수]   공인중개사법 시행규칙 별표1 (2021-10-19 시행), 주택 매매·교환
// 확인일: 2026-07-25
// ──────────────────────────────────────────────────────────────

// ⚠️ 아래 두 상수만 법령이 아닌 **경험치 근사**다.
// 등기비 = 법무사 보수 + 국민주택채권 매입 후 할인손실 + 증지. 채권 할인손실이
// 시가표준액·채권 시세에 따라 변동해 정확한 계산이 불가능하다. 실제 견적을 겪으면
// 이 두 숫자만 갈아끼우면 된다. 9억 기준 약 175만원.
const REGISTRY_RATE = 0.0015;
const REGISTRY_FIXED = 40;

const VAT = 0.1; // 중개보수 부가세 (일반과세자 기준)
const RURAL_TAX_AREA = 85; // 농특세 과세 기준 전용면적(㎡) — 초과분만 과세
const FIRST_TIME_CAP_PRICE = 120000; // 생애최초 감면 대상 주택가액 상한 12억
const FIRST_TIME_RELIEF = 200; // 생애최초 취득세 감면 한도 200만원

// 취득세율. 반환은 소수(0.01 = 1%).
// 6억 초과 9억 이하 구간은 (취득가액[억] × 2 / 3 − 3)% 선형 — 소수점 5째 자리 반올림.
function acquisitionTaxRate(price, householdType, regulated) {
  // 중과: 본 앱의 householdType은 무주택|1주택|다주택 3단계뿐이라
  // `다주택` = 2주택 취득으로 간주한다. 사용자가 무주택/최대 1주택 범위라
  // 3주택 이상(12%) 경로는 실제로 밟히지 않는다 (2026-07-25 결정).
  if (householdType === "다주택" && regulated) return 0.08;

  if (price <= 60000) return 0.01;
  if (price > 90000) return 0.03;
  const eok = price / 10000;
  return Math.round(((eok * 2) / 3 - 3) * 10000) / 10000 / 100;
}

// 중개보수 상한요율 + 한도액(만원). 실제는 협의로 정하나 상한을 가정한다 —
// 보수적(비싸게) 추정이 "살 수 있다더니 못 사는" 실패보다 낫다.
function brokerRate(price) {
  if (price < 5000) return { rate: 0.006, cap: 25 };
  if (price < 20000) return { rate: 0.005, cap: 80 };
  if (price < 90000) return { rate: 0.004, cap: Infinity };
  if (price < 120000) return { rate: 0.005, cap: Infinity };
  if (price < 150000) return { rate: 0.006, cap: Infinity };
  return { rate: 0.007, cap: Infinity };
}

export function calcAcquisitionCost({
  price,
  area = 0,
  householdType = "무주택",
  isFirstTime = false,
  regulated = false,
}) {
  if (!price || price <= 0) {
    return {
      acquisitionTax: 0, localEduTax: 0, ruralTax: 0,
      brokerFee: 0, registryEtc: 0, total: 0, taxRate: 0,
    };
  }

  const taxRate = acquisitionTaxRate(price, householdType, regulated);
  const heavy = taxRate >= 0.08; // 중과 여부 — 지방교육세·농특세 규칙이 달라진다

  let acquisitionTax = price * taxRate;
  if (isFirstTime && price <= FIRST_TIME_CAP_PRICE) {
    acquisitionTax = Math.max(0, acquisitionTax - FIRST_TIME_RELIEF);
  }

  // 지방교육세: 일반은 취득세율의 1/10, 중과 시 0.4% 고정.
  // 감면(생애최초)과 무관하게 표준세율 기준으로 계산한다.
  const localEduTax = heavy ? price * 0.004 : price * taxRate * 0.1;

  // 농특세: 전용 85㎡ 초과에만. 중과 시 0.6%(8%) / 1.0%(12%).
  const ruralTax = area > RURAL_TAX_AREA ? price * (heavy ? 0.006 : 0.002) : 0;

  const { rate, cap } = brokerRate(price);
  const brokerFee = Math.min(price * rate, cap) * (1 + VAT);

  const registryEtc = price * REGISTRY_RATE + REGISTRY_FIXED;

  const r = {
    acquisitionTax: Math.round(acquisitionTax),
    localEduTax: Math.round(localEduTax),
    ruralTax: Math.round(ruralTax),
    brokerFee: Math.round(brokerFee),
    registryEtc: Math.round(registryEtc),
    taxRate,
  };
  r.total = r.acquisitionTax + r.localEduTax + r.ruralTax + r.brokerFee + r.registryEtc;
  return r;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 10 tests. `MODULE_TYPELESS_PACKAGE_JSON` 경고는 무해하니 무시한다.

숫자가 어긋나면 **테스트가 아니라 구현을 의심할 것** — 기대값은 위 주석의 법령 요율에서 손계산한 것이다. 예: 5억 = 취득세 500 + 교육세 50 + 농특세 0 + 중개 220 + 등기 115 = 885.

- [ ] **Step 6: 커밋**

Write 도구로 `.git\COMMIT_MSG_TMP.txt`에 아래를 쓴 뒤 커밋한다.

```
feat(lib): 주택 매수 부대비용 계산 + node:test 도입

취득세(지방세법 §11①8)·지방교육세·농특세·중개보수(공인중개사법 시행규칙 별표1)
·등기비 근사를 계산한다. 등기비 두 계수는 법령이 아닌 경험치라 명명 상수로 분리.

테스트 프레임워크가 없던 프로젝트에 의존성 0인 node:test를 도입한다.
npm test = node --test "tests/*.test.mjs" (디렉터리 형태는 MODULE_NOT_FOUND로 실패).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

```bash
git add app/lib/acquisitionCost.js tests/acquisitionCost.test.mjs package.json
git commit -F .git/COMMIT_MSG_TMP.txt
```

---

## Task 2: `calcMaxLoan` 확장 — 필요자금·월납·DSR

**Files:**
- Modify: `app/lib/loanPolicy.js:83-119` (`calcMaxLoan`)
- Create: `tests/loanPolicy.test.mjs`

**Interfaces:**
- Consumes: `calcAcquisitionCost()` from Task 1
- Produces: `calcMaxLoan({ price, lawdCd, householdType, isFirstTime, annualIncome, existingAnnualDebt, rate, termYears, area, assets })` → 기존 필드 + `{ acquisitionCost, neededLoan, monthlyPayment, dsrRatio }`. `affordable` 필드는 **제거**된다 (현재 어느 호출부도 쓰지 않음 — `KakaoMap.js`에서 `ln.maxLoan`·`ln.requiredCash`·`ln.binding`만 참조).

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/loanPolicy.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcMaxLoan } from "../app/lib/loanPolicy.js";
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

test("assets 미지정이면 한도까지 빌린 것으로 본다", () => {
  const r = calcMaxLoan(BASE);
  assert.equal(r.neededLoan, r.maxLoan);
});

test("neededLoan은 maxLoan을 넘지 않는다", () => {
  const r = calcMaxLoan({ ...BASE, assets: 0 });
  assert.ok(r.neededLoan <= r.maxLoan);
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `r.acquisitionCost`가 `undefined`

- [ ] **Step 3: 구현**

`app/lib/loanPolicy.js` 상단에 import를 추가한다 (**확장자 필수**):

```js
import { calcAcquisitionCost } from "./acquisitionCost.js";
```

`calcMaxLoan`을 아래로 교체한다. 기존 1)~3) 계산 로직은 그대로 두고 4)~6)을 추가하는 것이다.

```js
// 대출 가능액 + 실제 자금 계획 계산.
// 입력(만원/연/소수율): price 매물가, area 전용㎡(농특세 판정), assets 가용 자기자금,
//   annualIncome 연소득, existingAnnualDebt 기존 연 원리금상환액, rate 실제 금리, termYears 만기.
// 반환: ltvLimit/dsrLimit 각 한도, maxLoan 최종, binding 제약요인,
//   acquisitionCost 부대비용 내역, requiredCash 필요 자기자금(부대비용 포함),
//   neededLoan 실제로 빌릴 금액, monthlyPayment 월 원리금(실제 금리), dsrRatio(스트레스 금리).
export function calcMaxLoan({
  price,
  lawdCd,
  householdType = "무주택",
  isFirstTime = false,
  annualIncome,
  existingAnnualDebt = 0,
  rate = 0.04,
  termYears = 40,
  area = 0,
  assets = 0,
}) {
  const regulated = isRegulated(lawdCd);

  // 1) LTV 기준 한도 = min(가격×LTV, 가격상한, [생애최초 수도권 6억])
  const rawLtv = price * ltvRate(regulated, householdType, isFirstTime);
  let ltvLimit = Math.min(rawLtv, priceCap(price));
  if (isFirstTime) ltvLimit = Math.min(ltvLimit, FIRST_TIME_CAP);

  // 2) DSR 기준 한도: (연소득×40% − 기존상환액) / 스트레스 적용 단위상환액
  const sRate = rate + stressRate(regulated);
  const perUnitStress = annualPaymentPerUnit(sRate, termYears);
  const dsrBudget = annualIncome * DSR_LIMIT - existingAnnualDebt;
  const dsrLimit = Math.max(0, dsrBudget / perUnitStress);

  // 3) 최종 = 둘 중 작은 값
  const maxLoan = Math.max(0, Math.min(ltvLimit, dsrLimit));
  const binding = ltvLimit <= dsrLimit ? "LTV" : "DSR";

  // 4) 부대비용(취득세·중개보수·등기 등)을 필요 자기자금에 포함.
  //    ⚠️ requiredCash는 마커 색칠·리스트 여유 배지·평형 카드가 전부 공유하는 단일 소스다.
  //    여기만 바뀌면 전 화면에 자동 전파된다 — 호출부에서 따로 더하지 말 것.
  const acquisitionCost = calcAcquisitionCost({
    price, area, householdType, isFirstTime, regulated,
  });
  const requiredCash = Math.max(0, Math.round(price - maxLoan)) + acquisitionCost.total;

  // 5) 실제로 빌릴 금액. 자기자금이 많으면 한도까지 빌릴 이유가 없으므로
  //    한도 기준 월납은 실제와 동떨어진 숫자가 된다.
  //    이 정의는 gap 판정과 정확히 일치한다:
  //      gap ≥ 0 ⟺ assets ≥ price + 비용 − maxLoan ⟺ maxLoan ≥ neededLoan
  const neededLoan = Math.min(
    maxLoan,
    Math.max(0, price + acquisitionCost.total - assets)
  );

  // 6) 월 원리금은 **실제 금리**(현금흐름), DSR은 **스트레스 금리**(규제 심사).
  //    둘이 다른 게 정상 — HelpModal에서 설명한다.
  const monthlyPayment = (neededLoan * annualPaymentPerUnit(rate, termYears)) / 12;
  const dsrRatio =
    annualIncome > 0
      ? (neededLoan * perUnitStress + existingAnnualDebt) / annualIncome
      : null;

  return {
    regulated,
    ltvLimit: Math.round(ltvLimit),
    dsrLimit: Math.round(dsrLimit),
    maxLoan: Math.round(maxLoan),
    binding,
    acquisitionCost,
    requiredCash,
    neededLoan: Math.round(neededLoan),
    monthlyPayment: Math.round(monthlyPayment),
    dsrRatio,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 19 tests (Task 1의 10 + 이번 9)

- [ ] **Step 5: 빌드 확인**

Run: `npx next build`
Expected: 성공. `affordable`을 제거했으므로 참조가 남아 있으면 여기서 드러난다.

- [ ] **Step 6: 커밋**

메시지:

```
feat(lib): 필요자금에 부대비용 반영 + 월 상환액·DSR 계산

requiredCash = (매매가 − 대출) + 취득세·중개보수·등기비. 마커 색칠·리스트
배지·평형 카드가 이 값을 공유하므로 한 곳 수정으로 전파된다.

월납은 maxLoan이 아니라 neededLoan(실제로 빌릴 금액) 기준으로 계산한다.
자기자금이 많으면 한도까지 빌릴 이유가 없어 한도 기준 월납은 실제와 다르다.
이 정의가 기존 gap ≥ 0 판정과 일치함을 테스트로 고정했다.

미사용 필드 affordable 제거.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

```bash
git add app/lib/loanPolicy.js tests/loanPolicy.test.mjs
git commit -F .git/COMMIT_MSG_TMP.txt
```

---

## Task 3: 지도 반영 — 평형 카드 월납·부대비용 내역·안내 배너

**Files:**
- Modify: `app/components/KakaoMap.js` (`loanForPrice` 176-188, `bestGap` 190-203, 평형 카드 1141-1233, 컨트롤 패널 870-879)
- Modify: `app/components/mapStyles.js` (스타일 추가)
- Modify: `app/components/HelpModal.js`

**Interfaces:**
- Consumes: `calcMaxLoan(...)` from Task 2 — `acquisitionCost`·`neededLoan`·`monthlyPayment`·`dsrRatio`
- Produces: `loanForPrice(price, m2)` — 2번째 인자로 전용면적(㎡)을 받는다. `bestGap(hits)` 시그니처는 이 태스크에서 유지되고 Task 4에서 `bestFit`으로 바뀐다.

- [ ] **Step 1: `mapStyles.js`에 스타일 추가**

⚠️ **추가 전 파일에서 이름을 grep할 것** — 중복 정의는 dev 컴파일 에러다 (`newsLink` 충돌 실제 발생 2026-07-08).

Run: `grep -nE "costToggle|costTable|costRow|monthlyLine|migrateNotice" app/components/mapStyles.js`
Expected: 결과 없음

파일 끝에 추가:

```js
// 부대비용 내역 (평형 카드 안에서 접힘/펼침).
export const costToggle = {
  border: "none", background: "none", color: C.blue, fontSize: 11,
  fontWeight: 600, cursor: "pointer", padding: 0, textAlign: "left",
};
export const costTable = {
  marginTop: 6, padding: "7px 9px", background: "#f8fafc",
  borderWidth: 1, borderStyle: "solid", borderColor: C.divider,
  borderRadius: 9, fontSize: 11, color: C.sub,
};
export const costRow = {
  display: "flex", justifyContent: "space-between", padding: "2px 0",
};
export const monthlyLine = {
  fontSize: 12, color: C.sub, marginTop: 3,
  fontVariantNumeric: "tabular-nums",
};
// 부대비용 반영으로 필요자금이 늘어난 것을 최초 1회 알린다.
export const migrateNotice = {
  padding: "9px 11px", background: "#fffbeb",
  borderWidth: 1, borderStyle: "solid", borderColor: "#fde68a",
  borderRadius: 10, fontSize: 11, color: "#92400e", lineHeight: 1.5,
};
```

- [ ] **Step 2: `loanForPrice`·`bestGap`에 면적 전달**

`KakaoMap.js:176-203`을 교체한다. 두 호출부 모두 실제 전용면적을 이미 알고 있으므로 근사가 필요 없다.

```js
  function loanForPrice(price, m2 = 0) {
    if (!hasProfile || !price) return null;
    return calcMaxLoan({
      price,
      lawdCd,
      householdType: profile.householdType,
      isFirstTime: profile.isFirstTime,
      annualIncome: incomeNum,
      existingAnnualDebt: Number(profile.existingDebt) || 0,
      rate: (Number(profile.rate) || 0) / 100,
      termYears: Number(profile.termYears) || 40,
      area: m2,   // 농특세(85㎡ 초과) 판정
      assets,     // neededLoan·월납 계산 기준
    });
  }

  // 한 단지에서 대출 가능한 평형 중 최대 자금 여유(보유자산 − 필요자금, 만원). 전 평형 대출 불가면 null.
  // priceBasis(최근/평균) 기준가 사용. 마커 색칠(여유 ≥ 0 = 초록)과 리스트 여유 배지·정렬이 이 계산을 공유.
  function bestGap(hits) {
    let gap = null;
    for (const g of groupByPyeong(hits)) {
      const gp = priceBasis === "recent" ? g.recentAmount : g.avg;
      const ln = loanForPrice(gp, g.m2);
      if (ln && ln.maxLoan > 0) {
        const d = assets - ln.requiredCash;
        if (gap == null || d > gap) gap = d;
      }
    }
    return gap;
  }
```

- [ ] **Step 3: 평형 카드에 월납 + 부대비용 내역 추가**

먼저 컴포넌트 상단 state에 펼침 상태를 추가한다 (`const [priceBasis, ...]` 근처):

```js
  const [showCost, setShowCost] = useState(null); // 부대비용 내역 펼친 평형(m2) | null
```

import에 새 스타일을 추가한다:

```js
  costToggle, costTable, costRow, monthlyLine, migrateNotice,
```

`KakaoMap.js:1142` `const ln = loanForPrice(gp);`를 면적 전달로 바꾸고:

```js
              const ln = loanForPrice(gp, g.m2);
```

`KakaoMap.js:1204-1229`의 `{ln && (...)}` 블록 중 대출 정보 행을 아래로 교체한다. `loanRow` 안의 기존 2줄(대출/필요자금, 매수가능/부족) 사이에 월납 줄과 내역 토글을 끼운다.

```js
                      <div style={loanRow}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.sub }}>
                          <span>
                            대출 <b style={{ color: C.text }}>{formatManwon(ln.maxLoan)}</b>
                            <span style={bindingTag}>{ln.binding}</span>
                          </span>
                          <span>필요자금 <b style={{ color: C.text }}>{formatManwon(ln.requiredCash)}</b></span>
                        </div>

                        {/* 월납은 실제 금리 기준 현금흐름. DSR은 스트레스 금리 기준 규제 수치라 다르다. */}
                        <div style={monthlyLine}>
                          월 <b style={{ color: C.text }}>{ln.monthlyPayment.toLocaleString()}만원</b>
                          {ln.dsrRatio != null && (
                            <span style={{ color: C.muted }}>
                              {" · DSR "}{Math.round(ln.dsrRatio * 100)}%
                            </span>
                          )}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // 카드 클릭(추세 선택기)과 충돌 방지
                            setShowCost((v) => (v === g.m2 ? null : g.m2));
                          }}
                          style={costToggle}
                        >
                          {showCost === g.m2 ? "▾" : "▸"} 부대비용 {formatManwon(ln.acquisitionCost.total)} 내역
                        </button>
                        {showCost === g.m2 && (
                          <div style={costTable} onClick={(e) => e.stopPropagation()}>
                            <div style={costRow}>
                              <span>취득세 ({(ln.acquisitionCost.taxRate * 100).toFixed(2)}%)</span>
                              <span>{formatManwon(ln.acquisitionCost.acquisitionTax)}</span>
                            </div>
                            <div style={costRow}>
                              <span>지방교육세</span>
                              <span>{formatManwon(ln.acquisitionCost.localEduTax)}</span>
                            </div>
                            {ln.acquisitionCost.ruralTax > 0 && (
                              <div style={costRow}>
                                <span>농어촌특별세 (85㎡ 초과)</span>
                                <span>{formatManwon(ln.acquisitionCost.ruralTax)}</span>
                              </div>
                            )}
                            <div style={costRow}>
                              <span>중개보수 (VAT 포함)</span>
                              <span>{formatManwon(ln.acquisitionCost.brokerFee)}</span>
                            </div>
                            <div style={costRow}>
                              <span>등기·채권 등 (근사)</span>
                              <span>{formatManwon(ln.acquisitionCost.registryEtc)}</span>
                            </div>
                            {profile.householdType === "다주택" && (
                              <div style={{ marginTop: 4, color: C.muted, lineHeight: 1.5 }}>
                                2주택 취득 기준입니다. 3주택 이상이면 취득세율이 12%로 더 높습니다.
                              </div>
                            )}
                          </div>
                        )}

                        {assets > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, color: gap >= 0 ? C.green : C.red }}>
                            {gap >= 0
                              ? `✓ 매수 가능 · 여유 ${formatManwon(gap)}`
                              : `✗ 자금 부족 ${formatManwon(-gap)}`}
                          </div>
                        )}
                      </div>
```

- [ ] **Step 4: 최초 1회 안내 배너**

부대비용이 들어가면 기존에 🟢이던 핀 일부가 🔴로 바뀐다. 사용자가 "앱이 고장났나" 싶지 않게 한 번만 알린다.

state와 상수를 추가한다:

```js
const COST_NOTICE_KEY = "re_cost_notice_seen";
```

```js
  const [showCostNotice, setShowCostNotice] = useState(false);

  // 부대비용 반영 안내 — 자금을 설정해 둔 기존 사용자에게만, 최초 1회.
  useEffect(() => {
    if (!hasProfile) return;
    try {
      if (!localStorage.getItem(COST_NOTICE_KEY)) setShowCostNotice(true);
    } catch {
      /* 무시 */
    }
  }, [hasProfile]);

  function dismissCostNotice() {
    setShowCostNotice(false);
    try {
      localStorage.setItem(COST_NOTICE_KEY, "1");
    } catch {
      /* 무시 */
    }
  }
```

컨트롤 패널의 범례(`legendRow`) 바로 위에 렌더한다:

```js
        {showCostNotice && (
          <div style={migrateNotice}>
            필요자금에 <b>취득세·중개보수·등기비</b>가 반영되도록 개선했습니다.
            이전보다 필요자금이 커 보이는 게 정상이에요.
            <button onClick={dismissCostNotice} style={{ ...linkBtn, marginLeft: 6, fontSize: 11 }}>
              확인
            </button>
          </div>
        )}
```

- [ ] **Step 5: `HelpModal.js`에 두 금리 설명 추가**

`HelpModal.js`의 마지막 `helpBlock` 뒤에 추가한다:

```js
        <div style={helpBlock}>
          <div style={helpHead}>월 상환액과 DSR%가 왜 다른가요?</div>
          <div style={helpBody}>
            <b>월 상환액</b>은 실제 대출금리로 계산한, 매달 실제로 나가는 돈입니다.
            <br />
            <b>DSR%</b>는 은행이 심사할 때 쓰는 수치라 실제 금리에
            <b> 스트레스 금리</b>(수도권·규제지역 +3.0%p)를 더해 계산합니다.
            같은 대출인데 DSR 쪽 숫자가 더 크게 나오는 건 정상이며,
            대출 한도는 이 DSR 기준(40%)으로 잘립니다.
          </div>
        </div>
        <div style={helpBlock}>
          <div style={helpHead}>필요자금에 뭐가 들어가나요?</div>
          <div style={helpBody}>
            매매가에서 대출을 뺀 금액에 <b>취득세·지방교육세·농어촌특별세(85㎡ 초과)
            ·중개보수·등기비</b>를 더한 값입니다. 평형 카드의
            "부대비용 내역"을 누르면 항목별로 볼 수 있어요.
            등기·채권비는 채권 시세에 따라 변해 <b>근사치</b>입니다.
          </div>
        </div>
```

- [ ] **Step 6: 빌드 + 실제 화면 확인**

Run: `npx next build`
Expected: 성공

dev 서버를 띄우고 브라우저에서 확인한다. 좀비 프로세스로 "Another next dev server is already running"이 뜨면:
`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ?{$_.CommandLine -match 'next'} | %{Stop-Process $_.ProcessId -Force}`

확인 항목:
- 자금 설정(보유자산 50000, 연소득 7000) → 단지 클릭 → 평형 카드에 `월 ○○만원 · DSR ○○%` 표시
- `▸ 부대비용 ○○ 내역` 클릭 → 항목별 표가 펼쳐지고 **추세 차트가 열리지 않는다**(stopPropagation 동작)
- 안내 배너가 뜨고, 확인을 누르면 새로고침해도 다시 안 뜬다

- [ ] **Step 7: 커밋**

```
feat(map): 평형 카드에 월 상환액·부대비용 내역 표시

loanForPrice에 전용면적을 넘겨 농특세(85㎡ 초과)를 정확히 반영한다.
부대비용 내역은 접힘 기본, 펼침 토글은 카드 클릭(추세 선택기)과
충돌하지 않도록 stopPropagation한다.

기존 사용자는 필요자금이 갑자기 커 보이므로 최초 1회 안내 배너를 띄운다.
HelpModal에 실제금리/스트레스금리 차이 설명 추가.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

```bash
git add app/components/KakaoMap.js app/components/mapStyles.js app/components/HelpModal.js
git commit -F .git/COMMIT_MSG_TMP.txt
```

---

## Task 4: 월 상환액 필터

**Files:**
- Modify: `app/components/KakaoMap.js` (`bestGap`→`bestFit`, `MONTHLY_FILTERS`, `renderMarkers`, `listRows`, 컨트롤 UI)

**Interfaces:**
- Consumes: `calcMaxLoan(...).monthlyPayment` from Task 2
- Produces: `bestFit(hits)` → `{ gap, monthly } | null` — 월납 조건을 만족하는 평형 중 여유가 최대인 것. `bestGap`을 대체한다. 조건을 만족하는 평형이 없으면 `null`.

- [ ] **Step 1: `MONTHLY_FILTERS` 상수 추가**

`PRICE_FILTERS` 아래에 추가한다:

```js
// 월 상환액 상한 필터(만원/월). 자금 프로필(연소득)이 있어야 계산되므로 그때만 노출한다.
const MONTHLY_FILTERS = [
  { value: "all", label: "월상환 무관", max: Infinity },
  { value: "m100", label: "월 100만 이하", max: 100 },
  { value: "m150", label: "월 150만 이하", max: 150 },
  { value: "m200", label: "월 200만 이하", max: 200 },
  { value: "m300", label: "월 300만 이하", max: 300 },
];
```

state 추가:

```js
  const [monthly, setMonthly] = useState("all"); // 월 상환액 상한
```

- [ ] **Step 2: `bestGap`을 `bestFit`으로 확장**

⚠️ **같은 평형에서 두 조건이 동시에 성립**해야 한다. A평형은 여유가 있고 B평형은 월납이 싸다고 통과시키면 실제로 살 수 없는 단지가 통과한다.

Task 3에서 만든 `bestGap`을 아래로 교체한다:

```js
  // 한 단지에서 "대출 가능 + 월납 상한 이내"인 평형 중 자금 여유가 최대인 것.
  // 반환 {gap, monthly} — 조건을 만족하는 평형이 없으면 null.
  // ⚠️ gap과 monthly는 반드시 **같은 평형**에서 나와야 한다. 평형을 넘나들며 고르면
  //    "A평형은 살 수 있고 B평형은 월납이 싸다"는 이유로 못 사는 단지가 통과한다.
  // 마커 색칠·리스트 여유 배지·정렬이 전부 이 계산을 공유한다.
  function bestFit(hits) {
    const cap = (MONTHLY_FILTERS.find((m) => m.value === monthly) ?? MONTHLY_FILTERS[0]).max;
    let best = null;
    for (const g of groupByPyeong(hits)) {
      const gp = priceBasis === "recent" ? g.recentAmount : g.avg;
      const ln = loanForPrice(gp, g.m2);
      if (!ln || ln.maxLoan <= 0) continue;
      if (ln.monthlyPayment > cap) continue;
      const d = assets - ln.requiredCash;
      if (!best || d > best.gap) best = { gap: d, monthly: ln.monthlyPayment };
    }
    return best;
  }
```

- [ ] **Step 3: `renderMarkers`·`listRows` 호출부 갱신**

`renderMarkers`의 구매가능 판정 (`KakaoMap.js:521-527` 부근):

```js
        let buyable = null;
        if (affordMode) {
          const fit = bestFit(hits);
          buyable = fit != null && fit.gap >= 0;
        }
```

`listRows`의 `gap` 계산:

```js
      const fit = affordMode ? bestFit(hits) : null; // 마커 색칠과 같은 계산 공유
      const gap = fit ? fit.gap : null;
```

`rows.push`의 `noLoan` 주석을 갱신한다 — 이제 "대출 불가" 외에 "월납 초과"도 포함된다:

```js
        noLoan: affordMode && gap == null, // 대출 불가 또는 월납 상한 초과
```

- [ ] **Step 4: `renderMarkers` effect deps에 `monthly` 추가 (⚠️ 필수)**

`KakaoMap.js:348-355`의 effect deps는 마커 갱신의 단일 트리거다. **여기 빠지면 필터를 바꿔도 마커가 안 변한다.**

```js
  }, [area, price, monthly, favorites, profile, priceBasis, rank]);
```

`listRows` useMemo deps에도 추가한다:

```js
  }, [tradesData, area, price, monthly, priceBasis, rank, profile, sortBy, onlyBuyable, favSet, householdMap]);
```

- [ ] **Step 5: 컨트롤 패널에 필터 UI 추가**

면적/가격 select 행(`KakaoMap.js:820-831`) 바로 아래에 추가한다. `affordMode`일 때만 노출한다 — 대출 계산이 불가능하면 의미가 없다.

⚠️ 컨트롤 패널은 세로 flex 전체높이라 **직계 자식에 `flex:1` 금지**(세로로 성장). 가로 행 안에서만 쓴다.

```js
        {affordMode && (
          <select
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            disabled={loading}
            style={selectStyle}
            title="월 원리금 상환액 상한으로 거르기"
          >
            {MONTHLY_FILTERS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        )}
```

- [ ] **Step 6: 자금 해제 시 초기화**

`affordMode`가 꺼질 때 자금 기반 정렬·필터를 되돌리는 기존 effect(`KakaoMap.js:692-698`)에 한 줄 추가한다:

```js
  useEffect(() => {
    if (!affordMode) {
      if (sortBy === "gap") setSortBy("yoy");
      if (onlyBuyable) setOnlyBuyable(false);
      if (monthly !== "all") setMonthly("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affordMode]);
```

- [ ] **Step 7: 상태 문자열에 필터 태그 반영**

`renderMarkers`의 `tags` 조립(`KakaoMap.js:566-568`)에 월납 필터를 넣는다:

```js
    const mB = MONTHLY_FILTERS.find((m) => m.value === monthly) ?? MONTHLY_FILTERS[0];
    const tags = [
      area === "all" ? null : aB.label,
      price === "all" ? null : pB.label,
      monthly === "all" ? null : mB.label,
    ]
      .filter(Boolean)
      .join(" · ");
```

- [ ] **Step 8: 빌드 + 동작 확인**

Run: `npx next build`
Expected: 성공

dev 서버에서:
- 자금 미설정 → 월상환 select가 **안 보인다**
- 자금 설정 → select 등장, `월 150만 이하` 선택 → 상태 문자열에 태그가 뜨고 **초록 핀 수가 줄어든다**(마커가 실제로 갱신되는지 = deps 확인)
- 리스트 `구매가능만` 체크와 조합해도 개수가 일관된다

- [ ] **Step 9: 커밋**

```
feat(map): 월 상환액 상한 필터

bestGap을 bestFit으로 확장해 {gap, monthly}를 함께 돌려준다. 두 조건은
반드시 같은 평형에서 성립해야 한다 — 평형을 넘나들면 못 사는 단지가 통과한다.

renderMarkers effect와 listRows useMemo deps에 monthly 추가
(빠지면 필터가 마커에 반영되지 않음).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

```bash
git add app/components/KakaoMap.js
git commit -F .git/COMMIT_MSG_TMP.txt
```

---

## Task 5: "얼마 더 모으면 되나"

**Files:**
- Modify: `app/components/KakaoMap.js` (프로필 필드, 평형 카드 부족 문구)
- Modify: `app/lib/format.js` (개월 → 사람이 읽는 문자열)
- Create: `tests/format.test.mjs`

**Interfaces:**
- Consumes: 없음 (순수 표시 로직)
- Produces: `monthsToLabel(months)` → `"약 16개월"` | `"약 1년 4개월"` | `null`. `app/lib/format.js`에서 export.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/format.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthsToLabel } from "../app/lib/format.js";

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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `monthsToLabel is not a function`

- [ ] **Step 3: `format.js`에 구현**

`app/lib/format.js` 끝에 추가:

```js
// 개월 수 → 사람이 읽는 기간. 10년을 넘으면 숫자가 무의미해 뭉뚱그린다.
export function monthsToLabel(months) {
  if (!Number.isFinite(months) || months <= 0) return null;
  const m = Math.ceil(months);
  if (m > 120) return "10년 이상";
  if (m < 12) return `약 ${m}개월`;
  const y = Math.floor(m / 12);
  const rest = m % 12;
  return rest ? `약 ${y}년 ${rest}개월` : `약 ${y}년`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 23 tests

- [ ] **Step 5: 프로필에 월 저축액 필드 추가**

`DEFAULT_PROFILE`에 추가:

```js
  monthlySaving: "", // 월 저축 가능액 — "얼마 더 모으면 되나" 계산용(선택)
```

자금 설정 드로어의 `연소득` 필드 아래에 추가한다:

```js
            <label style={fieldRow}>
              <span style={fieldLabel}>월 저축액</span>
              <input
                type="number"
                value={profile.monthlySaving}
                onChange={(e) => updateProfile({ monthlySaving: e.target.value })}
                placeholder="선택"
                style={fieldInput}
                title="입력하면 자금이 부족한 평형에 '얼마나 더 모으면 되는지'가 표시됩니다"
              />
            </label>
```

- [ ] **Step 6: 평형 카드 부족 문구 확장**

import에 `monthsToLabel`을 추가하고, Task 3에서 만든 `✗ 자금 부족` 줄을 교체한다:

```js
                        {assets > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, color: gap >= 0 ? C.green : C.red }}>
                            {gap >= 0 ? (
                              `✓ 매수 가능 · 여유 ${formatManwon(gap)}`
                            ) : (
                              <>
                                {`✗ 자금 부족 ${formatManwon(-gap)}`}
                                {(() => {
                                  // 현재 시세 기준 단순 나눗셈. 집값 상승·금리 변동은 반영하지 않는다
                                  // — 가정을 늘리면 숫자만 그럴듯해지고 신뢰도는 떨어진다.
                                  const save = Number(profile.monthlySaving) || 0;
                                  if (save <= 0) return null;
                                  const label = monthsToLabel(-gap / save);
                                  if (!label) return null;
                                  return (
                                    <span
                                      style={{ fontWeight: 500, color: C.sub }}
                                      title="현재 시세 기준 단순 계산입니다. 집값 변동은 반영하지 않습니다."
                                    >
                                      {` · 월 ${save.toLocaleString()}만 저축 시 ${label}`}
                                    </span>
                                  );
                                })()}
                              </>
                            )}
                          </div>
                        )}
```

- [ ] **Step 7: 빌드 + 확인**

Run: `npx next build` && `npm test`
Expected: 둘 다 성공

dev에서: 월 저축액 200 입력 → 자금 부족 평형에 `· 월 200만 저축 시 약 1년 4개월` 표시. 미입력 시 기존 문구만.

- [ ] **Step 8: 커밋**

```
feat(map): 자금 부족 평형에 "얼마 더 모으면 되나" 표시

프로필에 월 저축액(선택) 추가. 입력 시 부족액 ÷ 월저축으로 기간 환산.
집값 상승·금리 변동은 일부러 반영하지 않는다 — 가정을 늘리면 숫자만
그럴듯해지고 신뢰도는 떨어진다. 툴팁에 단순 계산임을 명시.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

```bash
git add app/components/KakaoMap.js app/lib/format.js tests/format.test.mjs
git commit -F .git/COMMIT_MSG_TMP.txt
```

---

## Task 6: `/api/briefing` — 즐겨찾기 단지 변동

**Files:**
- Modify: `app/lib/trades.js:109` (`fetchRawMonths`에 `cacheOnly`)
- Create: `app/api/briefing/route.js`

**Interfaces:**
- Consumes: `fetchRawMonths(lawdCd, ymds, { cacheOnly })`, `monthsBack`, `currentYmd` from `trades.js`
- Produces: `GET /api/briefing` → `{ complexes: [{ lawdCd, umdNm, aptNm, buildYear, recent: [{ area, amount, dealDate }], prevAmount }], upcoming: [{ aptNm, kind, label, dday }] }`

- [ ] **Step 1: `fetchRawMonths`에 `cacheOnly` 옵션 추가**

기본값 `false`라 기존 호출부는 무변경이다. `trades.js:109`의 시그니처와 미스 처리부를 수정한다.

```js
export async function fetchRawMonths(lawdCd, ymds, { refresh = false, cacheOnly = false } = {}) {
```

캐시 조회 직후, `misses` 계산 뒤에 조기 반환을 넣는다:

```js
  const misses = ymds.filter((ymd) => !byYmd.has(ymd));

  // 캐시 전용 모드: 미스가 있어도 국토부를 호출하지 않는다. 브리핑처럼
  // "이미 cron이 채워둔 것만 빠르게 읽는" 용도 — 응답 지연·API 쿼터 소모를 막는다.
  if (cacheOnly) return { byYmd, fetchedYmds: [], latestFetched };

  const fetchedYmds = [];
```

- [ ] **Step 2: 브리핑 라우트 작성**

`app/api/briefing/route.js`:

```js
// 📋 오늘의 브리핑 — 즐겨찾기 단지의 최근 실거래 + 다가오는 일정.
//
// ⚠️ 외부 API를 호출하지 않는다. /api/cron/refresh 가 매일 06:00에 즐겨찾기 지역
//    최근 2개월을 재수집해 trade_raw_cache에 넣어두므로 캐시만 읽으면 된다
//    (fetchRawMonths의 cacheOnly). 캐시에 없는 지역은 조용히 건너뛴다.

import { supabaseAdmin, noDbResponse } from "../../lib/supabaseServer";
import { fetchRawMonths, currentYmd, monthsBack } from "../../lib/trades";

const RECENT_DAYS = 30; // 브리핑에 보여줄 최근 거래 기간
const UPCOMING_DAYS = 30; // D-day 알림 범위
const MONTHS = 2; // cron이 갱신하는 범위와 동일

function daysUntil(ymd) {
  const t = new Date(`${ymd}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

export async function GET() {
  if (!supabaseAdmin) return noDbResponse();

  const { data: favs, error } = await supabaseAdmin
    .from("favorites")
    .select("*");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!favs?.length) {
    return Response.json({ complexes: [], upcoming: [] });
  }

  // 즐겨찾기가 걸린 지역만 캐시에서 읽는다.
  const ymds = monthsBack(currentYmd(), MONTHS);
  const codes = [...new Set(favs.map((f) => f.lawd_cd))];
  const byCode = new Map();
  await Promise.all(
    codes.map(async (code) => {
      try {
        const { byYmd } = await fetchRawMonths(code, ymds, { cacheOnly: true });
        byCode.set(code, [...byYmd.values()].flat());
      } catch {
        byCode.set(code, []); // 캐시 미스는 그 지역만 조용히 생략
      }
    })
  );

  const cutoff = new Date(Date.now() - RECENT_DAYS * 86400000)
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
  // 최근 거래가 있는 단지를 먼저, 그 안에서 최신순.
  complexes.sort((a, b) => (a.recent[0].dealDate < b.recent[0].dealDate ? 1 : -1));

  // 다가오는 일정. 0004 마이그레이션 미적용 환경에는 컬럼이 없으므로
  // 값이 없으면 그냥 빠진다(/api/favorites GET 폴백과 같은 방침).
  const upcoming = [];
  for (const f of favs) {
    for (const [kind, ymd, label] of [
      ["lease", f.lease_end, "임대차 만기"],
      ["note", f.note_date, f.note || "메모"],
    ]) {
      if (!ymd) continue;
      const dday = daysUntil(ymd);
      if (dday == null || dday < 0 || dday > UPCOMING_DAYS) continue;
      upcoming.push({ aptNm: f.apt_nm, kind, label, dday });
    }
  }
  upcoming.sort((a, b) => a.dday - b.dday);

  return Response.json({ complexes, upcoming });
}
```

- [ ] **Step 3: 동작 확인**

dev 서버를 띄우고(로그 "Ready" 대기) 호출한다. ⚠️ bash `curl`은 한글이 깨지므로 `node -e`의 `fetch`를 쓴다.

```bash
node -e "fetch('http://localhost:3000/api/briefing').then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2).slice(0,2000)))"
```

Expected: `{ complexes: [...], upcoming: [...] }`. 즐겨찾기가 없으면 둘 다 빈 배열.

즐겨찾기가 있는데 `complexes`가 비어 있다면 → 그 지역 캐시가 아직 없는 것이다. 지도에서 그 지역을 한 번 열어 `trade_raw_cache`를 채운 뒤 재시도한다.

- [ ] **Step 4: 기존 라우트 회귀 확인**

`cacheOnly` 추가가 기존 호출부를 건드리지 않았는지 본다.

```bash
node -e "fetch('http://localhost:3000/api/trades?lawdCd=11680&dealYmd=202607&months=3').then(r=>r.json()).then(d=>console.log(d.complexes?.length,'단지', d.fetchedAt))"
```

Expected: 단지 수가 0보다 크고 `fetchedAt`이 찍힌다.

- [ ] **Step 5: 커밋**

```
feat(api): /api/briefing — 즐겨찾기 단지 최근 거래 + 다가오는 일정

fetchRawMonths에 cacheOnly 옵션을 추가해 국토부를 호출하지 않고
cron이 채워둔 trade_raw_cache만 읽는다(기본값 false라 기존 호출부 무변경).

변동률은 같은 평형의 직전 거래와 비교한다 — 평형이 다르면 비교가 무의미.
0004 미적용 환경에서는 lease_end/note_date가 없어 upcoming이 자연히 빈다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

```bash
git add app/lib/trades.js app/api/briefing/route.js
git commit -F .git/COMMIT_MSG_TMP.txt
```

---

## Task 7: 브리핑 UI

**Files:**
- Create: `app/lib/briefingSeen.js`
- Create: `app/components/Briefing.js`
- Modify: `app/news/page.js`

**Interfaces:**
- Consumes: `GET /api/briefing` from Task 6, `calcMaxLoan` from Task 2, `classifyNews` from `lib/news.js`
- Produces:
  - `briefingSeen.js`: `loadSeen()` → `Record<string, string>` (단지키 → 마지막 확인 거래일), `markSeen(complexes)` → void, `countNew(complexes)` → number, `complexKey(c)` → `` `${lawdCd}|${umdNm}|${aptNm}` ``
  - `Briefing.js`: default export `<Briefing />` — 자체적으로 fetch하고, 데이터가 없으면 안내 한 줄만 렌더

- [ ] **Step 1: `briefingSeen.js` 작성**

지도 배지(Task 8)와 뉴스 브리핑이 같은 판정을 공유해야 하므로 별도 모듈로 뺀다.

```js
// 브리핑 🆕 판정 — 마지막으로 확인한 거래일을 localStorage에 단지별로 저장한다.
// 서버·DB를 쓰지 않는다. 지도의 📰 배지와 뉴스 브리핑이 같은 판정을 공유하려고 분리했다.

const KEY = "re_briefing_seen";

export function complexKey(c) {
  return `${c.lawdCd}|${c.umdNm}|${c.aptNm}`;
}

export function loadSeen() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

// 지금 보고 있는 단지들의 최신 거래일을 "확인함"으로 기록.
export function markSeen(complexes) {
  try {
    const seen = loadSeen();
    for (const c of complexes || []) {
      const latest = c.recent?.[0]?.dealDate;
      if (latest) seen[complexKey(c)] = latest;
    }
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* 무시 */
  }
}

// 마지막 확인 이후 새로 뜬 단지 수. 처음 보는 단지는 새 것으로 친다.
export function countNew(complexes) {
  const seen = loadSeen();
  let n = 0;
  for (const c of complexes || []) {
    const latest = c.recent?.[0]?.dealDate;
    if (latest && (!seen[complexKey(c)] || seen[complexKey(c)] < latest)) n += 1;
  }
  return n;
}

export function isNew(c, seen) {
  const latest = c.recent?.[0]?.dealDate;
  return !!latest && (!seen[complexKey(c)] || seen[complexKey(c)] < latest);
}
```

- [ ] **Step 2: `Briefing.js` 작성**

```js
"use client";

// 📋 오늘의 브리핑 — 뉴스 페이지 상단 3카드.
// ⭐ 관심 단지 변동 / ⏳ 다가오는 일정 / 💰 내게 영향 있는 뉴스.
//
// 자금 여유는 지도와 같은 loanPolicy.calcMaxLoan으로 계산한다 —
// 두 화면의 숫자가 어긋날 수 없게 하려고 계산을 공유한다.

import { useEffect, useMemo, useState } from "react";
import { calcMaxLoan } from "../lib/loanPolicy";
import { formatManwon, shortDate } from "../lib/format";
import { regionName } from "../lib/regions";
import { classifyNews } from "../lib/news";
import { C, CARD_SHADOW } from "../lib/palette";
import { loadSeen, markSeen, isNew } from "../lib/briefingSeen";

const PROFILE_KEY = "re_loan_profile"; // KakaoMap과 동일 키
const IMPACT_CATS = ["대출·금리", "정책·세금"]; // 내 자금 계획에 직접 영향
const MAX_IMPACT = 3;

// 지도의 assets 정의와 같다 — 여유현금 + 보유주택 매도 실수령.
function usableAssets(p) {
  if (!p) return 0;
  const o = p.owned;
  const sale = o ? o.priceRecent || o.priceAvg || 0 : 0;
  const net = o
    ? Math.max(0, sale - (Number(p.ownedLoanBalance) || 0) - (Number(p.ownedDeposit) || 0))
    : 0;
  return (Number(p.assets) || 0) + net;
}

export default function Briefing({ news }) {
  const [data, setData] = useState(null); // null = 로딩 중
  const [profile, setProfile] = useState(null);
  const [seen, setSeen] = useState({});

  useEffect(() => {
    setSeen(loadSeen()); // 렌더 전에 한 번 스냅샷 — markSeen 후에도 🆕가 유지된다
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) setProfile(JSON.parse(raw));
    } catch {
      /* 무시 */
    }
    fetch("/api/briefing")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        markSeen(d.complexes); // 본 순간 확인 처리 → 다음 방문엔 🆕가 빠진다
      })
      .catch(() => setData({ complexes: [], upcoming: [] })); // 실패해도 뉴스 목록은 살린다
  }, []);

  // 내게 영향 있는 뉴스 — 대출·금리/정책·세금 + 관심지역 기사.
  const impact = useMemo(() => {
    return (news || [])
      .filter((it) => {
        const cat = classifyNews(it.title);
        return IMPACT_CATS.includes(cat) || (it.keyword || "").endsWith(" 아파트");
      })
      .slice(0, MAX_IMPACT);
  }, [news]);

  if (data === null) return null; // 로딩 중엔 자리를 차지하지 않는다

  const hasIncome = Number(profile?.income) > 0;
  const assets = usableAssets(profile);

  // 즐겨찾기가 없으면 빈 카드 3개 대신 안내 한 줄.
  if (!data.complexes?.length && !data.upcoming?.length) {
    return (
      <div style={emptyHint}>
        지도에서 <b>★</b>로 관심 단지를 담으면, 여기에 그 단지의 새 실거래와 일정이 뜹니다.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.complexes?.length > 0 && (
        <section>
          <div style={cardHead}>
            ⭐ 관심 단지 <span style={headSub}>· 최근 30일</span>
          </div>
          <div style={card}>
            {data.complexes.map((c, i) => {
              const top = c.recent[0];
              const fresh = isNew(c, seen);
              const chg =
                c.prevAmount ? ((top.amount - c.prevAmount) / c.prevAmount) * 100 : null;
              const ln =
                hasIncome
                  ? calcMaxLoan({
                      price: top.amount,
                      lawdCd: c.lawdCd,
                      householdType: profile.householdType,
                      isFirstTime: profile.isFirstTime,
                      annualIncome: Number(profile.income),
                      existingAnnualDebt: Number(profile.existingDebt) || 0,
                      rate: (Number(profile.rate) || 0) / 100,
                      termYears: Number(profile.termYears) || 40,
                      area: top.area,
                      assets,
                    })
                  : null;
              const gap = ln && ln.maxLoan > 0 ? assets - ln.requiredCash : null;
              return (
                <div key={`${c.lawdCd}|${c.umdNm}|${c.aptNm}`} style={{ ...row, ...(i > 0 ? rowDivider : null) }}>
                  <div style={rowTop}>
                    <span style={rowName}>
                      {fresh && <span style={newTag}>🆕</span>}
                      {c.aptNm}
                    </span>
                    <span style={rowPrice}>{formatManwon(top.amount)}</span>
                  </div>
                  <div style={rowMeta}>
                    {regionName(c.lawdCd)} {c.umdNm} · {Math.round(top.area)}㎡ ·{" "}
                    {shortDate(top.dealDate)} 계약
                    {c.recent.length > 1 && ` · 30일간 ${c.recent.length}건`}
                  </div>
                  <div style={rowBadges}>
                    {chg != null && (
                      <span style={chg >= 0 ? upTag : downTag}>
                        직전 {formatManwon(c.prevAmount)} 대비 {chg >= 0 ? "+" : ""}
                        {chg.toFixed(1)}%
                      </span>
                    )}
                    {gap != null && (
                      <span style={gap >= 0 ? okTag : noTag}>
                        {gap >= 0 ? `✓ 여유 ${formatManwon(gap)}` : `부족 ${formatManwon(-gap)}`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {data.upcoming?.length > 0 && (
        <section>
          <div style={cardHead}>⏳ 다가오는 일정</div>
          <div style={card}>
            {data.upcoming.map((u, i) => (
              <div key={`${u.aptNm}-${u.kind}-${i}`} style={{ ...row, ...(i > 0 ? rowDivider : null) }}>
                <div style={rowTop}>
                  <span style={rowName}>
                    {u.kind === "lease" ? "🔑" : "📌"} {u.aptNm}
                  </span>
                  <span style={{ ...rowPrice, color: u.dday <= 7 ? C.red : "#b45309" }}>
                    D-{u.dday}
                  </span>
                </div>
                <div style={rowMeta}>{u.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {impact.length > 0 && (
        <section>
          <div style={cardHead}>
            💰 내게 영향 있는 뉴스
            {hasIncome && <span style={headSub}> · 대출 한도에 영향 가능</span>}
          </div>
          <div style={card}>
            {impact.map((it, i) => (
              <a
                key={it.link}
                href={it.link}
                target="_blank"
                rel="noreferrer"
                className="news-row"
                style={{ ...row, textDecoration: "none", color: "inherit", ...(i > 0 ? rowDivider : null) }}
              >
                <div style={rowName}>{it.title}</div>
                <div style={rowMeta}>
                  {it.source} · {classifyNews(it.title)}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const card = {
  background: "#fff", borderRadius: 16, border: `1px solid ${C.border}`,
  boxShadow: CARD_SHADOW, overflow: "hidden",
};
const cardHead = { fontSize: 12, fontWeight: 700, color: C.sub, margin: "2px 2px 6px" };
const headSub = { color: C.muted, fontWeight: 400 };
const row = { display: "block", padding: "11px 15px" };
const rowDivider = { borderTop: `1px solid ${C.divider}` };
const rowTop = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 };
const rowName = { fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.4 };
const rowPrice = {
  fontSize: 13.5, fontWeight: 800, color: C.text,
  whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
};
const rowMeta = { fontSize: 11, color: C.muted, marginTop: 3 };
const rowBadges = { display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" };
const tagBase = { fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap" };
const upTag = { ...tagBase, color: "#b45309", background: "#fef9c3" };
const downTag = { ...tagBase, color: "#1d4ed8", background: C.blueSoft };
const okTag = { ...tagBase, color: "#047857", background: "#dcfce7" };
const noTag = { ...tagBase, color: "#be123c", background: "#ffe4e6" };
const newTag = { marginRight: 4 };
const emptyHint = {
  background: "#fff", borderRadius: 14, border: `1px solid ${C.border}`,
  boxShadow: CARD_SHADOW, padding: "14px 16px",
  fontSize: 12.5, color: C.sub, lineHeight: 1.6,
};
```

- [ ] **Step 3: 뉴스 페이지에 삽입**

`app/news/page.js`에 import를 추가한다:

```js
import Briefing from "../components/Briefing";
```

칩 필터(`chipRow`) **바로 위**, 부제(`subtitle`) 아래에 넣는다. 브리핑은 칩 필터의 영향을 받지 않는 고정 영역이므로 `withCat`(전체)을 넘긴다:

```js
        <Briefing news={withCat} />
```

- [ ] **Step 4: 확인**

Run: `npx next build`
Expected: 성공

dev에서 `/news` 방문:
- 즐겨찾기가 있고 최근 거래가 있으면 ⭐ 카드에 단지가 뜨고 첫 방문엔 🆕
- 새로고침하면 🆕가 사라진다 (markSeen 동작)
- 즐겨찾기가 없으면 안내 한 줄만
- 브리핑 아래 기존 뉴스 목록·칩 필터가 그대로 동작

- [ ] **Step 5: 커밋**

```
feat(news): 오늘의 브리핑 — 관심 단지 변동·일정·영향 뉴스

/news 상단에 3카드를 얹는다. 자금 여유는 지도와 같은 calcMaxLoan으로
계산해 두 화면의 숫자가 어긋나지 않게 한다.

🆕 판정은 briefingSeen.js(localStorage)로 분리 — 지도 배지와 공유한다.
즐겨찾기가 없으면 빈 카드 대신 안내 한 줄만 보여준다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

```bash
git add app/lib/briefingSeen.js app/components/Briefing.js app/news/page.js
git commit -F .git/COMMIT_MSG_TMP.txt
```

---

## Task 8: 지도 📰 배지

**Files:**
- Modify: `app/components/KakaoMap.js` (뉴스 링크)
- Modify: `app/components/mapStyles.js` (`newsBadge`)

**Interfaces:**
- Consumes: `countNew()` from `briefingSeen.js` (Task 7), `GET /api/briefing` (Task 6)
- Produces: 없음

- [ ] **Step 1: 배지 스타일 추가**

Run: `grep -n "newsBadge" app/components/mapStyles.js`
Expected: 결과 없음

```js
export const newsBadge = {
  marginLeft: 4, padding: "0 5px", borderRadius: 999,
  background: C.blue, color: "#fff", fontSize: 10, fontWeight: 700,
};
```

- [ ] **Step 2: 미확인 개수 로드**

`KakaoMap.js`에 import와 state를 추가한다:

```js
import { countNew } from "../lib/briefingSeen";
```

```js
  const [newsNew, setNewsNew] = useState(0); // 브리핑 미확인 단지 수
```

지도 초기 로드를 지연시키지 않도록 **실거래 로드가 끝난 뒤** 비차단으로 호출한다. `loading`이 false로 떨어진 다음 한 번만 돈다:

```js
  // 브리핑 미확인 개수 — 📰 배지용. 캐시 전용 라우트라 가볍고, 실패하면 배지만 생략한다.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    fetch("/api/briefing")
      .then((r) => r.json())
      .then((d) => alive && setNewsNew(countNew(d.complexes)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready]);
```

- [ ] **Step 3: 링크에 배지 렌더**

`KakaoMap.js:802`의 뉴스 링크를 교체한다:

```js
          <a href="/news" style={newsTabLink}>
            📰 뉴스{newsNew > 0 && <span style={newsBadge}>{newsNew}</span>}
          </a>
```

import에 `newsBadge`를 추가한다.

- [ ] **Step 4: 확인**

Run: `npx next build`
Expected: 성공

dev에서: 즐겨찾기 단지에 최근 거래가 있으면 지도 헤더가 `📰 뉴스 ②`. `/news`를 방문한 뒤 지도로 돌아와 새로고침하면 배지가 사라진다.

- [ ] **Step 5: 커밋**

```
feat(map): 뉴스 링크에 브리핑 미확인 개수 배지

지도 마운트 후 /api/briefing을 비차단으로 한 번 호출해 개수만 센다.
캐시 전용 라우트라 가볍고, 실패하면 배지만 생략하고 지도는 정상 동작한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

```bash
git add app/components/KakaoMap.js app/components/mapStyles.js
git commit -F .git/COMMIT_MSG_TMP.txt
```

---

## Task 9: 모바일 셸 — 상단 1줄 바 + 하단 시트 단일 슬롯

**Files:**
- Modify: `app/components/mapStyles.js` (`Z` 상수, 모바일 스타일)
- Create: `app/components/MobileShell.js`
- Modify: `app/components/KakaoMap.js` (모바일 분기)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `mapStyles.js`: `Z = { MAP: 0, TOPBAR: 20, BACKDROP: 30, SHEET: 31, MODAL: 50 }`, `mobileTopBar`, `mobileTopText`, `mobileTopBtn`, `mobileTopBtnDot`, `sheetBackdrop`, `mobileSheet`, `sheetGrip`
  - `MobileShell.js`: `<MobileTopBar {...} />`, `<MobileSheet open onClose>{children}</MobileSheet>` (named exports)

- [ ] **Step 1: `mapStyles.js`에 Z 상수와 모바일 스타일 추가**

Run: `grep -nE "export const Z|mobileTopBar|sheetBackdrop|mobileSheet\b|sheetGrip" app/components/mapStyles.js`
Expected: 결과 없음 (`mobileListSheet`는 있지만 `mobileSheet`와 다른 이름이다 — 혼동 주의)

파일 상단, `controlPanel` 위에 추가한다:

```js
// 레이어 순서 — 모바일에서 패널이 겹치던 원인이 z-index 중복(전부 10)이었다.
// 새 오버레이를 추가할 땐 반드시 여기에 등록할 것.
export const Z = { MAP: 0, TOPBAR: 20, BACKDROP: 30, SHEET: 31, MODAL: 50 };
```

파일 끝에 모바일 스타일을 추가한다:

```js
// ── 모바일 셸 ────────────────────────────────────────────────
// 상단은 높이가 고정된 1줄 바, 나머지는 전부 하단 시트 하나.
// 시트는 한 번에 하나만 열리므로 겹침이 구조적으로 불가능하다.
export const mobileTopBar = {
  position: "absolute", top: 8, left: 8, right: 8, zIndex: Z.TOPBAR,
  ...GLASS, borderRadius: 14, border: GLASS_BORDER, boxShadow: PANEL_SHADOW,
  padding: "8px 10px", display: "flex", alignItems: "center", gap: 8,
};
// ⚠️ 1줄 고정 — status 전문은 길어서 안 들어간다. 짧은 요약만 넣고 잠근다.
export const mobileTopText = {
  flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: C.text,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
export const mobileTopBtn = {
  flex: "0 0 auto", position: "relative", padding: "5px 9px", borderRadius: 9,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.sub, fontSize: 13, cursor: "pointer",
  lineHeight: 1, textDecoration: "none", transition: TRANSITION,
};
// 필터가 걸려 있음을 1줄에서도 알리는 점.
export const mobileTopBtnDot = {
  position: "absolute", top: 2, right: 2, width: 6, height: 6,
  borderRadius: "50%", background: C.blue,
};
export const sheetBackdrop = {
  position: "absolute", inset: 0, zIndex: Z.BACKDROP,
  background: "rgba(15,23,42,0.28)",
};
export const mobileSheet = {
  position: "absolute", left: 0, right: 0, bottom: 0, zIndex: Z.SHEET,
  maxHeight: "70vh", display: "flex", flexDirection: "column", gap: 8,
  ...GLASS, background: "rgba(255,255,255,0.97)", borderRadius: "20px 20px 0 0",
  padding: "10px 14px calc(16px + env(safe-area-inset-bottom))",
  boxShadow: "0 -1px 2px rgba(15,23,42,0.04), 0 -8px 32px rgba(15,23,42,0.16)",
  overflowY: "auto",
};
export const sheetGrip = {
  flex: "0 0 auto", width: 36, height: 4, borderRadius: 999,
  background: C.border, margin: "0 auto 4px",
};
```

기존 `controlPanel`·`detailPanel`·`mobileListSheet`의 `zIndex: 10`/`12`도 `Z.TOPBAR`를 쓰도록 바꾼다(데스크톱은 겹치는 상대가 없어 값만 통일하는 의미).

```js
export const controlPanel = {
  position: "absolute", top: 14, left: 14, zIndex: Z.TOPBAR,
  ...
```

```js
export const detailPanel = {
  position: "absolute", top: 14, right: 14, bottom: 14, zIndex: Z.TOPBAR, width: 320,
  ...
```

- [ ] **Step 2: `MobileShell.js` 작성**

세부패널 본문·리스트 본문은 그대로 두고 **껍데기만** 옮긴다. 변경 범위를 좁히기 위한 의도적 선택이다.

```js
"use client";

// 모바일 셸 — 상단 1줄 바 + 하단 시트.
//
// 왜 분리했나: 상단 컨트롤 패널이 세로로 무한정 자라 하단 시트와 겹쳤다(둘 다 z:10).
// 상단을 고정 높이 1줄로 잠그고 나머지를 시트 하나에 몰아넣으면 겹침이 불가능해진다.
// 시트 슬롯은 KakaoMap의 mobileSheet 상태 하나가 관리한다(동시에 둘 이상 열리지 않음).

import {
  mobileTopBar, mobileTopText, mobileTopBtn, mobileTopBtnDot,
  sheetBackdrop, mobileSheet, sheetGrip, newsTabLink, newsBadge,
} from "./mapStyles";

export function MobileTopBar({ summary, hasFilter, onOpenSettings, newsNew }) {
  return (
    <div style={mobileTopBar}>
      <span style={mobileTopText}>{summary}</span>
      <button
        onClick={onOpenSettings}
        style={mobileTopBtn}
        aria-label="지역·필터·자금 설정"
      >
        ⚙️
        {hasFilter && <span style={mobileTopBtnDot} />}
      </button>
      <a href="/news" style={{ ...newsTabLink, ...mobileTopBtn }} aria-label="뉴스">
        📰
        {newsNew > 0 && <span style={newsBadge}>{newsNew}</span>}
      </a>
    </div>
  );
}

export function MobileSheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <>
      <div style={sheetBackdrop} onClick={onClose} />
      <div style={mobileSheet}>
        <div style={sheetGrip} />
        {children}
      </div>
    </>
  );
}
```

- [ ] **Step 3: `KakaoMap.js`에 시트 슬롯 상태 도입**

기존 `showFavs`/`showProfile`/`showList`는 데스크톱에서 계속 쓰이므로 **남겨두고**, 모바일 전용으로 단일 슬롯을 추가한다.

```js
  const [sheet, setSheet] = useState(null); // 모바일 시트 슬롯: null|"settings"|"list"|"detail"
```

단지를 고르면 자동으로 detail 시트가 열리게 한다:

```js
  // 모바일: 단지가 선택되면 세부 시트로 전환한다. 시트는 한 번에 하나만 열리므로
  // 목록·설정 시트는 자동으로 닫힌다 = 겹침 없음.
  useEffect(() => {
    if (!isMobile) return;
    setSheet(selected ? "detail" : (s) => (s === "detail" ? null : s));
  }, [selected, isMobile]);
```

⚠️ 위 `setSheet` 호출은 값과 함수를 섞어 쓰면 헷갈린다. 아래처럼 명시적으로 쓴다:

```js
  useEffect(() => {
    if (!isMobile) return;
    if (selected) setSheet("detail");
    else setSheet((s) => (s === "detail" ? null : s));
  }, [selected, isMobile]);
```

- [ ] **Step 4: 모바일 렌더 분기**

`return (...)` 안에서 컨트롤 패널·목록 시트·세부 패널을 모바일/데스크톱으로 가른다.

먼저 짧은 요약 문자열과 필터 여부를 만든다 (`controlPanelStyle` 근처):

```js
  // ⚠️ status 전문(필터 태그·구매가능 수 포함)은 1줄 바에 안 들어간다 → 짧은 버전.
  const shortSummary = tradesData
    ? `${regionLabel} · ${listRows ? listRows.length : 0}곳`
    : regionLabel;
  const hasFilter = area !== "all" || price !== "all" || monthly !== "all";
```

컨트롤 패널 스타일에서 모바일 분기를 제거한다 — 모바일은 이제 시트 안에 들어가므로 위치 지정이 필요 없다:

```js
  const controlPanelStyle = isMobile
    ? { ...controlPanel, position: "static", width: "auto", padding: 0,
        background: "none", boxShadow: "none", border: "none", borderRadius: 0 }
    : { ...controlPanel, bottom: 14, width: 340, overflow: "hidden" };
```

세부패널도 마찬가지로 모바일에선 시트 내부 콘텐츠가 된다:

```js
  const detailPanelStyle = isMobile
    ? { ...detailPanel, position: "static", width: "auto", padding: 0,
        background: "none", boxShadow: "none", border: "none", overflowY: "visible" }
    : detailPanel;
```

렌더 부분:

```js
      {isMobile ? (
        <>
          <MobileTopBar
            summary={shortSummary}
            hasFilter={hasFilter}
            onOpenSettings={() => setSheet("settings")}
            newsNew={newsNew}
          />
          <MobileSheet open={sheet != null} onClose={() => {
            setSheet(null);
            if (sheet === "detail") setSelected(null);
          }}>
            {sheet === "settings" && (
              <>
                {controlPanelContent}
                <button onClick={() => { setSheet("list"); }} style={pillBtn}>
                  📋 단지 목록 보기
                </button>
              </>
            )}
            {sheet === "list" && listContent}
            {sheet === "detail" && selected && detail && detailContent}
          </MobileSheet>
        </>
      ) : (
        <>
          <div style={controlPanelStyle}>
            {controlPanelContent}
            {listContent}
          </div>
          {selected && detail && (
            <div style={detailPanelStyle}>{detailContent}</div>
          )}
        </>
      )}
```

이를 위해 기존 JSX를 두 변수로 추출한다. `listContent`가 이미 같은 방식으로 빠져 있으므로 패턴이 동일하다:

- `controlPanelContent` — 현재 `<div style={controlPanelStyle}>` **안쪽** 전체(제목~드로어). 단, 모바일 전용 `📋 목록` 버튼과 `{!isMobile && listContent}`는 제외한다.
- `detailContent` — 현재 `<div style={detailPanelStyle}>` **안쪽** 전체.

⚠️ `closeBtn`(×)은 `position:absolute`라 시트 안에서 좌표가 어긋난다. 모바일 시트에서는 백드롭 탭과 그립으로 닫으므로, `detailContent`의 × 버튼은 `!isMobile`일 때만 렌더한다.

- [ ] **Step 5: 사용하지 않게 된 코드 제거**

- 모바일 `📋 목록` 버튼 (`KakaoMap.js:846-853`) — 이제 설정 시트 안의 버튼이 대신한다
- `showList` state와 `mobileListSheet` 렌더 블록 (`KakaoMap.js:1040-1048`)
- `selectComplex`의 `if (isMobile) setShowList(false);` → 시트 전환은 Step 3의 effect가 처리하므로 제거
- `mapStyles.js`의 `mobileListSheet` export — 참조가 사라지면 삭제

Run: `grep -n "showList\|mobileListSheet" app/components/KakaoMap.js app/components/mapStyles.js`
Expected: 결과 없음

- [ ] **Step 6: 빌드 확인**

Run: `npx next build`
Expected: 성공

- [ ] **Step 7: 커밋**

```
refactor(map): 모바일을 상단 1줄 바 + 하단 시트 단일 슬롯으로 재구성

상단 컨트롤 패널이 세로로 무한정 자라 하단 세부 시트와 겹쳤다(둘 다 z:10).
상단을 고정 높이 1줄로 잠그고 지역·필터·자금·목록·세부를 전부 시트 하나에
몰아넣는다. 시트 슬롯이 단일 상태라 동시에 둘 이상 열릴 수 없다 = 겹침 불가.

z-index를 mapStyles.Z 상수로 통일. 새 오버레이는 여기 등록할 것.
데스크톱 레이아웃은 변경 없음.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

```bash
git add app/components/KakaoMap.js app/components/mapStyles.js app/components/MobileShell.js
git commit -F .git/COMMIT_MSG_TMP.txt
```

---

## Task 10: 모바일 레이아웃 실측 검증

**Files:**
- Create: `scripts/tmp-mobile-check.mjs` (검증 후 삭제 — 커밋 금지)

**Interfaces:**
- Consumes: Task 9의 모바일 셸
- Produces: 없음 (검증 전용)

- [ ] **Step 1: Playwright 설치**

```bash
npm i --no-save playwright
```

설치된 크롬을 쓰므로 브라우저 다운로드는 없다(이 머신 검증됨).

- [ ] **Step 2: 검증 스크립트 작성**

⚠️ bash heredoc은 백슬래시를 잃으므로 **Write 도구로 파일을 만들고 절대경로로 실행**한다.

`scripts/tmp-mobile-check.mjs`:

```js
import { chromium } from "playwright";

const BASE = "http://localhost:3000";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

// 자금 색칠·월상환 필터를 켜려면 프로필이 필요하다.
await page.addInitScript(() => {
  localStorage.setItem(
    "re_loan_profile",
    JSON.stringify({
      assets: "50000", income: "7000", existingDebt: "0",
      householdType: "무주택", isFirstTime: false,
      rate: "4", termYears: "40", monthlySaving: "200",
    })
  );
  localStorage.setItem("re_cost_notice_seen", "1"); // 배너가 측정을 방해하지 않게
});

await page.goto(BASE);
// dev 첫 방문은 온디맨드 컴파일로 느리다 → 45s
await page.waitForSelector(".trade-pin", { timeout: 45000 });

const rect = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height };
  }, sel);

const report = [];

// 1) 상단 바가 1줄인지 — 60px를 넘으면 줄바꿈된 것
const bar = await rect('[aria-label="지역·필터·자금 설정"]');
const barBox = await page.evaluate(() => {
  const b = document.querySelector('[aria-label="지역·필터·자금 설정"]')?.parentElement;
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, height: r.height };
});
report.push(["상단 바 높이", barBox?.height]);

// 2) 단지 핀을 눌러 세부 시트를 열고, 상단 바와 겹치는지 실측
await page.evaluate(() => {
  // 겹침 인터셉트가 잦으므로 실제로 클릭 가능한 핀을 히트테스트로 고른다
  const pins = [...document.querySelectorAll(".trade-pin")];
  for (const p of pins) {
    const r = p.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (p.contains(hit)) {
      p.click();
      return;
    }
  }
});
await page.waitForTimeout(600);

const sheet = await page.evaluate(() => {
  // 하단 시트 = bottom이 뷰포트 하단에 붙은 오버레이
  const els = [...document.querySelectorAll("div")].filter((e) => {
    const s = getComputedStyle(e);
    return s.position === "absolute" && s.zIndex === "31";
  });
  if (!els.length) return null;
  const r = els[0].getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, height: r.height };
});
report.push(["시트 top", sheet?.top]);
report.push(["시트 height", sheet?.height]);

const overlap = barBox && sheet ? barBox.bottom - sheet.top : null;
report.push(["겹침(px, 양수면 겹침)", overlap]);

await page.screenshot({ path: "mobile-detail.png" });

// 3) 설정 시트를 열었을 때도 겹치지 않는지
await page.keyboard.press("Escape").catch(() => {});
await page.evaluate(() => {
  document.querySelector('[aria-label="지역·필터·자금 설정"]')?.click();
});
await page.waitForTimeout(500);
const settings = await page.evaluate(() => {
  const els = [...document.querySelectorAll("div")].filter(
    (e) => getComputedStyle(e).zIndex === "31"
  );
  if (!els.length) return null;
  const r = els[0].getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, height: r.height };
});
report.push(["설정시트 top", settings?.top]);
report.push(["설정시트 겹침", barBox && settings ? barBox.bottom - settings.top : null]);
await page.screenshot({ path: "mobile-settings.png" });

console.log(report.map(([k, v]) => `${k}: ${v}`).join("\n"));
await browser.close();
```

- [ ] **Step 3: 실행 + 판정**

dev 서버를 띄운 뒤:

```bash
node scripts/tmp-mobile-check.mjs
```

Expected:
- `상단 바 높이` ≤ 60 (1줄 유지)
- `겹침(px, 양수면 겹침)` ≤ 0 — **이게 이번 작업의 합격 기준이다**
- `설정시트 겹침` ≤ 0
- `시트 height` ≤ 844 × 0.70 = 591

값이 양수면 겹침이 남은 것이다. 스크린샷(`mobile-detail.png`)을 눈으로 보기 **전에** 이 수치부터 본다 — 시군구 304px 사고를 즉시 특정한 방법이 실측이었다.

- [ ] **Step 4: 스크린샷 확인**

`mobile-detail.png`·`mobile-settings.png`를 Read 도구로 열어 확인한다:
- 지도가 화면 중앙에 충분히 보인다
- 시트 안에서 평형 카드·부대비용 내역이 정상 렌더된다
- 상단 바 텍스트가 잘리되 줄바꿈되지 않는다

- [ ] **Step 5: 정리**

임시 스크립트와 스크린샷은 커밋하지 않는다.

```bash
rm -f scripts/tmp-mobile-check.mjs mobile-detail.png mobile-settings.png
git status -s
```

Expected: 임시 파일이 목록에 없다.

- [ ] **Step 6: 데스크톱 회귀 확인**

모바일 리팩토링이 데스크톱을 깨지 않았는지 본다. dev에서 브라우저 폭을 1200px로 두고:
- 좌측 패널에 컨트롤 + 단지 리스트가 전체 높이로 나온다
- 시군구 select가 정상 높이다 (세로 flex `flex:1` 사고 재발 확인)
- 단지 클릭 → 우측 세부패널이 뜨고 × 버튼이 동작한다

---

## Task 11: 문서 갱신

**Files:**
- Modify: `CLAUDE.md`
- Modify: `PROGRESS.md`

**Interfaces:**
- Consumes: Task 1~10의 결과
- Produces: 없음

- [ ] **Step 1: `CLAUDE.md` 갱신**

아래를 반영한다. **한글 파일이므로 Read 도구로 열어 확인하고 Edit로 수정한다** (PowerShell `Get-Content`는 인코딩이 깨진다).

- 기술 스택/개발 메모에 테스트 항목 추가:
  `변경 검증: npx next build (컴파일) + npm test (순수 lib, node:test — 의존성 0). ⚠️ node --test tests/ 디렉터리 형태는 MODULE_NOT_FOUND로 실패 → 글로브를 따옴표로: node --test "tests/*.test.mjs"`
- 코드 위치에 `acquisitionCost.js`(부대비용, 클라 공용)·`briefingSeen.js`(localStorage 🆕 판정) 추가
- API 목록에 `/api/briefing`(즐겨찾기 단지 최근 거래 + 일정, **캐시 전용** — `fetchRawMonths(.., {cacheOnly:true})`) 추가
- `KakaoMap.js` 레이아웃 항목에 모바일 재구성 반영:
  `모바일은 상단 1줄 바(MobileShell.MobileTopBar) + 하단 시트 단일 슬롯(sheet 상태 null|settings|list|detail) — 동시에 둘 이상 열리지 않아 겹침 불가. z-index는 mapStyles의 Z 상수로 통일, 새 오버레이는 반드시 등록할 것.`
- 마커 함정 항목의 deps 목록에 `monthly` 추가
- `requiredCash`가 부대비용을 포함하는 단일 소스임을 명시:
  `자금 관련 새 입력은 assets 정의 한 곳 + calcMaxLoan의 requiredCash 한 곳에만 반영할 것`

- [ ] **Step 2: `PROGRESS.md`에 기록 추가**

파일 맨 위에 이번 작업 항목을 추가한다(기존 최신 항목 위).

```markdown
## ✅ 브리핑 · 자금 정확도 · 모바일 재구성 완료 (2026-07-25)
- **자금 정확도**: `lib/acquisitionCost.js` 신설 — 취득세(지방세법 §11①8)·지방교육세·
  농특세(85㎡ 초과)·중개보수(공인중개사법 시행규칙 별표1)·등기비 근사.
  `calcMaxLoan`의 `requiredCash`에 합산 → 마커 색칠·리스트 배지·평형 카드에 자동 전파.
- **월 상환액**: `neededLoan`(실제로 빌릴 금액) 기준. 자기자금이 많으면 한도까지 빌릴
  이유가 없어 한도 기준 월납은 실제와 다르다. `gap ≥ 0 ⟺ maxLoan ≥ neededLoan` 테스트로 고정.
- **지도 축**: 월 상환액 상한 필터(자금 설정 시만 노출) + "얼마 더 모으면 되나".
- **브리핑**: `/news` 상단 3카드(관심 단지 변동·다가오는 일정·영향 뉴스).
  `/api/briefing`은 cron이 채워둔 캐시만 읽어 **외부 API 호출 0**.
- **모바일**: 상단 1줄 바 + 하단 시트 단일 슬롯으로 재구성 — 겹침 구조적 차단.
  Playwright 실측으로 겹침 0px 확인.
- **테스트 도입**: `node:test`(의존성 0). `npm test` = `node --test "tests/*.test.mjs"`.
- 설계: `docs/superpowers/specs/2026-07-25-briefing-affordability-mobile-design.md`
```

- [ ] **Step 3: 최종 검증**

```bash
npm test && npx next build
```

Expected: 둘 다 성공

- [ ] **Step 4: 커밋**

```
docs: 브리핑·자금 정확도·모바일 재구성 반영

CLAUDE.md에 npm test 실행법(글로브 필수), acquisitionCost/briefingSeen 위치,
/api/briefing 캐시 전용 성격, 모바일 시트 단일 슬롯 구조, Z 상수 규칙,
renderMarkers deps에 monthly 추가를 기록.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

```bash
git add CLAUDE.md PROGRESS.md
git commit -F .git/COMMIT_MSG_TMP.txt
```

- [ ] **Step 5: 배포 확인**

`main`에 push하면 Vercel이 자동 재배포한다.

```bash
git push origin main
```

⚠️ **서버 코드만 바뀐 배포는 청크 해시가 변하지 않는다.** 이번엔 클라 번들도 바뀌므로 해시 폴링이 유효하지만, 확실한 확인은 커밋 상태다:

```bash
gh api repos/1226cjw-afk/Budongsan/commits/<sha>/status --jq '.statuses[] | "\(.context): \(.state) \(.description)"'
```

Expected: Vercel context가 `success` / "Deployment has completed"

배포 후 실기기에서 확인할 것:
- 폰에서 상단 바와 세부 시트가 겹치지 않는다
- `/news`에 브리핑이 뜬다
- 평형 카드에 월납·부대비용이 나온다

---

## Self-Review

**1. Spec coverage**

| 스펙 항목 | 태스크 |
|---|---|
| A-1 부대비용 → requiredCash | 1, 2 |
| A-2 월 상환액 (neededLoan 기준) | 2 |
| A-3 UI 반영 + 안내 배너 + HelpModal | 3 |
| C-1 월 상환액 필터 (같은 평형 동시 성립) | 4 |
| C-2 "얼마 더 모으면 되나" | 5 |
| B-1 `/api/briefing` + `cacheOnly` | 6 |
| B-2 브리핑 3카드 + 🆕 판정 | 7 |
| B-3 지도 📰 배지 | 8 |
| D 모바일 셸 + Z 상수 + `MobileShell.js` 분리 | 9 |
| 검증 (build/test/Playwright 실측) | 각 태스크 + 10 |
| 문서 | 11 |

스펙 §5 에러 처리 표는 각 태스크 안에 흩어져 반영됐다 — 즐겨찾기 0개(Task 7 Step 2), 프로필 미설정(Task 4 Step 5, Task 7), 0004 미적용(Task 6 Step 2), briefing 실패(Task 7 Step 2, Task 8 Step 2), 캐시 미스(Task 6 Step 2), 다주택 3주택 이상 주석(Task 1 Step 4, Task 3 Step 3).

**2. Placeholder scan** — "TBD"/"적절히 처리"/"Task N과 유사" 없음. 모든 코드 스텝에 실제 코드가 들어 있다.

**3. Type consistency**

- `calcAcquisitionCost` 반환 필드(`acquisitionTax`/`localEduTax`/`ruralTax`/`brokerFee`/`registryEtc`/`total`/`taxRate`)가 Task 1 정의 → Task 2 테스트 → Task 3 UI에서 동일하게 쓰인다.
- `bestGap`(Task 3) → `bestFit`(Task 4)로 이름이 바뀐다. Task 4가 `renderMarkers`·`listRows` 두 호출부를 모두 갱신하도록 명시돼 있다.
- `loanForPrice(price, m2)` 2인자 시그니처가 Task 3에서 도입되고 Task 4의 `bestFit`에서 그대로 쓰인다.
- `complexKey`/`isNew`/`countNew`/`markSeen`이 Task 7에서 정의되고 Task 7(Briefing)·Task 8(지도 배지)에서 소비된다.
- `Z` 상수가 Task 9에서 정의되고 같은 태스크의 `mobileTopBar`/`sheetBackdrop`/`mobileSheet`가 참조한다.
- `newsBadge`가 Task 8에서 정의되고 Task 9의 `MobileShell.js`가 import한다 → **Task 8이 9보다 먼저 실행돼야 한다.** 현재 순서가 맞다.
