# RealEstate_Map — 부동산 지도/대출 비교 웹앱

## 한 줄 소개
지도 위에 국토부 실거래가 매물대를 띄우고, 내 자산 대비 LTV/DSR 설정에 따라
대출 가능 여부·필요 대출액을 계산해 비교해주는 개인용 부동산 웹앱.
참조 서비스: 네이버 부동산 / 아파트실거래 / 호갱노노 (데이터는 직접 가져오지 않고 같은 원천에서 수집).

## 현황 (2026-06-25)
MVP~3단계 + 자금 기반 마커색상·모바일 반응형까지 **구현·배포 완료, 실서비스 가동 중**.
남은 백로그·세부 진척은 `PROGRESS.md`. (아래 "핵심 기능/MVP"는 **초기 목표** — 대부분 구현됨)

## 기술 스택
- **Next.js** (App Router) + **Supabase** (DB/Auth/실시간)
- 지도: **카카오맵 API 확정** (2026-06-17) — 키 2종: **JS 키**(`NEXT_PUBLIC_KAKAO_MAP_KEY`, 클라이언트 지도용) / **REST 키**(`KAKAO_REST_API_KEY`, 서버 지오코딩용, 비밀). 둘 다 카카오 디벨로퍼스 `앱 → 플랫폼 키`에서 발급
- 배포: **Vercel 가동 중** → https://budongsan-virid.vercel.app (상세는 아래 개발 메모)

## 환경변수 (.env.local 로컬 / Vercel 대시보드)
값·비밀키는 절대 커밋 금지(`.env.local`·`.mcp.json` gitignore). 아래는 **이름만** 기록.
| 변수 | 노출 | 용도 |
|---|---|---|
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 클라 | 지도 JS SDK |
| `KAKAO_REST_API_KEY` | 서버 | 주소→좌표 지오코딩 (IP 제한 걸지 말 것) |
| `DATA_GO_KR_KEY` | 서버 | 국토부 실거래가·공동주택 API |
| `NEXT_PUBLIC_SUPABASE_URL` | 클라 | Supabase 주소 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 클라 | Supabase 공개키(현재 코드 미사용, Vercel엔 등록됨) |
| `SUPABASE_SECRET_KEY` | 서버 | Supabase secret(RLS 우회, 서버 전용) |
| `CRON_SECRET` | 서버 | cron 보호 Bearer (배포 시 필수, 미설정 시 누구나 트리거) |
> Vercel은 7종 모두 등록. 변경 시 Vercel Settings → 변경 후 Redeploy 필요.

## ⚠️ 데이터 출처 — 중요
참조 앱(네이버 부동산/호갱노노)은 **공개 API가 없고, 직접 스크래핑은 약관 위반·법적 리스크**.
대신 공식·합법 경로를 사용한다:
- **실거래가**: 국토교통부 실거래가 공개 API (`data.go.kr`) — 무료, 공공데이터포털 키 필요
  - ⚠️ 호출 quirk(검증됨): **`http://`만 동작**(https→Unauthorized) / **User-Agent 헤더 필수**(없으면 400) / **XML 전용**(`_type=json`→Unauthorized). 엔드포인트 `apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade`, 파라미터 `LAWD_CD`(법정동5자리)+`DEAL_YMD`(YYYYMM)
  - 실거래 응답엔 **좌표 없음** → `umdNm`+`jibun`/`aptNm`을 카카오 로컬 API로 지오코딩해야 마커 표시 가능
- **지도 표시**: 카카오맵 API (확정) — 주소→좌표 변환은 카카오 로컬 API 사용
- **LTV/DSR 정책**: 공식 API 없음 → 규제지역/한도/금리 규칙을 코드로 직접 구현하고,
  정책 변경 시 수동 업데이트 (규칙 출처·시행일을 주석으로 남길 것)

## 핵심 기능 (목표)
1. **지도 + 실거래가** — 지도 위 위치별 실거래 매물대 표시
2. **대출 계산/비교** — 자산·LTV·DSR 입력 → 대출 가능액/가능여부, 정책 반영 비교 화면
3. **즐겨찾기 + 자동 업데이트** — 관심 위치 저장, 실거래가 주기적 자동 갱신

## MVP (1단계) 범위
- 지도 띄우기 (지도 API 연동, 키 발급)
- 국토부 실거래가 API 연동 → 특정 지역 거래 데이터 수집
- 지도 위에 매물대(거래가) 마커/오버레이로 표시
- 대출 계산·즐겨찾기·실시간 갱신은 2단계 이후

## 개발 메모
- 실행: `npm run dev` → http://localhost:3000 (카카오 디벨로퍼스에 이 도메인 등록돼 있어야 지도 뜸)
- **배포(가동 중)**: Vercel **대시보드** 방식 → https://budongsan-virid.vercel.app (env 7종 등록·카카오 Web 도메인 등록 완료). ⚠️ **Vercel CLI는 이 머신 불가**(한글 계정명→illegal HTTP header). REST 키엔 IP 제한 걸지 말 것(Vercel IP 동적)
  - GitHub `main`에 push하면 Vercel이 **자동 재배포**(대시보드 연결됨). env 변경은 Vercel 대시보드 Settings → 변경 후 Redeploy 필요. `vercel.json` cron은 push 시 자동 반영
  - 배포 반영 확인(CLI 불가): prod 홈 HTML의 `/_next/static/chunks/*.js` 파일명 해시가 배포마다 바뀜 → push 후 해시 변하는지 폴링해 안착 확인. 번들 grep은 **문자열 리터럴/CSS클래스**로(JS 변수·함수명은 minify로 사라짐). ⚠️ **서버 코드만** 바뀐 배포(API/lib)는 청크 해시가 **안 변함**(클라 번들 동일, 2026-07-02 확인) → `gh api repos/1226cjw-afk/Budongsan/commits/<sha>/status`의 Vercel context가 success("Deployment has completed")인지로 확인
- 구조: App Router. 지도/세부패널은 `app/components/KakaoMap.js`(클라이언트, SDK `autoload=false`로 동적 로드)
- `KakaoMap.js` 함정: 마커는 `useEffect([area,price,favorites,profile,priceBasis,rank])`→`renderMarkers`로 그림 → 마커에 영향 주는 새 입력은 **이 deps에 꼭 추가**(아니면 미갱신). ⚠️ 단 이 effect엔 `dataRef.lawdCd !== lawdCd`면 스킵하는 **stale 가드가 있음(지우지 말 것)** — 지역 전환 중 deps가 먼저 바뀌면 옛 지역 데이터로 `setBounds`가 실행돼 `fitRef`를 소진 → 지도가 새 지역으로 안 움직여 **idle 핸들러가 지역을 되돌리는 레이스**(2026-07-02 실제 발생, rank 로드가 트리거). 좌측 패널은 **네이버식 단지 리스트**(데스크톱 전체높이/모바일 📋목록 시트) — `listRows` useMemo(`tradesData` 반응형 사본 기반, dataRef 아님) + 정렬 6종 + 배지(🔥상승률 15%↑·🏗준공30년↑·✓자금여유), 세대수는 상위 30행만 lazy. 모바일은 `isMobile`(matchMedia 640px)+인라인스타일 스프레드(미디어쿼리 아님). 핀 색은 `<style>`의 `.trade-pin--fav/ok/no`(자금설정 시 ok=초록/no=빨강 우선, 즐겨찾기는 ★). 타지역 즐겨찾기는 `.trade-pin--away`(점선링) — `favoritesRef`(좌표 포함 전체목록)로 **현재지역 밖만** 렌더, 클릭 시 `gotoFavorite`로 이동. 세부패널은 **평형 카드가 추세 선택기** — 카드 클릭 시 그 카드 안에 추세차트 인라인(`trendArea`+`trendMonths` 12/36), 별도 "시세 추세" 섹션 없음
- 코드 위치: `app/lib/`에 로직 집중 — `trades.js`(수집·지오코딩·캐시 공용), `regions.js`(서울25+경기 + 지오코딩 지역검증), `loanPolicy.js`(LTV/DSR), `kapt.js`(공동주택 세대수 등). ⚠️ 실거래 코드는 **법정동 시군구 5자리** — **부천(41190)·화성(41590) 상위코드는 0건**이라 구별 코드로 등록(부천 4119x 3구 / 화성 2025신설 4159x 4구). API: `/api/trades`(N개월 병합), `/api/trend`(월별 추세, `area`로 평형별, `months` 최대 36=3년), `/api/favorites`(CRUD), `/api/cron/refresh`(즐겨찾기 지역 최근2개월 재수집 + 추세 36개월 워밍), `/api/complex-info`(세대수/동수), `/api/rank`(단지별 1년 상승률 — 최근 3개월 vs 12~14개월 전 ㎡당가, 창별 2건 미만 null). 월 수집은 `fetchRawMonths` 일괄(캐시 `.in()` 1회 + 미스 전량 동시 — 국토부는 동시 호출 스로틀 없음, 실측 동시36=4.7s가 최속)
- 단지 세대수: 실거래가 API엔 없음 → 국토부 공동주택 API 별도(`kapt.js`). **현행 엔드포인트(2026-06 검증)**: 목록 `AptListService3/getSigunguAptList3`(시군구→kaptCode), 기본정보 `AptBasisInfoServiceV4/getAphusBassInfoV4`(kaptCode→`kaptdaCnt`세대수). ⚠️ **둘 다 data.go.kr 활용신청 필요**(자동승인) — **2026-06-25 승인 확인(HTTP 200)**. 미승인 시 HTTP 403 Forbidden(구버전 V2/V3는 500 "Unexpected errors"=폐기). ⚠️ **이 계열은 응답이 JSON**(실거래가 API의 XML과 정반대 — `_type=xml`줘도 JSON). `response.body.items[]`(목록)/`response.body.item`(기본정보, `kaptdaCnt`는 float). 미승인/오류 시 `{kaptCode:null}`로 graceful(세대수만 생략). 인메모리 캐시(서버수명). 단지 외부링크(키 불필요): 헤더 "🔎 네이버 검색"=네이버 통합검색(전체탭), 평형 카드 "N건·🏠매물"=네이버 부동산 검색 딥링크 `m.land.naver.com/search/result/{umd aptNm}`. ⚠️ 네이버 부동산은 단지 고정 URL 비공개 → 단지명 검색 기반 **best-effort**(`naverLandUrl()`). ⚠️ 단지명 **괄호는 검색 실패**("동편마을(3단지)"→0건) → 괄호→공백 변환 필수(2026-06-30); 괄호 안이 동·필지번호(`삼성(931)`)면 정확매칭 불가
- 자동 갱신: `vercel.json` cron이 `/api/cron/refresh`를 매일 호출(배포 후 동작, Hobby는 1일1회). 라우트의 `maxDuration=60` + 추세 워밍 40s 데드라인 가드는 **지우지 말 것**(첫 워밍 타임아웃 방지, 미완주분은 다음 실행이 이어감). 보호용 `CRON_SECRET` env — 설정 시 `Authorization: Bearer <secret>` 필요(Vercel Cron이 자동 첨부). **배포 시 반드시 설정**(미설정이면 누구나 국토부 호출 트리거 가능). 로컬은 미설정이라 curl로 바로 호출 가능. `/api/trades` 응답에 `fetchedAt`(캐시 신선도) 포함
- 스택 버전: Next.js 16 + React 19 (수동 스캐폴딩, `create-next-app` 미사용 — 기존 .md 파일 충돌 회피)
- 변경 검증: `npx next build` (컴파일/타입). `next lint --file` 옵션은 없음.
- API 동작 확인: `npm run dev`(백그라운드) → 로그 "Ready" 대기 → `curl "http://localhost:3000/api/trades?lawdCd=11680&dealYmd=202605"`
- UI 시각 검증(브라우저): `npm i --no-save playwright` + `chromium.launch({channel:"chrome",headless:true})` — **설치된 크롬 사용, 브라우저 다운로드 없음**(이 머신 검증됨). 임시 `scripts/tmp-*.mjs`로 실클릭·스크린샷(temp 폴더) 후 삭제. 핀 클릭은 겹침 인터셉트 잦음 → `elementFromPoint` 히트테스트로 클릭 가능한 핀 골라 클릭. 카카오 CustomOverlay는 **뷰포트 밖이면 DOM에 없음**(타지역 ★ 검증은 줌아웃 필요)
- lib·외부 API 단독 검증(dev서버 불필요): 임시 `scripts/*.mjs`에서 `.env.local` 수동 파싱(`process.env` 주입)→ `await import("../app/lib/..")`→ `fetch`. 지오코딩률 측정·data.go.kr 응답 확인에 유용. `app/lib` import 시 `MODULE_TYPELESS_PACKAGE_JSON` 경고는 무해(grep로 필터). 끝나면 스크립트 삭제(커밋 금지)
  - ⚠️ `trades.js`는 단독 `import` 불가: 내부 `./supabaseServer`(확장자 없는 import)를 raw node가 못 찾아 `ERR_MODULE_NOT_FOUND`로 죽음. supabase 미의존 lib(`regions`/`loanPolicy`)는 OK. trades 계열 검증은 국토부/카카오 API를 **직접 fetch**해 우회(엔드포인트/헤더는 `trades.js`에서 복사)
- ⚠️ Git Bash에서 `curl -o /tmp/x` 한 파일을 node가 못 읽음(win 경로 불일치) → 응답은 **stdin 파이프**나 cwd 상대경로로 받을 것
- ⚠️ dev 서버 좀비: 새 `npm run dev`가 "Another next dev server is already running"으로 죽으면 stale 프로세스가 락 점유 → PowerShell `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ?{$_.CommandLine -match 'next'} | %{Stop-Process $_.ProcessId -Force}` 로 정리 (bash `pkill -f next`는 불안정)
- ⚠️ 한글 인자 API 테스트는 bash `curl`로 금지(명령줄 UTF-8 깨져 DB에 깨진 값 저장) → `node -e`의 `fetch`+`encodeURIComponent` 사용
- ⚠️ 한글 커밋 메시지는 PowerShell here-string(`git commit -m @'...'@`)이 괄호·특수문자에서 깨져 실패 → 임시파일에 쓰고 `git commit -F <file>` (검증됨). 임시파일은 **Write 도구**로 쓸 것 — PS5.1 `Set-Content -Encoding utf8`은 **BOM을 붙여 커밋 제목 첫머리에 U+FEFF가 박힘**(2026-07-02 실제 발생). 경로는 `.git\COMMIT_MSG_TMP.txt`처럼 **.git 폴더 안**에 두면 git status에 안 잡혀 오염 없음
- ⚠️ PowerShell `Invoke-WebRequest .Content`는 한글 JSON을 코드페이지로 잘못 디코드 → **.NET 문자열 자체가 깨짐**(콘솔 표시뿐 아님). 읽은 한글 값을 **재요청에 쓰면 서버 매칭 실패**(추세가 0건처럼 보임) → 한글 round-trip 검증은 `node` fetch로
- 지도: SDK URL에 `&libraries=services` 필요. 좌표→지역은 `geocoder.coord2RegionCode`(대문자 R·C, 오타 주의)
- `/api/trades`는 단지별 `trades[]`(area 포함) 전체 반환 → 면적 등 추가 필터는 재요청 없이 클라(`KakaoMap.js`의 `renderMarkers`)에서 처리

## 작업 규칙
- 비밀키(API 키, Supabase 키, `.mcp.json`)는 **절대 커밋 금지** → `.gitignore` 확인 필수.
  Next.js에서는 `.env.local` 사용, `NEXT_PUBLIC_` 접두사는 클라이언트 노출되니 주의.
- 정책 규칙(LTV/DSR)은 하드코딩하되 **출처·시행일 주석**을 반드시 달 것 (나중에 갱신 추적).
- 한글 든 파일은 Read 도구로 볼 것 (PowerShell Get-Content 인코딩 깨짐).
- 진척은 이 폴더의 `PROGRESS.md`에 기록.

## Supabase
- 키 **새 형식**: `sb_publishable_`(클라, `NEXT_PUBLIC_`) / `sb_secret_`(서버, RLS 우회). 둘 다 `.env.local`.
- MCP는 secret 키 아님 → **Personal Access Token(`sbp_`)** 필요. `.mcp.json`(gitignore)에 저장, 적용엔 Claude 재시작.
- 테이블 생성(DDL)은 secret 키로 HTTP 불가 → 대시보드 **SQL Editor**에서 실행, `supabase/migrations/`에 보관.
- 캐시: `trade_raw_cache`(월별 원본거래, 이번달 12h TTL) + `geocode_cache`(단지 좌표) + `favorites`. 구 `trade_cache`(geocoded payload)는 미사용. 지오코딩은 `geocodeMany`=캐시 1회 일괄조회+미스만 병렬(단건 순차조회 금지).
