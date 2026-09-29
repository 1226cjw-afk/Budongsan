# 🧭 화면 이동 재구성 + 🔥 핫플 단지 — 설계

**작성일** 2026-09-29 · **상태** 승인 대기

## 목적

사용자 요청(2026-09-29): "지도·단지 리스트·세부 내역 간 이동과 뉴스탭 이동이 너무 부자연스럽고
화면 배치가 자연스럽지 않다" + "뉴스탭에서 오늘의/이번주의 핫플 아파트를 알려주면 좋겠다".

사용자 답변으로 정해진 전제:
- **주 사용 기기 = 폰.** 내비게이션은 모바일 흐름을 기준으로 설계하고 데스크톱은 같은 구조를 옮긴다.
- **핫플 기준 = 거래 · 가격 · 뉴스 · 종합 전부.** 칩으로 기준을 바꿔 본다.
- **핫플 범위 = 서울+경기 전역** (`regions.js` 약 72개 구).
- **구조 = 하단 탭 + 지도 유지(A안)** — 페이지 분리(B)·URL 없는 상태 탭(C)은 기각.

이 설계는 새 디자인 언어를 만들지 않는다. 팔레트·카드 스타일(`lib/palette.js`,
`briefing/styles.js`, `mapStyles.js`)은 그대로 쓰고 **배치와 이동 경로**만 바꾼다.

## 실측 (2026-09-29, prod + Supabase)

### 1. 화면 문제 (Playwright, prod, 1440×900 · 390×844)

| # | 증상 | 원인 |
|---|---|---|
| 1 | 📰 뉴스 ↔ 지도 이동이 매번 전체 새로고침 | `MobileTopBar`·`ControlPanel`이 `<a href="/news">`, 뉴스는 `<a href="/">` — 지도 SDK·실거래 데이터를 버리고 다시 받는다 |
| 2 | 모바일 목록 → 상세 → 닫기 = 빈 지도 | `sheet` 단일 슬롯이라 detail이 list를 **대체**한다. 복귀 경로 없음 |
| 3 | 모바일 목록 여는 데 2탭 | 상단 바엔 목록 버튼이 없다(⚙️ → "📋 단지 목록 보기") |
| 4 | 단지를 골라도 지도가 그 단지로 안 간다 | 상세 시트 위로 엉뚱한 지역(마포)이 보였다(구로구 딥링크 상태) |
| 5 | /news 첫 화면이 📊 시장 신호로 가득 | ★ 지역 4곳 × 타일 4장 ≈ 모바일 1,600px. 페이지 전체 29,383px, 칩·뉴스는 한참 아래 |

### 2. 계약일 기준 "이번 주"는 성립하지 않는다

★ 지역 5곳의 계약일별 건수(9월): 9/1~9/12는 하루 13~24건, **9/22~9/28은 7일 합계 10건**.
실거래 신고 기한이 계약 후 30일이라 최근 계약은 아직 데이터에 없다(`marketSignal`의
`REPORT_LAG_DAYS`와 같은 현상). → **"오늘/이번 주" = 신고(= 우리 데이터에 처음 나타난) 날 기준**.

### 3. 일괄매입이 순위를 오염시킬 수 있다

9/18 `송파해링턴타워` 한 단지에 **170건**(직거래 · `buyerGbn=공공기관`, 매입임대 일괄매입).
`excludeAbnormal()`이 직거래를 이미 제외하므로 이 경로를 그대로 타면 막힌다.
부수 발견: `buyerGbn`이 **이제 실제로 채워져 온다**(CLAUDE.md엔 "국토부가 주지 않음"으로 기록 — 별건 갱신 필요).

### 4. 캐시 신선도는 ★ 지역만

`trade_raw_cache` 50개 지역 중 매일 갱신되는 건 ★ 지역(4개 구)뿐, 나머지는 수 주~수 개월 전
(마포 8/19, 노원 7/28 …). 전역 핫플은 **cron 전역 수집이 전제**다.

## 설계

### 1부 — 이동 구조 (폰 우선)

**셸: 지도가 한 번만 뜨고 살아 있다**
- `app/(main)/layout.js`가 `AppShell`(= `KakaoMap` + 탭 패널 + 탭바)을 소유한다. 페이지 셋은
  **URL만 제공하고 전부 `null`을 렌더**한다 — 화면은 셸이 `usePathname()`으로 골라 그린다:
  - `/` → 🗺 지도 탭
  - `/news` → 🔥 오늘 탭(브리핑 + 핫플) — **기존 `/news` 북마크 유지**
  - `/news/list` → 📰 뉴스 탭(기사 목록)
- 오늘·뉴스 화면은 **한 번 열리면 셸이 계속 마운트해 둔다**(숨김만). 페이지 컴포넌트로 두면 탭을
  떠날 때마다 언마운트돼 돌아올 때 `/api/briefing`을 다시 부르고 스크롤이 맨 위로 튄다.
  숨김은 `visibility`로(`display:none`은 스크롤 위치를 잃는다).
- `/api/news`는 셸이 **한 번만** 받아 두 탭이 공유한다(오늘 탭의 📢 뉴스 칩 + 뉴스 탭 목록).
- App Router는 형제 라우트 사이 이동에서 레이아웃을 리마운트하지 않는다 → 탭 전환에도
  지도 SDK·`tradesData`·`selected`·마커 DOM이 그대로다. 이동은 전부 `next/link`/`router.push`.
- 오늘·뉴스 탭은 지도 위 **전체 화면 패널**(모바일) / **좌측 440px 패널**(데스크톱).
  ⚠️ 지도 컨테이너에 `display:none` 금지 — 카카오 지도가 0×0으로 크기를 잡는다.
  모바일은 패널이 덮기만 하고, 지도 탭 복귀 시 `map.relayout()`.
- 활성 탭은 `usePathname()`으로 판정(별도 상태 없음 → URL이 단일 진실).

**하단 탭바(모바일)**: `🗺 지도 · 🔥 오늘 · 📰 뉴스`. 고정 높이 + `env(safe-area-inset-bottom)`.
`mapStyles.Z`에 `TABBAR` 등록. 🔥 오늘에 기존 `newsNew` 배지를 옮긴다.
데스크톱은 탭바 대신 좌측 패널 머리의 `[지도 | 오늘 | 뉴스]` 세그먼트.

**지도 탭 — 시트 스택(모바일)**
- 상태: `sheet` 단일 문자열 → `{ list: "peek"|"half"|"full", detail: boolean, settings: boolean }`.
  - `settings`가 열리면 `list`·`detail`은 렌더하지 않는다 → "동시에 둘 이상 안 겹침" 성질 유지.
- **목록 시트는 늘 바닥에 떠 있다.** `peek` = 그립 + "구로구 158곳 ▲" 한 줄. 탭/드래그로
  `half`(≈50vh) → `full`(≈88vh). 백드롭 없음(지도가 보이고 조작 가능해야 함).
- **상세는 같은 시트 위에 쌓인다.** 머리 = `← 목록` · 단지명 · `✕`. `← 목록`/뒤로가기 →
  `detail=false`(목록으로 복귀, 스크롤 위치 보존). `✕` → 상세 닫고 목록 `peek`.
- **뒤로가기 제스처**: 상세 열 때 `history.pushState({detail:1}, "")`, `popstate`에서 상세 닫기.
  설정 시트도 같은 방식. (Next 16 App Router는 `window.history.pushState` 통합을 지원)
- **선택 단지를 보이는 영역 중앙으로**: 기존 `selectComplex`의 `moveMap(() => panTo(…))`를 유지하되,
  모바일이면 목표점을 `map.getProjection()`으로 **핀보다 `innerHeight/4`px 아래** 좌표로 바꿔 panTo한다
  (= 핀이 상단 바와 half 시트 사이 빈 영역의 가운데에 온다). `selectComplex`는 이미 `fitRef=false`를
  먼저 걸어 `panTo`+`fitRef` 경합 금지 규칙을 지킨다.
- ⚙️ 설정 시트(지역·필터·자금·★ 서랍)는 지금처럼 백드롭 있는 모달 시트. 안의 "📋 단지 목록 보기"
  버튼은 제거(목록이 늘 떠 있으므로). 상단 바의 📰는 제거(탭바로 이동).
- 📍 현위치 버튼은 목록 `peek` 위에 붙는다(시트 높이 추종). `half`/`full`/설정일 땐 숨김.

**데스크톱 지도 탭**: 현행 유지(좌 컨트롤+리스트 / 우 상세). 단지 선택 시 이미 `panTo`로 중앙 이동한다 —
좌(14+340)·우(14+320) 패널 폭이 거의 같아 빈 지도 영역의 중심 ≈ 화면 중심이므로 보정하지 않는다.

**단지로 보내기 — `focusComplex`**
- 레이아웃이 Context로 `focusComplex({ lawdCd, aptNm })`를 제공한다. 오늘 탭의 핫플·관심 단지·
  새 거래 피드 행이 이걸 부른다.
- 동작: 다른 지역이면 기존 **`selectRegion` 경로**로 전환(stale 가드·idle 억제·`regionToast` 끔을
  그대로 탄다) → 데이터 도착 후 `matchesComplexName`으로 행을 찾아 **정확히 1곳이면 자동 선택**,
  여러 곳이면 `nameQuery`에 넣어 목록을 `half`로 연다. 1곳 자동 선택은 딥링크가 이미 쓰는
  `pendingPickRef` 경로를 **그대로 재사용**한다(새 로직 없음). 같은 지역이면 데이터 재로드가 없어
  `listRows`가 안 바뀔 수 있으므로 `dataRef`에서 바로 찾아 선택한다.
- 모바일: `router.push("/")`로 지도 탭 전환 + 위 동작. 데스크톱: 탭은 그대로 두고 지도·우측 상세만.
- 콜드 로드용 `/?lawdCd=&q=` 딥링크 경로는 **그대로 둔다**(부트스트랩 effect). ⚠️ 레이아웃이
  유지되므로 `location.search`는 마운트 때 한 번만 읽힌다 — 앱 안 이동은 반드시 `focusComplex`로.

### 2부 — 오늘·뉴스 탭 배치

**🔥 오늘 탭 (위 → 아래)**
1. **🔥 핫플 단지**(신규, 3부) — `오늘 | 이번 주` 세그먼트 + `종합 · 거래 · 가격 · 뉴스` 칩.
   상위 5행, "더보기"로 10행. 행 = 순위 · 단지명 · 지역 · 이유 배지 1~2개 · 자금 판정 배지.
2. **⭐ 관심 단지 + ⏳ 일정** — 기존 카드 그대로(비면 미렌더).
3. **🆕 새 거래 피드** — 그대로. 행 클릭 → `focusComplex`(신규 연결).
4. **📊 시장 신호 — 요약 행으로 압축.** 지역당 한 줄
   `안양 동안구  거래 309 ▼109 · 해제 5 · 직거래 3.1%`, 탭하면 기존 4칸 타일 펼침(한 번에 하나).
5. **🏗 청약 레이더** — 그대로.

- **📢 요주의 단지 카드 제거** → 핫플 `뉴스` 칩이 `buildNewsWatch` 결과를 보여준다.
  ⚠️ "★가 0개여도 반드시 렌더" 규칙은 **핫플 카드가 상속**한다(빈 상태 분기에서도 렌더).
- **💰 영향 뉴스는 뉴스 탭으로 이동.**
- ⚠️ fetch는 계속 `Briefing.js`에서 시작(카드 안 fetch 금지 규칙). `/api/hot`도 여기서
  `/api/briefing`·`/api/subscription`과 **동시 출발**.
- 로딩 스켈레톤은 첫 카드(핫플) 높이에 맞춘다.

**📰 뉴스 탭**
- 머리(제목 + 칩 줄) `position: sticky`.
- 칩 아래 **💰 내 자금에 영향** 최대 3줄 고정 → 그 아래 날짜별 목록(필독·주목 컬러바 유지).
- "🔄 지금 수집"은 머리 우측 아이콘 버튼으로 축소.

**공통**: 각 탭 머리 높이 56px(모바일 상단 바와 동일) — 탭 전환 시 상단 기준선 고정.

### 3부 — 핫플 데이터

**3-1. 신고 기록 `trade_reports` (마이그레이션 0010)**

```sql
create table trade_reports (
  lawd_cd text not null,
  trade_key text not null,          -- umdNm|aptNm|dealYmd|area|floor|amount[#n]
  reported_on date not null,        -- KST 달력 날짜(format.kstDate)
  deal_ymd date not null,           -- 계약일
  umd_nm text, apt_nm text,
  area numeric, amount integer, floor text,
  dealing_gbn text, cdeal_type text,
  ref_median integer,               -- 가격 비교 기준(아래 3-3). 기록 시점에 계산
  ref_n smallint,
  primary key (lawd_cd, trade_key)
);
create index on trade_reports (reported_on);
```

- **기록 지점은 `trades.fetchRawMonths` 한 곳** — 캐시가 있던 달을 재수집해 upsert하는 바로 그 자리에서
  옛 payload와 새 payload를 비교, 새로 나타난 거래만 `insert … on conflict do nothing`.
  cron이든 사용자 방문이든 같은 경로라 기준이 하나다(`excludeAbnormal` 단일 지점과 같은 방침).
- 비교는 순수 함수 `lib/tradeReports.js`의 `diffNewTrades(oldTrades, newTrades)`:
  키 멀티셋 비교(같은 키 k개 → `#1..#k`), 새 쪽에만 있는 것 반환.
- ⚠️ **기준선 보호** — 아래면 기록하지 않는다(다음 날부터 정상 누적):
  - 이전 캐시가 없는 달(첫 수집) — 수백 건이 "오늘 신고"로 쏟아진다
  - 이전 `fetched_at`이 **48시간 초과** — 방치된 지역(마포 8/19)의 몇 주치가 하루로 몰린다
- 해제·직거래는 **원본 그대로 저장**하고 읽을 때 거른다(캐시와 같은 원칙).
- 기록 실패는 삼킨다 — 핫플 기록이 실거래 조회를 죽이면 안 된다.
- 프루닝: cron에서 `reported_on < kstDate() − 30일` 삭제(소량·조건부라 대량 delete 차단 대상 아님
  — 차단되면 조회를 `reported_on >= cutoff`로 거르고 있으므로 무해).

**3-2. 전역 수집 (`/api/cron/refresh`)**
- 순서: ★ 지역 재수집 → **전역 수집(신규)** → 브리핑 워밍 → 추세 워밍(양보 가능, 맨 뒤 유지).
- 대상: `regions.js` 전 지역(≈72) − 이미 방금 갱신한 ★ 지역, × 이번 달·지난달 `{ refresh: true }`.
  지역 12곳씩 청크(= 국토부 동시 24호출), 캐시가 **가장 오래된 지역부터**, **데드라인 25s**. 미완주 지역은 응답 `hotCollect.skipped`에 이름을 남긴다.
- 새 cron 없음(Hobby 2개 한도).
- ⚠️ 첫 며칠은 전역 첫 수집(= 기준선)이 무거워 추세 워밍이 데드라인에 밀릴 수 있다 — 원래
  이어받기로 설계된 작업이라 허용.

**3-3. `/api/hot`** (한 번 호출로 `today`·`week` 둘 다 반환 — 세그먼트 전환에 재요청 없음)
- `trade_reports`에서 `reported_on >= kstDate()−6일`을 읽고(페이지네이션 — PostgREST 기본 1,000행 컷),
  해제(`cdeal_type='O'`)·직거래 제외 후 단지(`lawd_cd|umd_nm|apt_nm`)별 `reports` 집계. `today`는
  같은 행에서 `reported_on = kstDate()`만.
- **가격 기준은 기록 시점에 계산해 `ref_median`에 저장한다**: 같은 수집 창(보통 이번 달+지난달)에서
  **같은 단지·같은 평형**(`toPyeong` 동일)·계약일이 더 이른 정상 거래의 **중앙값**. 비교 거래가 없으면 null.
  읽을 때는 `pct = (amount − ref_median) / ref_median`만 계산한다 → `/api/hot`이 캐시를 읽지 않는다
  (요청마다 수십 개 지역 캐시를 읽으면 수 MB).
  단지 대표값 = 최대 `pct`와 그 평형·금액.
  '신고가'는 표시하지 않는다(지역마다 캐시 깊이 2~39개월로 달라 "최고가"가 거짓말이 된다).
- 응답: 창별 상위 60단지(`reports` 순) ∪ 가격 후보(`reports ≥ 2`·`pct > 0`) 상위 20, `asOf` 포함.
- 순수 계산은 `lib/hotRank.js`(`summarizeReports`)·`lib/tradeReports.js`(`refMedianFor`)로 빼서 테스트한다.

**3-4. 점수 (클라이언트, `lib/hotRank.js`의 `rankHot`)**
- 뉴스: 클라이언트가 이미 가진 `buildNewsWatch(news)` — 추가 요청 없음.
- 뉴스↔실거래 매칭은 `matchesComplexName`, **같은 지역(추정 지역 = `lawd_cd` 지역명)일 때만**.
  미매칭 뉴스 단지는 `뉴스` 칩에만 나온다(`구로주공`↔`주공1` 어긋남 전례).
- 칩별 순위:
  - `거래` = `reports` 내림차순
  - `가격` = `pct` 내림차순, **`reports ≥ 2`만**(1건 튀는 값 방지)
  - `뉴스` = newsWatch 점수 순(기존 규칙·임계값 그대로)
  - `종합` = `reports` + 가격 가점(`pct ≥ 5` +2, `≥ 10` +3) + 뉴스 가점(매칭 시 +2)
- ⚠️ **가점·임계값은 임시값이다.** 이 프로젝트의 임계값은 실측으로 정해 왔으나 `trade_reports`는
  배포일부터 쌓인다. **7일치가 쌓이면 분포를 재서 확정**(PROGRESS 백로그에 등록).
- 자금 판정 배지: 대표 평형 금액으로 `loanCalcFor` — 지도·피드·청약과 같은 계산.

**3-5. 한계 표시**
- 카드 하단 고정 문구: "12억 미만 거래 · 신고일 기준 · 해제·직거래 제외".
- `오늘`이 비면: "새 신고는 매일 아침 쌓여요" + `뉴스` 칩을 기본 선택.

## 바뀌는 파일

| 파일 | 변경 |
|---|---|
| `app/(main)/layout.js` · `page.js` · `news/page.js` · `news/list/page.js` | 신규(라우트 그룹 셸, 페이지는 `null`). 기존 `app/page.js`·`app/news/page.js` 삭제 |
| `components/AppShell.js` | 신규 — 탭 판정·keep-alive 패널·`focusComplex` Context·뉴스 1회 fetch·배지 |
| `components/TabBar.js` | 신규 — 모바일 하단 탭바 + 데스크톱 세그먼트(`TabSwitcher`) |
| `components/TodayView.js` | 신규 — 🔥 오늘 탭(머리 + `Briefing`) |
| `components/useIsMobile.js` | 신규 — matchMedia 640px 훅(KakaoMap·AppShell 공용) |
| `components/map/MapSheet.js` | 신규 — 모바일 목록/상세 스택 시트(peek/half/full) |
| `components/MobileShell.js` | 상단 바에서 📰 제거, 시트를 스택형(peek/half/full + 상세 머리)으로 |
| `components/KakaoMap.js` | `sheet` 상태 분해, 선택 시 중앙 이동, `focusComplex` 수신, 탭 복귀 `relayout` |
| `components/Briefing.js` | `/api/hot` 동시 fetch, 카드 순서, 📢·💰 제거 |
| `components/briefing/HotCard.js` | 신규 |
| `components/briefing/MarketSignalCard.js` | 요약 행 + 펼침 |
| `components/briefing/NewsWatchCard.js` | 삭제(핫플 `뉴스` 칩으로 흡수) |
| `components/NewsList.js` | 신규 — 기존 news/page.js의 목록부 + sticky 머리 + 💰 영향 |
| `lib/tradeReports.js` · `lib/hotRank.js` | 신규 순수 lib |
| `lib/trades.js` | 재수집 upsert 지점에 신고 기록 |
| `api/hot/route.js` | 신규 |
| `api/cron/refresh/route.js` | 전역 수집 단계 + 프루닝 |
| `components/mapStyles.js` | `Z.TABBAR`, 탭바·시트 머리 스타일 |
| `supabase/migrations/0010_trade_reports.sql` | 신규 |

## 테스트·검증

- `npm test`(훅 자동):
  - `tradeReports.test.mjs` — 새 거래 검출, 동일 키 멀티셋, 기준선 보호(첫 수집 · 48h 경계),
    원본 보존(해제·직거래도 기록)
  - `hotRank.test.mjs` — 칩별 정렬, `pct` 경계(5·10), `reports ≥ 2` 가격 컷, 종합 점수,
    뉴스 매칭(다른 지역 동명 불일치), 오늘/이번 주 창 경계(KST)
  - 기존 `format` 구조 가드가 새 날짜 코드에도 적용
- `npx next build` — 라우트 그룹 이동 후 prerender·null 가드.
- Playwright 실측(로컬 prod 빌드 → 같은 스크립트 prod 대조):
  - 모바일: 목록 peek→half→full 높이 수치, 행 → 상세 → `← 목록` → 스크롤 위치, 뒤로가기 제스처
  - 선택 단지 핀이 시트 위 보이는 영역 안에 있는지(`getBoundingClientRect`)
  - 탭 전환 왕복 후 `.trade-pin` 요소가 **같은 DOM 노드**인지(지도 유지 증거) + `/api/trades` 재요청 0회
  - 오늘 탭 핫플 행 클릭 → 착지 `lawdCd`(`re_map_view`)·상세 열림
  - 오늘 탭 첫 화면(모바일 1뷰포트)에 핫플·관심 단지가 들어오는지

## 범위 밖

- 신고가(역대 최고가) 판정 — 지역별 캐시 깊이가 제각각이라 보류.
- 12억 컷(`MAX_AMOUNT`) 상향 — 개인 예산 범위 결정 유지.
- 인천 — `regions.js`에 없음(현행 범위 유지).
- 핫플 푸시 알림.
