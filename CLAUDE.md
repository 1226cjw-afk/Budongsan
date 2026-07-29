# Budongsan — 부동산 지도/대출 비교 웹앱

## 한 줄 소개
지도 위에 국토부 실거래가 매물대를 띄우고, 내 자산 대비 LTV/DSR 설정에 따라
대출 가능 여부·필요 대출액을 계산해 비교해주는 개인용 부동산 웹앱.
참조 서비스: 네이버 부동산 / 아파트실거래 / 호갱노노 (데이터는 직접 가져오지 않고 같은 원천에서 수집).

## 현황 (2026-07-29)
MVP~3단계 + 네이버식 단지 리스트 패널(1년 상승률·재건축연한·자금여유 배지/정렬)
+ 📰 데일리 뉴스 탭(/news, cron 자동수집)까지 **배포 완료, 실서비스 가동 중**.
**2026-07-25**: 필요자금에 부대비용(취득세·중개보수·등기비) 반영 + 월 상환액·DSR% 표시,
월상환액 상한 필터, "얼마 더 모으면 되나", /news를 **오늘의 브리핑**으로 승격
(관심 단지 변동·일정·영향 뉴스), 모바일 겹침 해결(상단 1줄 바 + 하단 시트 단일 슬롯).
**2026-07-29 정확도·조작감 정비**: 평 표기를 **공급 기준**으로(84㎡=34평), 시세에서
**해제거래·직거래 제외**, 추세 그래프 **중앙값**, 네이버 딥링크를 카카오 정식 단지명으로
(70%→80%), 지도 idle 디바운스+프로그램 이동 억제(지역 오전환 해소), 마커 오버레이 재사용
(자금 입력 중 DOM 유지), 마지막 위치 복원 + 📍 현위치, 모바일 상단바 🔄 갱신.
남은 백로그·세부 진척은 `PROGRESS.md`.

**활용 루틴** (설계 의도 — 이 앱은 "탐색"이 아니라 "반복 확인" 도구):
매일 = 브리핑(/news)에서 관심 단지 새 거래·내 대출에 영향 갈 뉴스 / 월 1회 = 지도에서
자금 설정→구매가능만→여유순으로 후보 압축→★ / 결정 시 = 평형 카드의 필요현금·월납·부대비용.
★ 담는 행위가 브리핑을 만든다(cron이 그 지역을 매일 갱신 → 브리핑에 변동이 뜸).

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
| `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` | 서버 | 뉴스 수집(선택) — 미설정 시 구글 뉴스 RSS 폴백으로 동작 |
> Vercel은 네이버 2종 제외 7종 등록(뉴스는 RSS 폴백 가동 중). 변경 시 Vercel Settings → 변경 후 Redeploy 필요.

## ⚠️ 데이터 출처 — 중요
참조 앱(네이버 부동산/호갱노노)은 **공개 API가 없고, 직접 스크래핑은 약관 위반·법적 리스크**.
대신 공식·합법 경로를 사용한다:
- **실거래가**: 국토교통부 실거래가 공개 API (`data.go.kr`) — 무료, 공공데이터포털 키 필요
  - ⚠️ 호출 quirk(검증됨): **`http://`만 동작**(https→Unauthorized) / **User-Agent 헤더 필수**(없으면 400) / **XML 전용**(`_type=json`→Unauthorized). 엔드포인트 `apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade`, 파라미터 `LAWD_CD`(법정동5자리)+`DEAL_YMD`(YYYYMM)
  - 실거래 응답엔 **좌표 없음** → `umdNm`+`jibun`/`aptNm`을 카카오 로컬 API로 지오코딩해야 마커 표시 가능
  - ⚠️ 응답엔 **시세가 아닌 거래가 섞여 있다** — `cdealType="O"`(계약 해제, 취소된 거래) / `dealingGbn="직거래"`(가족간 증여성 다수). 2026-07-29 안양 동안구 실측: 697건 중 해제 10·직거래 21, 직거래는 같은 평형 중개거래 평균 대비 **−41%~+24%**로 튐. `tradeStats.excludeAbnormal()`이 걷어낸다(아래 참조)
- **지도 표시**: 카카오맵 API (확정) — 주소→좌표 변환은 카카오 로컬 API 사용
- **LTV/DSR 정책**: 공식 API 없음 → 규제지역/한도/금리 규칙을 코드로 직접 구현하고,
  정책 변경 시 수동 업데이트 (규칙 출처·시행일을 주석으로 남길 것)

## 핵심 기능 (전부 구현됨)
지도+실거래 마커 · 평형별 대출 계산(LTV/DSR)·구매가능 색칠 · 즐겨찾기+cron 자동갱신 ·
단지 리스트 패널(상승률/재건축/자금 정렬·배지) · 추세 차트(1·3년) · 오늘의 브리핑 탭(/news) · 모바일 반응형.
초기 목표·단계별 이력은 `PROGRESS.md` 참조.

## 개발 메모
- 실행: `npm run dev` → http://localhost:3000 (카카오 디벨로퍼스에 이 도메인 등록돼 있어야 지도 뜸)
  - ⚠️ **폰 실기기 검증은 LAN IP(`http://192.168.x.x:3000`) 불가** — 카카오에 미등록 도메인이라 지도가 안 뜬다. 등록된 건 `localhost:3000`과 prod URL 뿐 → 실기기 확인은 **배포 후 prod URL**이 가장 빠름(또는 크롬 F12 기기 에뮬레이션은 localhost라 OK)
- **배포(가동 중)**: Vercel **대시보드** 방식 → https://budongsan-virid.vercel.app (env 7종 등록·카카오 Web 도메인 등록 완료). ⚠️ **Vercel CLI는 이 머신 불가**(한글 계정명→illegal HTTP header). REST 키엔 IP 제한 걸지 말 것(Vercel IP 동적)
  - GitHub `main`에 push하면 Vercel이 **자동 재배포**(대시보드 연결됨). env 변경은 Vercel 대시보드 Settings → 변경 후 Redeploy 필요. `vercel.json` cron은 push 시 자동 반영
  - 배포 반영 확인(CLI 불가): prod 홈 HTML의 `/_next/static/chunks/*.js` 파일명 해시가 배포마다 바뀜 → push 후 해시 변하는지 폴링해 안착 확인. 번들 grep은 **문자열 리터럴/CSS클래스**로(JS 변수·함수명은 minify로 사라짐). ⚠️ **서버 코드만** 바뀐 배포(API/lib)는 청크 해시가 **안 변함**(클라 번들 동일, 2026-07-02 확인) → `gh api repos/1226cjw-afk/Budongsan/commits/<sha>/status`의 Vercel context가 success("Deployment has completed")인지로 확인
  - ⚠️ push 전 `git log origin/main..main` 확인 — `main`이 **이전 세션의 미push 커밋**을 들고 있을 수 있어 push 한 번에 예상보다 많이 배포된다(2026-07-25: 세션 전부터 미push였던 `51b8d09`이 함께 나감)
- 구조: App Router. 지도/세부패널은 `app/components/KakaoMap.js`(클라이언트, SDK `autoload=false`로 동적 로드). **2026-07-12 리팩토링으로 분리**: 스타일 상수 → `components/mapStyles.js`(팔레트·그림자는 `lib/palette.js`, 뉴스 페이지와 공유) / 추세차트·도움말 모달 → `components/TrendChart.js`·`HelpModal.js` / 순수 헬퍼 → `lib/format.js`(포맷터·D-day)·`lib/tradeStats.js`(집계·필터)·`lib/naverLand.js`(딥링크). **2026-07-25 추가**: 브리핑 3카드 → `components/Briefing.js` / 모바일 상단바·시트 셸 → `components/MobileShell.js`. 테스트는 `tests/*.test.mjs`(순수 lib만 — `acquisitionCost`·`loanPolicy`·`format`)
- `KakaoMap.js` 마커 함정: 마커는 `useEffect([area,price,monthly,favorites,loanKey,priceBasis,rank])`→`renderMarkers`로 그림 → 마커에 영향 주는 새 입력은 **이 deps에 꼭 추가**(아니면 미갱신). ⚠️ deps의 `loanKey`는 자금 입력을 추린 **문자열 키**다 — `profile` 객체를 그대로 넣으면 자금 칸에 한 글자 칠 때마다 객체가 새로 생겨 마커 전량이 다시 그려진다(버벅임의 주원인, 2026-07-29 수정). 자금 관련 새 입력이 마커에 영향 주면 **`loanKey` 배열에 추가**할 것. ⚠️ 이 effect의 `dataRef.lawdCd !== lawdCd` 스킵 **stale 가드는 지우지 말 것** — 지역 전환 중 deps가 먼저 바뀌면 옛 지역 데이터로 `setBounds`가 실행돼 `fitRef`를 소진 → 지도가 새 지역으로 안 움직여 **idle 핸들러가 지역을 되돌리는 레이스**(2026-07-02 실제 발생, rank 로드가 트리거). ⚠️ `panTo`(애니메이션)와 `fitRef=true`(로드 후 setBounds)를 **같이 걸지 말 것** — 캐시가 빠르면 setBounds 위로 panTo가 마저 진행돼 화면이 밀림(2026-07-03 실제 발생) → 이동+지역전환은 `gotoFavorite`처럼 `setCenter`+`setLevel(5)`+`fitRef=false`로
- `KakaoMap.js` 지도 이동/지역 전환 (2026-07-29 재정비 — 여기를 건드릴 땐 셋 다 유지):
  - **코드가 지도를 옮길 땐 반드시 `moveMap(fn)`으로 감쌀 것**(`setCenter`/`setBounds`/`panTo`/`setLevel`). `suppressIdleRef`에 시각을 찍어 그 이동이 만든 idle이 **지역을 재판정하지 않게** 막는다. 안 감싸면 "지역 선택 → 지도 이동 → 그 idle이 다시 판정 → 원래 지역으로 복귀"하는 자기참조 루프가 살아난다(위 stale 가드는 이 증상의 *일부*만 막았음)
  - idle → 지역 판정은 **`IDLE_SETTLE_MS`(400ms) 디바운스**. 팬 도중 매 idle마다 지오코더를 호출하고 시군구가 바뀔 때마다 전체 재로드가 걸리던 것이 버벅임의 다른 축이었다
  - 자동 전환 시 `regionToast`로 알리고 **↩︎되돌리기**를 준다(조용히 갈아끼우지 않음). 사용자가 직접 고른 경로(`selectRegion`/`gotoFavorite`)는 토스트를 끈다
  - 마지막 뷰는 `re_map_view` localStorage(`{lawdCd,lat,lng,level}`) — idle마다 + 지역 변경 effect에서 저장, 초기화 때 복원(복원 시 `fitRef=false`로 자동맞춤이 덮지 않게). ⚠️ localStorage는 **마운트 이후에만** 읽을 것(useState 초기값으로 읽으면 하이드레이션 불일치). 저장값이 없는 첫 방문에만 `locateMe({initial:true})`로 현위치를 묻는다
  - `renderMarkers`는 오버레이를 **재사용**한다(`overlaysRef`는 `Map(key→{overlay,el})`). 새 핀 종류를 추가할 때도 `upsert()`를 쓸 것 — 전량 파괴/재생성으로 되돌리면 필터 변경마다 DOM 수백 개가 다시 만들어진다. 키에 **`lawdCd`를 포함**해야 지역 전환 시 동명 단지가 남지 않는다
- `KakaoMap.js` 레이아웃:
  - **모바일 셸(2026-07-25 재구성)**: 상단 = 고정 높이 **1줄 바**(`MobileShell.MobileTopBar` — 짧은 요약 + ⚙️ + 📰), 나머지(지역·필터·자금·즐겨찾기·목록·세부)는 전부 **하단 시트 하나**. 시트 슬롯이 단일 상태 `sheet`(`null|settings|list|detail`)라 **동시에 둘 이상 열릴 수 없음 = 겹침 구조적 불가**(이전엔 상단 패널이 세로로 자라며 하단 시트와 z:10끼리 겹쳤음). 단지 선택 시 effect가 자동으로 `detail`로 전환. ⚠️ z-index는 `mapStyles.Z`(MAP/TOPBAR/BACKDROP/SHEET/MODAL) **상수로만** — 새 오버레이는 반드시 등록. ⚠️ `mobileSheet`에 `boxSizing:"border-box"` 필수(globals.css에 전역 리셋 없어 `maxHeight`가 패딩 26px 제외 → 70vh 초과, 2026-07-25 실측). ⚠️ 세부패널 `closeBtn`(absolute)은 시트에서 좌표가 어긋나 `!isMobile`일 때만 렌더 — 모바일은 백드롭 탭/그립으로 닫음. ⚠️ `controlPanelContent` 안에 넣은 UI는 **모바일에서 ⚙️ 시트를 열어야만 보인다** — 상시 노출이 필요한 알림/배너는 시트 밖(상단 바 아래)에 별도 렌더할 것(부대비용 안내 배너가 이 이유로 모바일에서 안 보임 — 2026-07-25 사용자 확인 후 **그대로 두기로 결정**, 고치지 말 것. 새로 만드는 알림에만 적용할 규칙)
  - ⚠️ 지도 위 떠 있는 버튼(📍 현위치 등)은 **데스크톱에서 `right` 정렬 금지** — 세부패널(`right:14, width:320`, 전체높이)이 덮어 클릭이 안 된다(2026-07-29 실측 `clickable:false`). 좌우 패널 사이 빈 지도 영역(`left:368`)에 두고, 모바일은 시트가 **닫혔을 때만** 우하단에 렌더
  - ⚠️ `controlPanelContent`·`detailContent`처럼 JSX를 **변수로 뺄 때는 null 가드 필수** — JSX는 생성 시점에 children 표현식이 평가되므로 `const detailContent = selected && detail && (…)` 없이 두면 `selected.aptNm`이 터진다(렌더 안 `{selected && …}`에 감싸여 있을 때는 안전했음). 빌드의 prerender 단계가 잡아준다
  - 좌측 패널 = **네이버식 단지 리스트**(데스크톱 전체높이 / 모바일은 시트 `list` 슬롯) — `listRows` useMemo(**`tradesData` 반응형 사본** 기반, dataRef 아님) + 정렬 6종 + 배지(🔥상승률 15%↑·🏗준공30년↑·✓자금여유), 세대수는 상위 30행만 lazy(중복방지 `infoInflightRef` Set은 **요청 settle 시 finally로 해제 필수** — 안 하면 rank 도착으로 `listRows`가 로드 직후 바뀌며 조회가 중단→키가 남아 세대수가 세션 내내 안 뜸, 2026-07-21 수정)
  - 모바일 분기는 `isMobile`(matchMedia 640px)+인라인스타일 스프레드(미디어쿼리 아님). 시트 안에 들어가는 패널은 `bare`(position:static·배경/그림자 제거) 스프레드로 껍데기를 벗김
  - 세부패널은 **평형 카드가 추세 선택기** — 카드 클릭 시 그 카드 안에 추세차트 인라인(`trendArea`+`trendMonths` 12/36), 별도 "시세 추세" 섹션 없음
  - ⚠️ 컨트롤 패널은 **세로 flex 전체높이** — 직계 자식 공유 스타일에 `flex:1` 금지(세로로 성장, 시군구 select 304px 사고 2026-07-03; 가로 행에서만 사용처에서 덧씌울 것)
  - 토글쌍 스타일(`xxx`/`xxxOn`)은 `xxxOn`이 `borderColor`만 덮으면 shorthand `border` 금지(React dev 경고 → `pillBtn`처럼 비shorthand). **스타일 상수 추가 전 `components/mapStyles.js`에서 이름 grep 필수** — 중복 정의 시 dev 컴파일 에러(`newsLink` 충돌 실제 발생 2026-07-08). 마커/리스트의 자금 여유 계산은 **`bestFit()` 한 곳 공유**(색칠=여유≥0). ⚠️ `bestFit`은 `{gap, monthly}`를 **같은 평형에서** 뽑아야 한다 — 평형을 넘나들며 고르면 "A평형은 살 수 있고 B평형은 월납이 싸다"는 이유로 못 사는 단지가 통과
  - 갈아타기: 프로필 `owned`(평형 카드 "보유 지정" 토글, 기준가 스냅샷) — **`assets`가 여유현금+매도 실수령 합산으로 재정의**돼 구매가능 색칠·자금 여유순·평형 비교에 자동 전파
  - **자금 관련 새 입력은 두 곳에만**: `assets` 정의(자기자금 쪽) / `calcMaxLoan`의 `requiredCash`(비용 쪽). 이 둘이 마커 색칠·리스트 배지·평형 카드·브리핑까지 전부 먹이는 단일 소스라 호출부에서 따로 더하지 말 것
- `KakaoMap.js` 핀: 색은 `<style>`의 `.trade-pin--fav/ok/no`(자금설정 시 ok=초록/no=빨강 우선, 즐겨찾기는 ★, 급등은 🔥 프리픽스). 타지역 즐겨찾기는 `.trade-pin--away`(점선링) — `favoritesRef`(좌표 포함 전체목록)로 **현재지역 밖만** 렌더, 클릭 시 `gotoFavorite`로 이동
- 코드 위치: `app/lib/`에 로직 집중 — **서버 전용(supabase 의존)**: `trades.js`(수집·지오코딩·캐시), `kapt.js`(세대수), `supabaseServer.js`(+`noDbResponse`) / **클라 공용**: `regions.js`(서울25+경기 + 지역검증), `loanPolicy.js`(LTV/DSR·월납·필요자금), `acquisitionCost.js`(취득세·중개보수·등기비 — `loanPolicy`가 import), `news.js`(뉴스 수집·수도권 필터·분류), `briefingSeen.js`(브리핑 🆕 판정, localStorage — 지도 배지와 공유), `format.js`·`tradeStats.js`(집계·필터·**평 환산**·이상치 제외·중앙값)·`palette.js`·`naverLand.js` / `cronAuth.js`(cron Bearer 인증 공용). ⚠️ 실거래 코드는 **법정동 시군구 5자리** — **부천(41190)·화성(41590) 상위코드는 0건**이라 구별 코드로 등록(부천 4119x 3구 / 화성 2025신설 4159x 4구). 월 수집은 `fetchRawMonths` 일괄(캐시 `.in()` 1회 + 미스 전량 동시 — 국토부는 동시 호출 스로틀 없음, 실측 동시36=4.7s가 최속) — 미스는 `allSettled`(한 달 실패해도 나머지 살림, 전량 실패 시에만 throw→502), 반환에 `latestFetched`(최근 fetched_at) 포함 → `/api/trades` 신선도는 별도 쿼리 없이 사용(2026-07-21)
  - API(브리핑): `/api/briefing`(즐겨찾기 단지 최근 30일 거래 + D-30 내 일정) — ⚠️ **캐시 전용**(`fetchRawMonths(.., {cacheOnly:true})`)이라 외부 API를 **호출하지 않는다**. cron이 채워둔 `trade_raw_cache`만 읽고, 없는 지역은 조용히 생략. 변동률은 **같은 평형의 직전 거래**와 비교(평형이 다르면 무의미)
  - **시세 정확도 단일 지점**: `fetchRawMonths`가 캐시/수집분을 반환할 때 `excludeAbnormal()`로 **해제·직거래를 걷어낸다** → 이 함수를 거치는 네 라우트(`/trades`·`/trend`·`/rank`·`/briefing`)가 같은 기준을 공유한다. 제외 기준을 바꾸려면 여기 한 곳만. ⚠️ 캐시에는 **원본 그대로** 저장하고 걸러내기는 읽을 때 한다(기준이 바뀌어도 재수집 불필요). 필드가 없는 옛 캐시 행은 `lacksDealFlags()`가 미스로 돌려 **자가 재수집**(마이그레이션 없음). ⚠️ 해제는 거래 후 나중에 발생하므로 과거 달 캐시는 늦게 반영된다 — cron이 최근 2개월만 재수집하는 게 현실적 타협
  - API(실거래·단지): `/api/trades`(N개월 병합, 응답에 `excluded{cancelled,direct}`·단지별 `naverName`) · `/api/trend`(월별 추세 — 대표값은 **중앙값 `value`**, `avg`도 같이 반환. 한 평형의 월 거래가 1~3건이라 평균은 특수거래 하나에 통째로 끌려간다. `area`로 평형별, `months` 최대 36=3년) · `/api/favorites`(CRUD + PATCH=D-day 필드, 0004 컬럼 부재 시 GET 폴백·PATCH 409 graceful) · `/api/complex-info`(세대수/동수) · `/api/rank`(단지별 1년 상승률 — 최근 3개월 vs 12~14개월 전 ㎡당가, 창별 2건 미만 null)
  - API(cron·뉴스): `/api/cron/refresh`(즐겨찾기 지역 최근2개월 재수집 + 추세 36개월 워밍) · `/api/cron/news`(뉴스 일수집 — `lib/news.js` 2단 소스: 네이버 키 있으면 API/없으면 구글 RSS, 키워드=기본8종(수도권·매매 위주)+즐겨찾기 지역, link PK upsert 중복제거+30일 프루닝) · `/api/news`(수집분 최신 300건 — 칩 필터는 클라). 뉴스 페이지 상단은 `components/Briefing.js`(⭐관심단지·⏳일정·💰영향뉴스 3카드) — 자금 여유는 지도와 **같은 `calcMaxLoan`**으로 계산해 두 화면 숫자가 어긋나지 않게 함. 💰카드는 `classifyNews()`의 대출·금리/정책·세금 + 관심지역 기사(신규 분류 로직 없음). **수도권 온리**(2026-07-12): `isCapitalAreaNews()`를 수집(`fetchNews`)+조회(`/api/news`) 양쪽 적용 — 화이트리스트 우선이라 비수도권 지명"만" 언급된 기사만 제외, 카테고리는 `classifyNews()` 제목 룰(DB 컬럼 없음, 렌더 시 계산)
- 단지 세대수(`kapt.js`): 실거래가 API엔 없음 → 국토부 공동주택 API 별도. **현행 엔드포인트(2026-06 검증)**: 목록 `AptListService3/getSigunguAptList3`(시군구→kaptCode), 기본정보 `AptBasisInfoServiceV4/getAphusBassInfoV4`(kaptCode→`kaptdaCnt`세대수)
  - ⚠️ **둘 다 data.go.kr 활용신청 필요**(자동승인, 2026-06-25 승인 확인) — 미승인 403 / 구버전 V2·V3는 500=폐기
  - ⚠️ **이 계열은 응답이 JSON**(실거래가 API의 XML과 정반대 — `_type=xml`줘도 JSON). `response.body.items[]`(목록)/`response.body.item`(기본정보, `kaptdaCnt`는 float). 미승인/오류 시 `{kaptCode:null}`로 graceful(세대수만 생략)
  - 캐시 2겹: 인메모리(서버수명) + **`kapt_cache` 영구**(Supabase, `getComplexInfoMany` 일괄 — geocodeMany 패턴, 매칭 실패는 미캐시). 리스트 lazy는 `/api/complex-info` **POST 일괄**(GET은 세부패널 단건)
- 네이버 외부링크(키 불필요): 헤더 "🔎 네이버 검색"=통합검색(전체탭), 평형 카드 "N건·🏠매물"=네이버 부동산 검색 딥링크 `m.land.naver.com/search/result/{umd 단지명}`. ⚠️ 단지 고정 URL 비공개 → 단지명 검색 **best-effort**(`naverLandUrl(umdNm, aptNm, canonicalName)`)
  - **성공 판정법**(검증할 때 쓸 것): 검색이 단지를 찾으면 **`fin.land.naver.com/complexes/{번호}`로 리다이렉트**된다(응답 len ≈48,190). 못 찾으면 `m.land`에 머문다(len ≈55,330). 본문 문자열 매칭은 개행 때문에 헛짚기 쉬움
  - **1순위는 카카오 정식 단지명**(`canonicalName`) — 국토부명이 네이버 표기와 자주 다르다(`공작아파트`→`공작부영아파트`, `삼성래미안`→`비산삼성래미안아파트`). 지오코딩 때 이미 받는 값이라 추가 호출 0. 2026-07-29 안양 동안구 30곳 실측: 국토부명 21/30(70%) → 카카오명+동 24/30(**80%**), 진 사례 없음. 저장은 `geocode_cache.place_name`(0006)
  - canonicalName이 없을 때만 기존 괄호 2단계 처리: 안이 동·필지번호(숫자/영문/쉼표뿐 or `제?N(상가)동`)면 **통째 제거**(`한미(A1,A2,B)`→"한미"가 정확매칭, 2026-07-05 실측), 한글 들었으면 **공백으로 풀어 유지**(`동편마을(3단지)`→"동편마을 3단지" — 빼면 0건)
- 자동 갱신: `vercel.json` cron 2개 — `/api/cron/refresh`(06:00 KST) + `/api/cron/news`(06:30 KST). **Hobby 한도 = 프로젝트당 cron 2개·1일1회라 꽉 참**(추가하려면 기존 라우트에 합칠 것). 라우트의 `maxDuration=60` + 추세 워밍 40s 데드라인 가드는 **지우지 말 것**(첫 워밍 타임아웃 방지, 미완주분은 다음 실행이 이어감). 보호용 `CRON_SECRET` env — 설정 시 `Authorization: Bearer <secret>` 필요(Vercel Cron이 자동 첨부). **배포 시 반드시 설정**(미설정이면 누구나 국토부 호출 트리거 가능). 로컬은 미설정이라 curl로 바로 호출 가능. `/api/trades` 응답에 `fetchedAt`(캐시 신선도) 포함
- 스택 버전: Next.js 16 + React 19 (수동 스캐폴딩, `create-next-app` 미사용 — 기존 .md 파일 충돌 회피)
- 변경 검증: `npx next build` (컴파일/타입 + prerender) **+ `npm test`** (순수 lib, **Node 내장 `node:test` — 의존성 0**, 2026-07-25 도입). 현재 커버: `acquisitionCost`(세율 경계값)·`loanPolicy`(gap↔neededLoan 일치성)·`format`·`tradeStats`(평 환산 경계값·이상치 제외·중앙값, 2026-07-29 추가 — 총 36개). ⚠️ `node --test tests/`(디렉터리 형태)는 `MODULE_NOT_FOUND`로 **실패** → 글로브를 따옴표로: `node --test "tests/*.test.mjs"`. ⚠️ `MODULE_TYPELESS_PACKAGE_JSON` 경고는 무해 — 없애려고 `package.json`에 `"type":"module"` **추가 금지**(Next 빌드 깨짐). ⚠️ **린트는 이 프로젝트에 없다** — eslint 설정·의존성 미설치. `package.json`의 `lint` 스크립트는 Next 15 잔재라 Next 16에선 **실행 실패**(`next lint` 서브커맨드 제거 → `lint`를 디렉터리로 해석), 그래서 2026-07-25에 스크립트를 지웠다. 검증은 build+test 둘이 전부. ⚠️ `KakaoMap.js`의 `// eslint-disable-next-line react-hooks/exhaustive-deps` 8곳은 린트가 없어 **무효지만 "deps를 의도적으로 뺐다"는 표시라 지우지 말 것**(deps 함정이 이 파일의 상습 사고 지점).
  - 검증 3종의 역할이 다르다(2026-07-25 각각 실제로 다른 버그를 잡음): **`npm test`** = 계산 불변식(클램프로 교차검증이 죽는 것) / **Playwright 실측** = 레이아웃 수치(패딩 26px 초과) / **`npx next build`** = prerender 단계의 null 참조(JSX 변수화 가드). 스크린샷 눈대중은 마지막에.
- **평 표기는 공급면적 기준**(`tradeStats.toPyeong`, 2026-07-29): 실거래가 API는 **전용면적만** 주는데 사람들이 말하는 "34평"은 공급(전용+주거공용) 기준이라, 전용을 그냥 3.3058로 나누면 국평 84㎡가 25평으로 나와 어긋난다 → `전용㎡ × SUPPLY_RATIO(1.33) ÷ 3.3058`. 검증: 84.96㎡→34평(실제 공급 111.98㎡=33.9평) / 60→24 / 75→30 / 135→54. ⚠️ 단지별 전용률이 71~78%로 흩어져 **±1평 오차**가 있는 근사치다(정확히 하려면 단지별 공급면적을 따로 받아야 하는데 누락이 많아 근사로 감). ⚠️ 화면의 "N평"은 전부 이 함수를 거칠 것 — `AREA_FILTERS` 라벨(~24평/24~34평/34~54평/54평~)도 이 환산과 맞춰져 있고 `tests/tradeStats.test.mjs`가 경계값을 지킨다
- 세금·수수료(`acquisitionCost.js`): 취득세(지방세법 §11①8, 6억↓1%/6~9억 선형/9억↑3%)·지방교육세(세율×1/10, 중과 시 0.4% 고정)·농특세(**전용 85㎡ 초과만** 0.2%)·중개보수(공인중개사법 시행규칙 별표1 + VAT)·등기비. ⚠️ 등기비 `REGISTRY_RATE`/`REGISTRY_FIXED`만 **법령 아닌 경험치 근사**(채권 할인손실이 시세 의존) — 실제 견적 겪으면 이 둘만 교체. ⚠️ `householdType`이 3단계뿐이라 **`다주택`=2주택 취급**(조정 8%), 3주택 이상 12%는 미구현(사용자가 무주택/최대 1주택이라 미발생, 2026-07-25 결정)
- ⚠️ `calcMaxLoan`의 `neededLoan`은 **`maxLoan`으로 클램프하지 말 것** — 한도를 넘는 것 자체가 자금 부족 신호이고, `gap ≥ 0 ⟺ maxLoan ≥ neededLoan` 교차검증이 여기서 나온다(클램프하면 부등식이 항상 참이 돼 검증이 죽음). 월납·DSR은 실제 받게 될 `plannedLoan = min(neededLoan, maxLoan)` 기준. 월납은 **실제 금리**, DSR은 **스트레스 금리** — 둘이 다른 게 정상(HelpModal에서 설명)
- API 동작 확인: `npm run dev`(백그라운드) → 로그 "Ready" 대기 → `curl "http://localhost:3000/api/trades?lawdCd=11680&dealYmd=202605"`
- UI 시각 검증(브라우저): `npm i --no-save playwright` + `chromium.launch({channel:"chrome",headless:true})` — **설치된 크롬 사용, 브라우저 다운로드 없음**(이 머신 검증됨). 임시 `scripts/tmp-*.mjs`로 실클릭·스크린샷(temp 폴더) 후 삭제. 핀 클릭은 겹침 인터셉트 잦음 → `elementFromPoint` 히트테스트로 클릭 가능한 핀 골라 클릭. 카카오 CustomOverlay는 **뷰포트 밖이면 DOM에 없음**(타지역 ★ 검증은 줌아웃 필요). 크기/레이아웃 버그는 스크린샷 전에 `getBoundingClientRect`·computedStyle **실측부터**(시군구 304px 사고를 즉시 특정한 방법). dev 첫 페이지 방문은 온디맨드 컴파일로 느림 → `waitForSelector` 타임아웃 45s 권장(15s 타임아웃 실제 발생). 자금 색칠(ok/no 핀) 검증은 `page.addInitScript`로 `re_loan_profile` localStorage 선주입. `aria-label="닫기"`는 세부패널·모달 2개 매칭(첫 요소가 오버레이에 가려 클릭 타임아웃, 2026-07-12) → 모달은 오버레이 좌표 `page.mouse.click`으로 닫기. ⚠️ dev 스크린샷 좌하단의 검은 원은 **`nextjs-portal`(Next dev 전용 오버레이)** — 앱/카카오 요소로 오진 말 것(프로덕션엔 없음, 2026-07-25 오진 1건). 겹침 의심 시 `document.elementFromPoint(x,y)`가 그 요소를 반환하는지로 판별. 패널 겹침은 **px 부호로 판정**(`A.bottom − B.top ≤ 0` = 안 겹침), 오버레이 요소는 `getComputedStyle(e).zIndex === "31"`로 찾기. ⚠️ 이 앱은 인라인 스타일이라 클래스 훅이 `.trade-pin`·`.cx-row`뿐 → `page.$$eval("div", …)` 같은 광범위 선택자는 body를 통째로 잡아 출력이 폭발한다(엄격한 정규식으로 좁힐 것). **단지 선택은 핀 대신 `.cx-row`(리스트 행) 클릭이 가장 안전** — 겹침 인터셉트를 elementFromPoint 히트테스트보다 간단하게 피한다(2026-07-29)
- lib·외부 API 단독 검증(dev서버 불필요): 임시 `scripts/*.mjs`에서 `.env.local` 수동 파싱(`process.env` 주입)→ `await import("../app/lib/..")`→ `fetch`. 지오코딩률 측정·data.go.kr 응답 확인에 유용. `app/lib` import 시 `MODULE_TYPELESS_PACKAGE_JSON` 경고는 무해(grep로 필터). 끝나면 스크립트 삭제(커밋 금지)
  - ⚠️ **"이상해 보인다"는 증상은 원본 응답을 전수 덤프해 태그·분포부터 확인할 것.** 추세 그래프 이상치를 "표본 부족이라 어쩔 수 없다"로 넘길 뻔했는데, 원본 XML의 태그 목록을 찍어보니 `cdealType`(해제)·`dealingGbn`(직거래)이 파서에서 통째로 누락돼 있었다(2026-07-29 — 이 세션 최대 성과). 가설로 고치기 전에 원본부터.
  - ⚠️ `trades.js`는 단독 `import` 불가: 내부 `./supabaseServer`(확장자 없는 import)를 raw node가 못 찾아 `ERR_MODULE_NOT_FOUND`로 죽음. supabase 미의존 lib(`regions`/`loanPolicy`/`news`)는 OK — `news.js`는 이를 위해 `./regions.js` **확장자 import** 유지(새 lib도 이 패턴 권장). trades 계열 검증은 국토부/카카오 API를 **직접 fetch**해 우회(엔드포인트/헤더는 `trades.js`에서 복사)
- ⚠️ Git Bash에서 `curl -o /tmp/x` 한 파일을 node가 못 읽음(win 경로 불일치) → 응답은 **stdin 파이프**나 cwd 상대경로로 받을 것
- ⚠️ dev 서버 좀비: 새 `npm run dev`가 "Another next dev server is already running"으로 죽으면 stale 프로세스가 락 점유 → PowerShell `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ?{$_.CommandLine -match 'next'} | %{Stop-Process $_.ProcessId -Force}` 로 정리 (bash `pkill -f next`는 불안정)
- ⚠️ 한글 인자 API 테스트는 bash `curl`로 금지(명령줄 UTF-8 깨져 DB에 깨진 값 저장) → `node -e`의 `fetch`+`encodeURIComponent` 사용
- ⚠️ bash에서 `node -e "..."` 인라인 JS에 백틱 템플릿 리터럴 금지(명령치환으로 해석돼 bad substitution) → 문자열 연결(`'['+x+']'`)로
- ⚠️ 한글 커밋 메시지는 PowerShell here-string(`git commit -m @'...'@`)이 괄호·특수문자에서 깨져 실패 → 임시파일에 쓰고 `git commit -F <file>` (검증됨). 임시파일은 **Write 도구**로 쓸 것 — PS5.1 `Set-Content -Encoding utf8`은 **BOM을 붙여 커밋 제목 첫머리에 U+FEFF가 박힘**(2026-07-02 실제 발생). 경로는 `.git\COMMIT_MSG_TMP.txt`처럼 **.git 폴더 안**에 두면 git status에 안 잡혀 오염 없음(이전 세션 잔재가 남아 있으니 Write 전 Read 필요)
- ⚠️ PowerShell `Invoke-WebRequest .Content`는 한글 JSON을 코드페이지로 잘못 디코드 → **.NET 문자열 자체가 깨짐**(콘솔 표시뿐 아님). 읽은 한글 값을 **재요청에 쓰면 서버 매칭 실패**(추세가 0건처럼 보임) → 한글 round-trip 검증은 `node` fetch로
- 지도: SDK URL에 `&libraries=services` 필요. 좌표→지역은 `geocoder.coord2RegionCode`(대문자 R·C, 오타 주의)
- `/api/trades`는 단지별 `trades[]`(area 포함) 전체 반환 → 면적 등 추가 필터는 재요청 없이 클라(`KakaoMap.js`의 `renderMarkers`)에서 처리

## 작업 규칙
- 비밀키(API 키, Supabase 키, `.mcp.json`)는 **절대 커밋 금지** → `.gitignore` 확인 필수.
  Next.js에서는 `.env.local` 사용, `NEXT_PUBLIC_` 접두사는 클라이언트 노출되니 주의.
- 정책 규칙(LTV/DSR)은 하드코딩하되 **출처·시행일 주석**을 반드시 달 것 (나중에 갱신 추적).
- 한글 든 파일은 Read 도구로 볼 것 (PowerShell Get-Content 인코딩 깨짐).
- 주석은 한글로 **"왜"**를 남긴다. 되돌리면 안 되는 것엔 `⚠️` + 실측 날짜를 붙여 근거를 함께
  기록할 것(예: `2026-07-29 실측: 60곳 중 7곳이 비아파트 POI`). 새 코드도 이 밀도에 맞춘다.
- 진척은 이 폴더의 `PROGRESS.md`에 기록.

## Supabase
- 키 **새 형식**: `sb_publishable_`(클라, `NEXT_PUBLIC_`) / `sb_secret_`(서버, RLS 우회). 둘 다 `.env.local`.
- MCP는 secret 키 아님 → **Personal Access Token(`sbp_`)** 필요. `.mcp.json`(gitignore)에 저장, 적용엔 Claude 재시작.
- 테이블 생성(DDL): **supabase MCP `apply_migration`으로 직접 가능**(0005를 이 경로로 적용, 2026-07-08 — 7/5의 read-only 제약 해소됨). 안 되면 대시보드 **SQL Editor** 폴백. 어느 쪽이든 `supabase/migrations/`에 보관.
- 캐시: `trade_raw_cache`(월별 원본거래, 이번달 12h TTL) + `geocode_cache`(단지 좌표 + `place_name` 카카오 정식명, 0006 — 2026-07-29 MCP로 적용) + `kapt_cache`(세대수 영구, 0003 — 2026-07-05 생성 완료) + `favorites`(0004 D-day 컬럼 lease_end/note/note_date) + `news_items`(뉴스 30일 보관, 0005 — 2026-07-08 MCP로 생성 완료).
  - `place_name` 규약: **NULL=미확인**(다음 조회 때 채움) / **`""`=확인했으나 아파트 매칭 없음**(재조회 방지). ⚠️ 백필은 요청당 `PLACE_NAME_BACKFILL_LIMIT`(40)로 **상한**을 둔다 — 없으면 0006 직후 첫 방문이 지역 전체(수백 곳)를 재지오코딩하다 함수 타임아웃(Vercel 기본 10s). 좌표는 이미 있어 나눠 채워도 화면은 정상(실측 33→63→94→105/132로 수렴). ⚠️ 백필 재조회가 실패하면 **캐시 좌표를 유지**할 것(null로 덮으면 멀쩡한 핀이 사라짐) 구 `trade_cache`(geocoded payload)는 미사용. 지오코딩은 `geocodeMany`=캐시 1회 일괄조회+미스만 병렬(단건 순차조회 금지). ⚠️ 카카오 결과는 **아파트 카테고리(`주거시설 > 아파트`)를 우선 선택**할 것 — 첫 결과를 그냥 쓰면 단지 안의 전기차충전소·관리사무소·어린이집에 핀이 꽂힌다(2026-07-29 안양 동안구 60곳 실측: 다른 동 0건·실패 0건인데 **7곳이 비아파트 POI**). 이 선택이 `place_name`(네이버 딥링크용)도 겸한다.
- 운영 테이블 **대량 delete는 자동 권한 분류기가 차단**(2026-07-12 news_items 비수도권 정리 시도) → 조회 필터 + TTL 프루닝 자연소멸 같은 **비파괴 경로로 설계**할 것.
