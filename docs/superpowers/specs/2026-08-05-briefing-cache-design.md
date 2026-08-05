# 브리핑 페이로드 캐시 설계 (2026-08-05)

**상태**: 설계 승인됨. 구현 계획 수립 전에 중단(내일 이어서).

## 문제

`/api/briefing`이 warm 응답 1.2~1.7s. 매 요청마다 `trade_raw_cache`에서
**0.48MB / 거래 3,003건**(4개월 × 관심지역 4곳)을 받아 `excludeAbnormal` →
`buildSignal` → 피드 조립을 다시 한다. 출력은 11.4KB뿐인데 입력이 크다.

데이터는 cron이 하루 한 번(06:00 KST) 갱신하므로 매 요청 재계산은 순수 낭비다.

## 제약

- **★ 즐겨찾기 변경은 즉시 반영되어야 한다.** 지도에서 ★를 담는 행위가 브리핑을
  만드는 구조라(CLAUDE.md의 "활용 루틴"), 여기에 지연이 생기면 앱의 핵심 동선이 깨진다.
- **하루 첫 방문도 빨라야 한다** → cron 워밍 필요(사용자 결정).
- 개인용 저트래픽 앱이라 Vercel 함수가 대부분 **콜드스타트** → 인메모리 캐시
  (`kapt.js` 방식)는 다음 방문 때 이미 사라져 있어 맞지 않는다.

## 채택안: 페이로드 캐시 + 지문(fingerprint)

응답 JSON을 통째로 DB에 저장하고, **입력의 지문**이 일치할 때만 재사용한다.
지문이 입력 전체를 덮으므로 별도의 무효화 로직이 필요 없다 — ★ 변경이 곧 지문
변경이라 즉시 반영이 자동으로 따라온다.

### 제외한 대안

- **지역별 집계 캐시**: `complexes`의 "같은 평형 직전 거래"가 4개월 전체를 훑어야 해서,
  새 ★ 단지에 대비하려면 원본을 다 들고 있어야 한다 → 지금의 원본 캐시와 다를 게 없다.
- **CDN 헤더(`s-maxage`/`stale-while-revalidate`)**: 코드 3줄로 가장 싸지만 ★ 즉시
  반영이 불가능(제약 위반). 응답에 ★ 목록이 들어 있어 공용 CDN에 두는 것도 성격상 부적절.

## 구성 요소

### 1. 로직 추출 — `app/lib/briefing.js`

`/api/briefing/route.js`의 집계 로직을 `buildBriefing(supabase)`로 뺀다.
라우트는 *캐시 판정 + 응답*만, cron은 *계산 + 저장*만 한다. 라우트끼리 HTTP로
호출하는 것을 피하려는 분리다.

⚠️ 이 파일은 supabase에 의존하므로 **서버 전용**(CLAUDE.md의 코드 위치 규약).
raw node로 단독 import 불가 → 테스트 대상이 아니다.

### 2. 마이그레이션 — `supabase/migrations/0008_briefing_cache.sql`

```sql
create table if not exists public.briefing_cache (
  id smallint primary key default 1,
  fingerprint text not null,
  payload jsonb not null,
  computed_at timestamptz not null default now(),
  constraint briefing_cache_single_row check (id = 1)
);
```

favorites가 전역 하나뿐인 개인용 앱이라 **단일 행**으로 충분하다(지문 불일치 시 덮어씀).
프루닝 불필요.

### 3. 지문 — `app/lib/briefingCache.js` (순수 함수)

`buildFingerprint({ favs, latestFetched, kstDate })` → sha1 짧은 문자열.

| 재료 | 잡아내는 변화 |
|---|---|
| favorites 전체(정렬 정규화 후 직렬화) | ★ 추가·삭제, 메모·임대차 만기 수정 |
| `max(fetched_at)` (대상 행) | cron 재수집, **지도의 `/api/trades`가 채운 캐시** |
| KST 달력 날짜 | 30일 창·D-day가 매일 이동 |

⚠️ 날짜는 **KST**여야 한다. Vercel은 UTC로 도는데 `toISOString()`을 그대로 쓰면
KST 00:00~08:59에 어제 날짜가 나와 자정 넘어서도 옛 창을 재사용하게 된다
(`marketSignal.ymd()`·briefing `cutoff`·`/api/subscription`과 같은 계열 — 이 프로젝트에서
네 번째 재발 지점).

### 4. 요청 흐름 (`GET /api/briefing`)

1. favorites 조회 (기존과 동일)
2. `Promise.all`로 ─ ① 대상 행의 `max(fetched_at)` 집계(전송량 ~0) ② 캐시 행 1건
3. 지문 계산 → **일치**하면 `payload`를 그대로 반환
4. **불일치**면 `buildBriefing()` → `briefing_cache` upsert → 반환

### 5. cron 워밍 — `/api/cron/refresh`

실거래 재수집 **직후, 추세 워밍 앞**에 삽입한다.

⚠️ 순서가 중요하다. 추세 워밍은 `WARM_DEADLINE_MS`(40s)로 미완주분을 다음 실행에
넘기는 *양보 가능한* 작업이라, 브리핑 워밍을 뒤에 두면 데드라인에 밀려 영영 안 돌 수 있다.

실패는 try/catch로 삼키고 응답에 `briefingWarm`만 남긴다(뉴스 cron의 청약 수집과 같은 방침).

### 6. 에러 처리 — 전부 graceful

테이블 부재(0008 미적용) · 조회 실패 · upsert 실패 · 지문 계산 실패 → **전부 라이브
계산으로 폴백**한다. 캐싱 계층이 통째로 죽어도 동작은 현재와 동일해진다.
(`/api/subscription`의 테이블 부재 폴백, favorites의 0004 컬럼 부재 폴백과 같은 방침.)

### 7. 테스트 — `tests/briefingCache.test.mjs`

프로젝트 규약대로 **순수 함수만**(`node:test`, 의존성 0):

- favorites 순서가 달라도 같은 지문이 나온다(정렬 정규화)
- ★ 추가 / 삭제 / 메모 변경 각각에서 지문이 바뀐다
- `max(fetched_at)`이 바뀌면 지문이 바뀐다
- **UTC 15:00 = KST 익일 00:00** 경계에서 지문이 넘어간다 (위 ⚠️의 회귀 가드)

### 8. 관측

응답에 `cached`(bool)·`computedAt`을 실어 `curl` 한 번으로 히트 여부를 확인할 수 있게 한다.

## 알려진 트레이드오프

- **00:00~06:00 KST 첫 방문 1회는 라이브 계산(1.5s)** — 날짜가 넘어가 지문이 바뀌었는데
  그날 cron(06:00)은 아직 안 돌았다. 그 시간대 사용이 드물어 감수한다.
- 페이로드는 계산 시점의 스냅샷이다. `signal.asOf`가 cron 시각으로 굳지만, 카드 헤더는
  `window`(ymd 문자열)를 쓰고 `asOf`를 화면에 표시하지 않으므로 영향 없다.

## 검증 계획

- `npm test` (지문 순수 함수) + `npx next build`
- 실측: 캐시 히트 시 응답 시간, ★ 토글 직후 즉시 반영되는지 (curl / Playwright)
- CLAUDE.md에 워밍 순서 제약과 지문 재료를 기록
