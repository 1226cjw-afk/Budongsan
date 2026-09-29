# Budongsan — 부동산 지도/대출 비교 웹앱

## 한 줄 소개
지도 위에 국토부 실거래가 매물대를 띄우고, 내 자산 대비 LTV/DSR 설정에 따라
대출 가능 여부·필요 대출액을 계산해 비교해주는 개인용 부동산 웹앱.
참조 서비스: 네이버 부동산 / 아파트실거래 / 호갱노노 (데이터는 직접 가져오지 않고 같은 원천에서 수집).

## 명령어 (상세·함정은 개발 메모 참조)
```bash
npm run dev                      # http://localhost:3000 (카카오에 등록된 도메인이어야 지도가 뜸)
npx next build                   # 컴파일·타입·prerender — 변경 검증 필수 1
npm test                         # node:test 181개 — 변경 검증 필수 2 (린트는 이 프로젝트에 없음)
```
⚠️ `app/`·`tests/` 편집 시 PostToolUse 훅이 `npm test`를 자동 실행한다(1.5초, `.claude/hooks/test-on-edit.js`).
실패하면 실패한 테스트 이름·줄이 차단 사유로 돌아온다. `npx next build`는 느려서 훅에 안 넣었다 — 커밋 전 수동.
⚠️ 검증은 build+test **둘 다**. 셋째 축은 Playwright 실측(레이아웃 수치) — 각각 다른 버그를 잡는다.

## 현황 (2026-08-31)
MVP~3단계 + 네이버식 단지 리스트 패널(1년 상승률·재건축연한·자금여유 배지/정렬)
+ 📰 데일리 뉴스 탭(/news, cron 자동수집)까지 **배포 완료, 실서비스 가동 중**.
**2026-07-25**: 필요자금에 부대비용(취득세·중개보수·등기비) 반영 + 월 상환액·DSR% 표시,
월상환액 상한 필터, "얼마 더 모으면 되나", /news를 **오늘의 브리핑**으로 승격
(관심 단지 변동·일정·영향 뉴스), 모바일 겹침 해결(상단 1줄 바 + 하단 시트 단일 슬롯).
**2026-07-29 정확도·조작감 정비**: 평 표기를 **공급 기준**으로(84㎡=34평), 시세에서
**해제거래·직거래 제외**, 추세 그래프 **중앙값**, 네이버 딥링크를 카카오 정식 단지명으로
(70%→80%), 지도 idle 디바운스+프로그램 이동 억제(지역 오전환 해소), 마커 오버레이 재사용
(자금 입력 중 DOM 유지), 마지막 위치 복원 + 📍 현위치, 모바일 상단바 🔄 갱신.
**2026-08-04 /news를 오늘의 상황판으로**: 📊 시장 신호(해제·직거래·거래량·법인 — 시세에서
걸러낸 거래를 지표로 되살림) · 🆕 새 거래 피드(★단지/관심지역 2탭, 각 행에 내 자금 판정) ·
🏗 청약 레이더(수도권 분양·무순위 접수 임박순). 카드는 `components/briefing/`로 분리.
**2026-08-05 브리핑 안정화**: 신규 카드 소멸 버그(빈 상태 판정에 signal·feed 누락) +
청약 fetch 직렬화 + 청약 마감 UTC 판정 수정.
**2026-08-07 브리핑 페이로드 캐시**: `/api/briefing`을 지문 기반 캐시로
(prod 미스 1.9~2.6s → 히트 0.67~1.1s). 서버 D-day KST 교정 동반. 상세는 개발 메모.
**2026-08-14 소스↔문서 대조 감사**: build·test가 못 잡는 **호출부 결함 2건**을 찾아 수정 —
① 세부패널이 `loanForPrice(gp)`로 area를 빠뜨려 85㎡ 초과 평형의 **농특세가 통째로 누락**
(11억 40평 −220만원, 리스트 배지와 카드 숫자가 갈림) ② 추세 그래프 **선만 평균**으로 그려짐
(2026-07-29 중앙값 전환이 폴리라인 한 줄을 놓침). 그 외 브리핑 캐시에 `PAYLOAD_VERSION`
탈출구 신설, KST 오프셋 4벌을 `format.kstDate()` 하나로 통합(+구조 가드 테스트).
**2026-08-15 청약 레이더 확장 + 즐겨찾기 관리**: ① ★ 서랍에 🗑 신설 — 필터에 걸린 ★ 단지는
지도에서 사라져 **해제 경로가 아예 없었다**(구로구 예원아파트 실제 발생) ② 청약에 **LH 공고**
합류(행복주택·매입임대·든든전세 — `lib/lhNotice.js`, 활용신청 승인·가동 중) ③ 청약 카드에 **분양가 +
내 자금 판정 배지**(`getAPTLttotPblancMdl`, 지금 키로 이미 열림) ④ 특별공급 접수일 반영
⑤ `pyeongFromSupply` 신설(청약은 공급면적을 직접 준다). 마이그레이션 0009. 상세는 개발 메모.
**2026-08-30 2차 전체 리팩토링 + 버그 2건**: `KakaoMap.js` **1791→1156줄**(화면 조각 →
`components/map/` 6개, 순수 파생 → `lib/complexRows.js`·`mapFilters.js`). ① 마커·리스트가
같은 계산을 **각자** 하던 것을 한 배열 공유로(계산 2회→1회, 갈라짐 구조적 차단) ②
`calcMaxLoan` 호출부 4곳 → `loanCalcFor` 어댑터 하나로(농특세 사고의 구조적 원인 제거).
버그: **마커만 옛 필터로 굳는 stale 클로저**(로딩 중 필터 변경 시) · **비과세 D-day가 UTC
자정 기준이라 당일 아침 D-1**(+윤년 2/29→3/1). 테스트 83→106. 마이그레이션 없음.
**2026-08-31 뉴스 탭 최근 7일 + 중요도 색 구분**: `/api/news`를 KST 7일로 자르고
(`format.addDaysYmd()` 신설 — 프루닝은 `fetched_at` 기준이라 발행일 2024년 행이 DB에 남아
있었다), `news.newsPriority()`가 제목에서 **필독/주목/일반**을 판정해 행 왼쪽 컬러바·배지·
`🔴 필독` 칩으로 보여준다. 임계값과 정치·논평 감점은 **실측 240건으로 정함**(필독 9.6% =
하루 3.8건) — 근거·후보 비교표는 `PROGRESS.md`. 테스트 106→122. 마이그레이션 없음.
**2026-09-02 📢 뉴스 요주의 단지**: 뉴스에 반복 등장한 단지를 브리핑 카드로 띄우고
**지도로 보내** ★를 담게 한다(★ 담기의 입구가 그동안 비어 있었다). `lib/newsWatch.js` 신설 —
제목에서 단지명 추출·집계(DB 컬럼 0·추가 요청 0). ⚠️ **기존 키워드 8개는 단지명을 한 건도
물어오지 않아**(실측 238건 중 0건) `BASE_KEYWORDS`에 단지 축 6종을 실측으로 골라 추가했다.
⚠️ 뉴스 이름과 실거래명이 안 맞아(`구로주공`↔`주공1`) **★를 직접 담지 않고 지도 이동만** 한다.
`ComplexList` 이름 검색 + `/?lawdCd=&q=` 딥링크 신설. 테스트 122→159. 마이그레이션 없음.
**2026-09-04 지도 초기 로딩 병렬화**: 첫 지역 판정(딥링크·복원 위치)이 **카카오 SDK 로드
콜백 안에** 있어 지도와 무관한 `/api/trades`·`/api/rank`가 SDK를 기다리던 것을 부트스트랩
effect로 분리(`ready` → `booted`). 실측 trades 출발 1,749→**411ms**, 첫 행 노출
2,415→**779ms**(로컬 prod 빌드·워밍·중앙값), prod 첫 행 4,186→**3,005ms** — 목록이 지도보다
먼저 뜬다. ⚠️ 그 결과 **병목이 `/api/trades` 응답(prod 2.1초)으로 옮겨갔다** — 지도 첫 화면을
더 당기려면 클라이언트가 아니라 이 라우트를 볼 것.
⚠️ 같이 잡은 버그: **딥링크가 현위치에 덮였다** — 현위치를 허용해 둔 사용자에겐 📢 요주의
단지 링크가 엉뚱한 지역에 착지해 **빈 목록**을 보여줬다(prod 재현). 테스트 159 유지,
마이그레이션 없음.
**2026-09-29 탭 셸 + 🔥 핫플**: 사용자 요청 "지도·리스트·세부·뉴스 사이 이동이 부자연스럽다" +
"오늘/이번 주 핫플 아파트". ① **지도가 한 번만 뜬다** — `app/(main)` 라우트 그룹 + `AppShell`이
`KakaoMap`을 늘 마운트하고 🔥 오늘(`/news`)·📰 뉴스(`/news/list`)를 keep-alive 패널로 덮는다(페이지는
`null`, 모바일 하단 탭바 / 데스크톱 세그먼트). 예전엔 `<a href>` 이동이라 탭마다 전체 새로고침이었다.
실측: 지도→오늘→뉴스→지도 왕복 후 핀 DOM 동일, `/api/trades` 재요청 0. ② **모바일 시트 스택** —
목록이 늘 바닥에 뜨고(peek 64/half 50vh/full) 상세가 그 위에 쌓인다(`← 목록`·뒤로가기로 목록 복귀,
스크롤 보존), 선택 핀은 상단 바~시트 사이로 panTo. ③ **오늘 탭 재배치** — 🔥 핫플 맨 위, 📊 시장 신호는
지역당 한 줄(모바일 ≈1,600→228px), 📢 요주의 단지는 핫플 '뉴스' 칩으로 흡수, 💰 영향 뉴스는 뉴스 탭으로.
④ **🔥 핫플** — 신고일 기준(계약일 창은 신고 지연으로 비어 있다: ★ 5곳 최근 7일 계약 10건).
`fetchRawMonths` 재수집 지점이 새로 나타난 거래를 `trade_reports`(0010)에 기록, cron이 서울·경기 전역
68곳을 매일 재수집(로컬 13.9s), `/api/hot`이 집계, 칩(종합·거래·가격·뉴스)은 `lib/hotRank.js`.
⚠️ **가점·임계값은 임시값** — 7일치 쌓이면 실측으로 확정(PROGRESS 백로그). 테스트 159→181.
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
  - ⚠️ **12억 이상 거래는 수집 단계에서 버린다**(`trades.js`의 `MAX_AMOUNT = 120000`만원, 2026-08-14 문서화 — 코드엔 처음부터 있었으나 미기재였다). 개인 예산 범위 밖이라 내린 결정이고 `PRICE_FILTERS` 상단(9~12억)과 맞물려 있다. ⚠️ 컷이 **캐시 저장 전**에 걸리므로 `trade_raw_cache`에도 12억 미만만 남는다 → 이 캐시를 읽는 모든 것이 영향을 받는다: **📊 시장 신호의 "거래량"은 그 지역의 진짜 거래량이 아니라 12억 미만 거래량**이고, 추세·상승률도 같은 모집단이다. 강남권처럼 고가 비중이 큰 지역을 다루게 되면 이 상수부터 올릴 것 — 올리면 **기존 캐시는 자동으로 안 채워진다**(`lacksDealFlags`는 필드 부재만 보지 금액 컷은 모름) → 해당 지역을 `?refresh=1`로 재수집해야 한다
  - ⚠️ 응답엔 **시세가 아닌 거래가 섞여 있다** — `cdealType="O"`(계약 해제, 취소된 거래) / `dealingGbn="직거래"`(가족간 증여성 다수). 2026-07-29 안양 동안구 실측: 697건 중 해제 10·직거래 21, 직거래는 같은 평형 중개거래 평균 대비 **−41%~+24%**로 튐. `tradeStats.excludeAbnormal()`이 걷어낸다(아래 참조)
- **지도 표시**: 카카오맵 API (확정) — 주소→좌표 변환은 카카오 로컬 API 사용
- **LTV/DSR 정책**: 공식 API 없음 → 규제지역/한도/금리 규칙을 코드로 직접 구현하고,
  정책 변경 시 수동 업데이트 (규칙 출처·시행일을 주석으로 남길 것)

## 핵심 기능 (전부 구현됨)
지도+실거래 마커 · 평형별 대출 계산(LTV/DSR)·구매가능 색칠 · 즐겨찾기+cron 자동갱신 ·
단지 리스트 패널(상승률/재건축/자금 정렬·배지) · 추세 차트(1·3년) · 오늘의 브리핑 탭(/news) · 모바일 반응형.
초기 목표·단계별 이력은 `PROGRESS.md` 참조.

## 개발 메모
### 실행·배포
- 실행: `npm run dev` → http://localhost:3000 (카카오 디벨로퍼스에 이 도메인 등록돼 있어야 지도 뜸)
  - ⚠️ **폰 실기기 검증은 LAN IP(`http://192.168.x.x:3000`) 불가** — 카카오에 미등록 도메인이라 지도가 안 뜬다. 등록된 건 `localhost:3000`과 prod URL 뿐 → 실기기 확인은 **배포 후 prod URL**이 가장 빠름(또는 크롬 F12 기기 에뮬레이션은 localhost라 OK)
- **배포(가동 중)**: Vercel **대시보드** 방식 → https://budongsan-virid.vercel.app (env 7종 등록·카카오 Web 도메인 등록 완료). ⚠️ **Vercel CLI는 이 머신 불가**(한글 계정명→illegal HTTP header). REST 키엔 IP 제한 걸지 말 것(Vercel IP 동적)
  - GitHub `main`에 push하면 Vercel이 **자동 재배포**(대시보드 연결됨). env 변경은 Vercel 대시보드 Settings → 변경 후 Redeploy 필요. `vercel.json` cron은 push 시 자동 반영
  - 배포 반영 확인(CLI 불가): prod 홈 HTML의 `/_next/static/chunks/*.js` 파일명 해시가 배포마다 바뀜 → push 후 해시 변하는지 폴링해 안착 확인. 번들 grep은 **문자열 리터럴/CSS클래스**로(JS 변수·함수명은 minify로 사라짐). ⚠️ **서버 코드만** 바뀐 배포(API/lib)는 청크 해시가 **안 변함**(클라 번들 동일, 2026-07-02 확인) → `gh api repos/1226cjw-afk/Budongsan/commits/<sha>/status`의 Vercel context가 success("Deployment has completed")인지로 확인
  - ⚠️ push 전 `git log origin/main..main` 확인 — `main`이 **이전 세션의 미push 커밋**을 들고 있을 수 있어 push 한 번에 예상보다 많이 배포된다(2026-07-25: 세션 전부터 미push였던 `51b8d09`이 함께 나감 / 2026-08-05: **17커밋**이 누적돼 시장 신호·새 거래 피드·청약 레이더가 통째로 미배포 상태였다). ⚠️ **"웹에서 개선이 안 보인다"는 문의를 받으면 코드를 뒤지기 전에 `git log origin/main..main`부터 볼 것** — 새 라우트가 있으면 `curl -o /dev/null -w '%{http_code}' <prod>/api/<새라우트>`가 404인지로 1초에 판별된다
### 구조 · `KakaoMap.js` 함정 (이 파일의 상습 사고 지점)
- 구조: App Router. 지도/세부패널은 `app/components/KakaoMap.js`(클라이언트, SDK `autoload=false`로 동적 로드). **2026-07-12 리팩토링으로 분리**: 스타일 상수 → `components/mapStyles.js`(팔레트·그림자는 `lib/palette.js`, 뉴스 페이지와 공유) / 추세차트·도움말 모달 → `components/TrendChart.js`·`HelpModal.js` / 순수 헬퍼 → `lib/format.js`(포맷터·D-day)·`lib/tradeStats.js`(집계·필터)·`lib/naverLand.js`(딥링크). **2026-07-25 추가**: 브리핑 3카드 → `components/Briefing.js` / 모바일 상단바·시트 셸 → `components/MobileShell.js`. **2026-08-04 브리핑 분리**: `components/briefing/`(카드별 파일 + 공통 `styles.js`) + `components/StatTile.js`, `Briefing.js`는 fetch·localStorage·빈 상태 판정만 남은 컨테이너 — ⚠️ 카드를 더 얹을 땐 `Briefing.js`에 JSX를 쌓지 말고 `briefing/`에 파일을 추가할 것. ⚠️ 다만 **fetch는 카드가 아니라 `Briefing.js`에서** 하고 데이터는 prop으로 내릴 것 — 카드는 로딩 게이트(`data === null`) 뒤에 마운트되므로 카드 안에서 부르면 무관한 요청이 직렬화된다(2026-08-05 실측: briefing 1497ms 종료 → 1650ms에야 `/api/subscription` 시작 → 카드 노출 1907ms). ⚠️ 로딩 중 `return null` 금지 — 브리핑 영역이 0px였다가 카드가 한꺼번에 나타나 뉴스 목록을 밀어낸다(≈1.9s 뒤 레이아웃 점프) → 스켈레톤으로 자리를 잡아둘 것. ⚠️ **빈 상태 판정에 `signal`·`feed`를 반드시 포함**할 것 — 이 둘은 ★ *단지*가 아니라 관심 *지역* 기준이라, `complexes`/`upcoming`만 보면 ★ 단지에 최근 30일 거래가 없을 때 내용이 있는데도 두 카드를 버리고 "★를 담으세요" 안내를 띄운다(2026-08-05 수정: ★ 4곳 최신 거래가 7/18이라 8/17이면 신호 4개 지역·피드 60건이 사라질 예정이었음). 테스트는 `tests/*.test.mjs`(순수 lib만 — 커버 범위는 아래 "변경 검증" 참조). **2026-08-30 2차 리팩토링**: 지도 화면 조각을 `components/map/`로 분리(`ControlPanel`·`ComplexList`·`DetailPanel`·`PyeongCard`·`ProfileDrawer`·`FavoriteDrawer`) + 순수 파생을 `lib/complexRows.js`·`lib/mapFilters.js`로 → `KakaoMap.js` **1791→1156줄**. 남은 것은 지도 SDK·상태·데이터 로딩·마커 렌더뿐이다. ⚠️ `KakaoMap.js`는 1691→1263줄(2026-07-12)로 줄었다가 **1791줄까지 되자랐고**(2026-08-15) 다시 1156줄로 깎았다 — **두 번 같은 일이 일어났다**. 새 기능을 넣을 땐 이 파일에 쌓기 전에 분리 가능한지 먼저 볼 것(화면 조각이면 `components/map/`에, 계산이면 `lib/`에)
- `KakaoMap.js` 마커 함정: 마커는 `useEffect([ready, baseRows, tradesData, lawdCd, favorites])`→`renderMarkers(baseRows)`로 그림. 마커에 영향 주는 새 입력은 대부분 `baseRows` useMemo의 deps(`[tradesData, area, price, monthly, priceBasis, rank, loanKey, favSet, affordMode]`)에 추가하면 된다 — 행에 안 들어가는 입력만 마커 effect deps에 직접 넣을 것. ⚠️ **`loadTrades`에서 `renderMarkers()`를 직접 부르지 말 것**(2026-08-30 제거). 예전엔 fetch가 끝난 자리에서 바로 그렸는데, 그 함수는 **호출된 렌더의 클로저**를 들고 있어 로딩 중 사용자가 필터를 바꾸면 **바뀌기 전 필터로 마커를 그리고 끝났다**(리스트는 최신이라 둘이 갈라지고, 이후 deps가 안 바뀌어 그대로 굳는다). 렌더 경로는 effect 하나뿐이어야 한다. ⚠️ deps의 `loanKey`는 자금 입력을 추린 **문자열 키**다 — `profile` 객체를 그대로 넣으면 자금 칸에 한 글자 칠 때마다 객체가 새로 생겨 마커 전량이 다시 그려진다(버벅임의 주원인, 2026-07-29 수정). 자금 관련 새 입력이 마커에 영향 주면 **`loanKey` 배열에 추가**할 것. ⚠️ 이 effect의 `dataRef.lawdCd !== lawdCd` 스킵 **stale 가드는 지우지 말 것** — 지역 전환 중 deps가 먼저 바뀌면 옛 지역 데이터로 `setBounds`가 실행돼 `fitRef`를 소진 → 지도가 새 지역으로 안 움직여 **idle 핸들러가 지역을 되돌리는 레이스**(2026-07-02 실제 발생, rank 로드가 트리거). ⚠️ `panTo`(애니메이션)와 `fitRef=true`(로드 후 setBounds)를 **같이 걸지 말 것** — 캐시가 빠르면 setBounds 위로 panTo가 마저 진행돼 화면이 밀림(2026-07-03 실제 발생) → 이동+지역전환은 `gotoFavorite`처럼 `setCenter`+`setLevel(5)`+`fitRef=false`로
- ⚠️ **데이터 로드는 `ready`가 아니라 `booted`를 기다린다**(2026-09-04). 첫 지역 판정(딥링크 `?lawdCd=` > `re_map_view` 복원 > 기본값)이 원래 `kakao.maps.load()` 콜백 **안에** 있어서, 지도와 아무 관계 없는 `/api/trades`·`/api/rank`가 SDK 로드를 기다렸다(실측: 게이트가 없는 `/api/favorites`는 401ms에 출발하는데 같은 페이지의 `/api/trades`는 1,749ms — **1.26초** 손실). 지금은 부트스트랩 effect가 마운트 직후 `location.search`·`localStorage`만으로 지역을 정하고 `booted`를 올린다 → trades 411ms 출발, 첫 행 노출 2,415→779ms. ⚠️ **부트스트랩 effect는 지도 초기화 effect보다 위에 선언돼 있어야 한다** — effect는 선언 순서로 실행되고 `initMap`이 `initialViewRef`를 읽는다. ⚠️ **마커 렌더 effect의 `ready` 게이트는 `booted`로 내리지 말 것** — 데이터가 SDK보다 먼저 오는 순서에서 이게 유일한 안전장치다(먼저 온 데이터는 `tradesData`에 앉아 기다리고 `fitRef`는 지도가 생긴 뒤 소비된다). 내리면 옛 지역 좌표로 `setBounds`가 돌아 지역 되돌림 레이스가 되살아난다. ⚠️ 첫 방문 현위치 호출은 `if (!saved && !link)`다 — **딥링크일 땐 부르면 안 된다**. `saved = link ? null : readSavedView()`라 딥링크면 `saved`가 null이고, `!saved`만 보면 현위치를 묻는다 → 허용해 둔 사용자는 `setLawdCd(현위치)`가 링크 지역을 덮어 📢 요주의 단지가 빈 목록이 된다(2026-09-04 prod 재현: 구로구 링크 → 강남구 착지, 0곳). 원인은 `saved`를 "저장된 위치"와 "현위치를 물어도 되는 상태" 두 의미로 겸용한 것.
- `KakaoMap.js` 지도 이동/지역 전환 (2026-07-29 재정비 — 여기를 건드릴 땐 셋 다 유지):
  - **코드가 지도를 옮길 땐 반드시 `moveMap(fn)`으로 감쌀 것**(`setCenter`/`setBounds`/`panTo`/`setLevel`). `suppressIdleRef`에 시각을 찍어 그 이동이 만든 idle이 **지역을 재판정하지 않게** 막는다. 안 감싸면 "지역 선택 → 지도 이동 → 그 idle이 다시 판정 → 원래 지역으로 복귀"하는 자기참조 루프가 살아난다(위 stale 가드는 이 증상의 *일부*만 막았음)
  - idle → 지역 판정은 **`IDLE_SETTLE_MS`(400ms) 디바운스**. 팬 도중 매 idle마다 지오코더를 호출하고 시군구가 바뀔 때마다 전체 재로드가 걸리던 것이 버벅임의 다른 축이었다
  - 자동 전환 시 `regionToast`로 알리고 **↩︎되돌리기**를 준다(조용히 갈아끼우지 않음). 사용자가 직접 고른 경로(`selectRegion`/`gotoFavorite`)는 토스트를 끈다
  - 마지막 뷰는 `re_map_view` localStorage(`{lawdCd,lat,lng,level}`) — idle마다 + 지역 변경 effect에서 저장, 초기화 때 복원(복원 시 `fitRef=false`로 자동맞춤이 덮지 않게). ⚠️ localStorage는 **마운트 이후에만** 읽을 것(useState 초기값으로 읽으면 하이드레이션 불일치). 저장값이 없는 첫 방문에만 `locateMe({initial:true})`로 현위치를 묻는다
  - `renderMarkers`는 오버레이를 **재사용**한다(`overlaysRef`는 `Map(key→{overlay,el})`). 새 핀 종류를 추가할 때도 `upsert()`를 쓸 것 — 전량 파괴/재생성으로 되돌리면 필터 변경마다 DOM 수백 개가 다시 만들어진다. 키에 **`lawdCd`를 포함**해야 지역 전환 시 동명 단지가 남지 않는다
- `KakaoMap.js` 레이아웃:
  - **탭 셸(2026-09-29)**: `app/(main)/layout.js` → `components/AppShell.js`가 `KakaoMap`을 **늘** 마운트하고 🔥 오늘(`TodayView`)·📰 뉴스(`NewsList`)를 한 번 연 뒤 계속 살려 둔다(페이지 3개는 URL만, `null` 렌더 — 탭 판정은 `usePathname`). ⚠️ **탭 이동은 `next/link`만** — `<a href>`는 전체 새로고침이라 지도 SDK·실거래·선택 단지를 버린다(이 셸을 만든 이유). ⚠️ **`KakaoMap`을 조건부 렌더하지 말 것.** ⚠️ keep-alive 패널 숨김은 `visibility`(`display:none`은 스크롤을 잃는다). ⚠️ `/api/news`는 셸(`useNewsFeed`)이 한 번 받아 두 탭이 공유. ⚠️ 오늘 탭 → 지도는 **`useShell().focusComplex({lawdCd, aptNm})`만** — 지도는 리마운트되지 않으므로 `location.search` 딥링크는 콜드 로드 때 한 번만 읽힌다. `focusComplex`는 `selectRegion` 경로 + `pendingPickRef`(= **착지 지역 코드**, 그 지역 `tradesData`가 온 뒤에만 소비 — boolean이던 시절엔 검색어가 먼저 바뀌어 이전 지역 목록에서 기회를 써 버렸다, 2026-09-29 실측)를 재사용한다. ⚠️ keep-alive라 마운트 때 한 번 읽는 값은 낡는다 — 자금 프로필은 `useLoanProfile`(KakaoMap이 `PROFILE_EVENT`를 쏜다), 브리핑은 탭 재진입 시 조용히 재조회. ⚠️ 딥링크 재발동 방지는 `LINK_SEEN_KEY`(sessionStorage, pagehide 때 기록) — 탭 이동 뒤 Next가 첫 로드 URL(`/?lawdCd=…`)을 되살리는 걸 replaceState·router.replace 어느 쪽으로도 못 막았다(실측 4가지 실패).
  - **모바일 시트(2026-09-29 재구성, 원형은 07-25)**: 상단 = 고정 높이 **1줄 바**(`MobileShell.MobileTopBar` — 짧은 요약 + 🔄 + ⚙️), 바닥 = **지도 시트**(`map/MapSheet.js` — 목록 `listSnap: peek|half|full`, 상세는 그 위에 쌓임), ⚙️ = 백드롭 있는 **설정 시트**(`settingsOpen`). 설정이 열리면 지도 시트를 렌더하지 않는다 = **겹침 구조적 불가**(예전 단일 슬롯 `sheet`의 성질 유지 — 그땐 상세가 목록을 *대체*해 닫으면 빈 지도로 떨어졌다). 상세 열림 = `history.pushState({...history.state, reSheet})` → 뒤로가기가 상세를 닫는다(⚠️ `history.state`를 펼칠 것 — Next 상태가 빠지면 popstate에서 새로고침). 모바일 `selectComplex`는 핀보다 `innerHeight/4` 아래를 panTo 목표로 잡아 핀이 시트 위 빈 영역에 온다(실측 핀 top 169px/844). ⚠️ z-index는 `mapStyles.Z`(MAP/TOPBAR/BACKDROP/SHEET/PANEL/TABBAR/MODAL) **상수로만** — 새 오버레이는 반드시 등록. 시트·📍·패널은 `TABBAR_H`(56) + safe-area 위에 앉는다. ⚠️ `mobileSheet`에 `boxSizing:"border-box"` 필수(globals.css에 전역 리셋 없어 `maxHeight`가 패딩 26px 제외 → 70vh 초과, 2026-07-25 실측). ⚠️ 세부패널 `closeBtn`(absolute)은 시트에서 좌표가 어긋나 `!isMobile`일 때만 렌더 — 모바일은 백드롭 탭/그립으로 닫음. ⚠️ `controlPanelContent` 안에 넣은 UI는 **모바일에서 ⚙️ 시트를 열어야만 보인다** — 상시 노출이 필요한 알림/배너는 시트 밖(상단 바 아래)에 별도 렌더할 것(부대비용 안내 배너가 이 이유로 모바일에서 안 보임 — 2026-07-25 사용자 확인 후 **그대로 두기로 결정**, 고치지 말 것. 새로 만드는 알림에만 적용할 규칙)
  - ⚠️ 지도 위 떠 있는 버튼(📍 현위치 등)은 **데스크톱에서 `right` 정렬 금지** — 세부패널(`right:14, width:320`, 전체높이)이 덮어 클릭이 안 된다(2026-07-29 실측 `clickable:false`). 좌우 패널 사이 빈 지도 영역(`left:368`)에 두고, 모바일은 시트가 **닫혔을 때만** 우하단에 렌더
  - ⚠️ `controlPanelContent`·`detailContent`처럼 JSX를 **변수로 뺄 때는 null 가드 필수** — JSX는 생성 시점에 children 표현식이 평가되므로 `const detailContent = selected && detail && (…)` 없이 두면 `selected.aptNm`이 터진다(렌더 안 `{selected && …}`에 감싸여 있을 때는 안전했음). 빌드의 prerender 단계가 잡아준다
  - 좌측 패널 = **네이버식 단지 리스트**(데스크톱 전체높이 / 모바일은 시트 `list` 슬롯) — `listRows` useMemo(**`tradesData` 반응형 사본** 기반, dataRef 아님) + 정렬 6종 + 배지(🔥상승률 15%↑·🏗준공30년↑·✓자금여유), 세대수는 상위 30행만 lazy(중복방지 `infoInflightRef` Set은 **요청 settle 시 finally로 해제 필수** — 안 하면 rank 도착으로 `listRows`가 로드 직후 바뀌며 조회가 중단→키가 남아 세대수가 세션 내내 안 뜸, 2026-07-21 수정)
  - 모바일 분기는 `isMobile`(matchMedia 640px)+인라인스타일 스프레드(미디어쿼리 아님). 시트 안에 들어가는 패널은 `bare`(position:static·배경/그림자 제거) 스프레드로 껍데기를 벗김
  - 세부패널은 **평형 카드가 추세 선택기** — 카드 클릭 시 그 카드 안에 추세차트 인라인(`trendArea`+`trendMonths` 12/36), 별도 "시세 추세" 섹션 없음
  - ⚠️ 컨트롤 패널은 **세로 flex 전체높이** — 직계 자식 공유 스타일에 `flex:1` 금지(세로로 성장, 시군구 select 304px 사고 2026-07-03; 가로 행에서만 사용처에서 덧씌울 것)
  - 토글쌍 스타일(`xxx`/`xxxOn`)은 `xxxOn`이 `borderColor`만 덮으면 shorthand `border` 금지(React dev 경고 → `pillBtn`처럼 비shorthand). **스타일 상수 추가 전 `components/mapStyles.js`에서 이름 grep 필수** — 중복 정의 시 dev 컴파일 에러(`newsLink` 충돌 실제 발생 2026-07-08). 마커/리스트의 자금 여유 계산은 **`bestFit()` 한 곳 공유**(색칠=여유≥0). ⚠️ `bestFit`은 `{gap, monthly}`를 **같은 평형에서** 뽑아야 한다 — 평형을 넘나들며 고르면 "A평형은 살 수 있고 B평형은 월납이 싸다"는 이유로 못 사는 단지가 통과. ⚠️ **평형 한 장의 대출 계산은 `loanForGroup(g)` 하나만 쓸 것**(2026-08-14 신설) — 기준가 선택(`priceBasis`)과 **`area`(=`g.m2`) 전달**이 여기 한 번만 적힌다. 예전엔 세부패널이 같은 계산을 따로 적으면서 `loanForPrice(gp)`로 area를 빠뜨려, 전용 85㎡ 초과 평형에서 **농특세(0.2%·중과 0.6%)가 통째로 빠졌다**(실측 11억 40평 −220만원 / 12억 54평 −238만원 → 같은 평형인데 리스트는 "부족", 카드는 "여유"). 결정적 증거는 카드 안 "농어촌특별세 (85㎡ 초과)" 행이 **한 번도 렌더된 적 없는 죽은 코드**였다는 것. ⚠️ 이 계열(호출부가 인자를 빠뜨림)은 **build도 `npm test`도 못 잡는다** — lib 테스트는 통과하는데 호출부만 틀리기 때문. 죽은 UI 분기가 보이면 그게 신호다
  - 갈아타기: 프로필 `owned`(평형 카드 "보유 지정" 토글, 기준가 스냅샷) — **`assets`가 여유현금+매도 실수령 합산으로 재정의**돼 구매가능 색칠·자금 여유순·평형 비교에 자동 전파
  - **자금 관련 새 입력은 두 곳에만**: `assets` 정의(자기자금 쪽) / `calcMaxLoan`의 `requiredCash`(비용 쪽). 이 둘이 마커 색칠·리스트 배지·평형 카드·브리핑까지 전부 먹이는 단일 소스라 호출부에서 따로 더하지 말 것
- `KakaoMap.js` 핀: 색은 `<style>`의 `.trade-pin--fav/ok/no`(자금설정 시 ok=초록/no=빨강 우선, 즐겨찾기는 ★, 급등은 🔥 프리픽스). 타지역 즐겨찾기는 `.trade-pin--away`(점선링) — `favoritesRef`(좌표 포함 전체목록)로 **현재지역 밖만** 렌더, 클릭 시 `gotoFavorite`로 이동
- ⚠️ **즐겨찾기 해제(🗑)는 ★ 서랍에 반드시 남겨둘 것 — 지우지 말 것**(2026-08-15 신설). 지도만으로는 못 지우는 ★가 실제로 생긴다: 단지 핀은 `filterTrades`를 통과한 거래가 있어야만 그려지고(면적·가격 필터), 타지역 ★ 폴백은 **현재 지역을 제외**한다 → 그 지역에 있는 동안 필터에 걸리면 핀이 아예 없고, 세부패널의 ★ 버튼은 단지를 선택해야 열리므로 **도달 자체가 불가능**하다. 구로구 예원아파트로 실제 발생(거래·좌표 모두 멀쩡했고 94.63㎡ = 공급 38평이라 "24~34평" 필터 하나로 재현). `removeFavorite`은 **지도 상태에 전혀 의존하지 않는다**. 교훈: 담을 때 지도 상태가 필요한 건 자연스럽지만 **뺄 때는 절대 그러면 안 된다**
### lib 코드 위치 · API 라우트 · 외부 연동
- 코드 위치: `app/lib/`에 로직 집중 — **서버 전용(supabase 의존)**: `trades.js`(수집·지오코딩·캐시), `kapt.js`(세대수), `briefing.js`(브리핑 집계 `buildBriefingPayload` + 캐시 판정 `getBriefing` — 라우트와 cron 워밍이 공유), `supabaseServer.js`(+`noDbResponse`) / **클라 공용**: `briefingCache.js`(브리핑 지문 — 순수 `buildFingerprint`. 서버만 쓰지만 supabase 미의존이라 테스트 가능), `regions.js`(서울25+경기 + 지역검증), `loanPolicy.js`(LTV/DSR·월납·필요자금), `acquisitionCost.js`(취득세·중개보수·등기비 — `loanPolicy`가 import), `news.js`(뉴스 수집·수도권 필터·분류 + **중요도 `newsPriority`** — 아래 참조), `newsWatch.js`(📢 요주의 단지 — 제목에서 단지명 추출·집계, 아래 참조), `applyhome.js`(청약홈 분양정보 — 아래 참조), `lhNotice.js`(LH 공공임대 공고 — 아래 참조), `marketSignal.js`(시장 신호 집계), `briefingSeen.js`(브리핑 🆕 판정, localStorage — 지도 배지와 공유), `format.js`(포맷터·D-day + ⚠️ **`kstDate()` — KST 달력 날짜의 단일 지점**, 아래 참조 + `addYearsYmd()` "n년 뒤"·`addDaysYmd()` "n일 뒤/전" 달력 날짜)·`tradeStats.js`(집계·필터·**평 환산**·이상치 제외·중앙값)·`complexRows.js`(⚠️ **지도 마커와 단지 리스트가 함께 쓰는 행 파생** — 아래 참조)·`mapFilters.js`(필터 밴드·배지 임계값·정렬 옵션 + `matchesComplexName` 이름 검색)·`palette.js`·`naverLand.js` / `cronAuth.js`(cron Bearer 인증 공용).
  - ⚠️ **`calcMaxLoan`을 직접 부르지 말고 `loanPolicy.loanCalcFor(profile, assets)`를 쓸 것**(2026-08-30 신설). 화면 4곳(지도 평형 카드 · 🆕 새 거래 피드 · ⭐ 관심 단지 · 🏗 청약 레이더)이 같은 인자 10개를 각자 손으로 조립하고 있었다 — 하나만 빠져도 **그 화면만** 조용히 다른 숫자를 낸다(2026-08-14 농특세 사고가 정확히 `area` 누락이었고 build도 test도 못 잡았다). 지금은 `calcMaxLoan` 직접 호출이 `loanPolicy.js` 안에만 있고, `tests/loanPolicy.test.mjs`가 어댑터의 `area` 전달을 잠근다. 자금 입력을 새로 추가하면 여기 한 곳만 고치면 네 화면이 함께 따라온다.
  - ⚠️ **마커와 리스트는 `complexRows.buildComplexRows()`가 만든 같은 배열을 본다**(2026-08-30). 예전엔 `renderMarkers`와 `listRows` useMemo가 `filterTrades → summarize → bestFit`을 각자 적어, 필터 한 번 바꿀 때마다 단지 수백 곳의 대출 계산이 **두 번** 돌고 호출부가 갈라질 여지가 있었다. 새 배지·정렬을 넣을 땐 이 함수에 넣을 것 — 화면 쪽에 따로 적으면 그 갈라짐이 되살아난다. ⚠️ 반환 배열은 마커와 공유하므로 **in-place 정렬 금지**(`sortComplexRows`가 복사한다). ⚠️ 세대수는 행에 넣지 말 것 — lazy로 나중에 도착해 마커까지 다시 그리게 된다(리스트가 렌더 시점에 붙인다).
  - ⚠️ **KST 날짜는 `format.kstDate()` 하나만 쓸 것**(2026-08-14 통합). Vercel은 UTC로 돌고 cron은 06:00·06:30 KST라 **매일** KST 00:00~08:59 구간에서 실행된다 — UTC 날짜를 그대로 쓰면 그때마다 어제가 나온다. 이 프로젝트에서 같은 버그가 **네 번 재발**했고(marketSignal 창 / briefing cutoff·D-day / `/api/subscription` 마감 / 지도 보유주택 스냅샷), 넷이 각자 `+ 9*60*60*1000`을 들고 있어 하나를 고쳐도 나머지가 남았다. 지금은 정의가 `format.js` 한 곳뿐이고 **`tests/format.test.mjs`의 "KST 오프셋 정의는 format.js 한 곳뿐이다"가 구조 가드**다 — 새로 오프셋을 적으면 그 테스트가 파일명을 찍어 실패한다. ⚠️ **다만 이 가드엔 사각지대가 있다**(2026-08-30 실제로 통과당함): 오프셋을 *더하는* 코드만 잡지, **로컬 `Date` 산술**은 못 잡는다. 비과세 D-day가 `new Date(ymd)`(= UTC 자정) − `Date.now()`로 세다가 KST 09:00 이전에 하루 크게 나왔다. 날짜에 기간을 더할 땐 `Date` 객체 말고 **`addYearsYmd()`처럼 문자열 연산**으로, D-day는 `daysUntil()`/`daysBetweenYmd()`로 — `new Date(...)`에 산술을 걸고 있다면 그게 신호다. 의존성 0인 `format.js`에 둔 이유는 서버와 클라(지도)가 같은 함수를 써야 두 화면 날짜가 안 어긋나기 때문. `marketSignal.js`는 raw node 단독 import 대상이라 `./format.js` **확장자 import** 유지.
  - ⚠️ **뉴스 중요도(`news.newsPriority`)의 임계값·감점은 취향이 아니라 실측값이다**(2026-08-31). 점수 = 카테고리 가중 + 신호어 + 관심지역 + 소득 − 정치·논평, 4점↑ 필독 / 3점 주목 / 그 아래 일반. 최근 7일 240건으로 후보를 비교해 정했다: **주목을 2점부터로 두면 카테고리만으로 주목이 돼(대출·금리 기사는 전부) 52.1%가 색칠된다** — 절반이 강조되면 색이 아무것도 가리키지 못한다. **정치 감점(−2)을 빼면** `classifyNews`가 제목에 "부동산 정책"만 있어도 정책·세금(2점)으로 빨아들이는 탓에 지지율·여야 공방·칼럼이 대량 유입된다. 채택안은 필독 9.6%(하루 3.8건)·주목 18.8%·일반 71.7%. ⚠️ 신호어(`STRONG_SIGNAL`)를 넓히면 필독이 범람하니 손대기 전에 실측부터 — 측정 방법은 `PROGRESS.md` 2026-08-31 섹션. ⚠️ 물음표는 **제목 끝**일 때만 논평으로 본다(반례: `"…짭이라고요?" 입주민 황당`). 남는 오탐은 **의도적으로 통과**시킨다 — `isCapitalAreaNews`와 같은 방침으로 놓친 필독이 더 비싸다.
  - ⚠️ **📢 요주의 단지(`newsWatch.js`)의 규칙·임계값도 실측이다**(2026-09-02). 제목에서 단지명을
    뽑아 `점수 = 기사 + (날짜−1)×2 ≥ 4` **그리고 매체 ≥ 2**면 요주의. 지켜야 할 것 넷: ① **공백 ≤ 1**이
    인용문 오탐의 주 차단막(`"9억대 송파 아파트"` 류 6종이 전부 여기서 죽는다) ② **`아파트`는 이름
    끝에만** 허용 — 없으면 `아파트값`이 243건으로 1위를 먹는다 ③ 조사는 이름이 브랜드 토큰으로
    끝나지 **않을 때만** 뗀다(`이문아이파크자이`→`이문아이파크자` 파손) ④ **구분자 분해 필수** —
    `개포우성·구로주공·번동주공1 등…` 나열형이 흔하고, 인용 기반만 쓰면 구로주공이 30건→8건으로
    과소 집계돼 "신호 없음"으로 오진된다(설계 중 실제로 겪음). ⚠️ **지역 추정은 이름 → 제목의
    이름 앞부분 순**이고 제목에 단지가 둘 이상이면 미상이다: 한국어 제목은 "지역 + 단지명" 순서라
    이름 뒤의 지역은 비교 대상이다(`한남더힐 1년새 95억↑…서울 강남 최고가` → 용산인데 강남으로 붙었다).
    ⚠️ 매체 2곳 조건을 빼지 말 것 — 한 신문의 **입찰공고 연재**(`신세계타운` 3건)가 1위로 올라온다.
    ⚠️ `BASE_KEYWORDS`의 단지 축 6종을 지우면 이 카드가 죽는다(시황 축 8개는 단지명 수확 0).
    키워드를 늘릴 땐 감으로 넣지 말고 `fetchNews()`로 실제 수집해 수확량을 잴 것 — 후보 15종 중
    4종이 수확 0이었다. 방법은 `PROGRESS.md` 2026-09-02 절.
  - ⚠️ 실거래 코드는 **법정동 시군구 5자리** — **부천(41190)·화성(41590) 상위코드는 0건**이라 구별 코드로 등록(부천 4119x 3구 / 화성 2025신설 4159x 4구). 월 수집은 `fetchRawMonths` 일괄(캐시 `.in()` 1회 + 미스 전량 동시 — 국토부는 동시 호출 스로틀 없음, 실측 동시36=4.7s가 최속) — 미스는 `allSettled`(한 달 실패해도 나머지 살림, 전량 실패 시에만 throw→502), 반환에 `latestFetched`(최근 fetched_at) 포함 → `/api/trades` 신선도는 별도 쿼리 없이 사용(2026-07-21)
  - API(브리핑): `/api/briefing`(즐겨찾기 단지 최근 30일 거래 + D-30 내 일정 + **시장 신호 + 새 거래 피드**) — ⚠️ **캐시 전용**(`fetchRawMonths(.., {cacheOnly:true})`)이라 외부 API를 **호출하지 않는다**. cron이 채워둔 `trade_raw_cache`만 읽고, 없는 지역은 조용히 생략. 변동률은 **같은 평형의 직전 거래**와 비교(평형이 다르면 무의미). ⚠️ `MONTHS=4`를 줄이지 말 것 — `buildSignal`의 prev 창이 `asOf−90일`까지 내려가고 90일은 최악의 경우 달력월 4개를 걸친다. 짧으면 prevCount만 저평가돼 delta가 항상 "급증"으로 보인다(2026-08-03에 2→3, 08-04에 3→4). ⚠️ 피드 상한(60건)에서 **★ 단지 거래를 먼저 담는다** — 그냥 최신순으로 자르면 기본 탭인 ★가 통째로 빈다(실측: 최신 60건이 전부 7/30~8/01, ★ 거래는 7/07~7/18이라 컷 밖)
  - **브리핑 페이로드 캐시**(`briefing_cache` 0008, 2026-08-07): `/api/briefing`은 `lib/briefing.js`의 `getBriefing()`만 호출한다 — 지문(`favorites` 6필드 + 대상 행 `max(fetched_at)` + KST 날짜)이 일치하면 저장된 payload를 그대로 반환(prod 실측 미스 1.9~2.6s → 히트 0.67~1.1s, 한국→Vercel 왕복 포함). ⚠️ **지문 계산 경로는 하나여야 한다** — cron 워밍도 같은 `getBriefing()`을 부른다. 두 곳에서 각자 조립하면 재료 하나만 어긋나도 캐시가 영원히 미스가 되고, 조용히 느려질 뿐이라 눈치채기 어렵다. ⚠️ `buildFingerprint`의 `FAV_FIELDS`는 **payload가 실제로 읽는 favorites 필드와 같아야** 한다(payload가 새 필드를 읽으면 여기에도 추가 — 안 그러면 그 변경이 화면에 안 뜬다). ⚠️ **payload 모양을 바꿨으면 `PAYLOAD_VERSION`을 올릴 것**(2026-08-14 신설). 지문 재료는 "입력"(★·수집시각·날짜)뿐이라 **코드 변경은 지문을 못 바꾼다** — `buildBriefingPayload`를 고쳐 배포해도 저장된 옛 payload가 그대로 나가고, KST 날짜가 넘어가는 다음날 06:00 cron까지 최대 하루를 기다려야 했다(캐시 도입 08-07 ~ 08-14 사이 이 탈출구가 아예 없었다). "배포했는데 브리핑이 그대로"면 청크 해시를 뒤지기 전에 **여기부터 볼 것**. 버전을 올리면 다음 요청 한 번만 라이브 계산(1.9~2.6s)하고 다시 캐시에 앉는다. `tests/briefingCache.test.mjs`의 golden 해시가 재료 조합을 고정한다(버전을 올리면 그 기대값도 갱신). ⚠️ 캐시 계층 실패(테이블 부재·조회 실패·지문 실패)는 **전부 라이브 계산 폴백** — 반대로 기울면 조용히 틀린 화면이 된다. ⚠️ cron 워밍은 **추세 워밍보다 앞**에 둘 것(`/api/cron/refresh`) — 추세 워밍은 40s 데드라인으로 미완주분을 다음 실행에 넘기는 양보 가능한 작업이라, 뒤에 두면 영영 안 돈다. ⚠️ 서버 D-day(`upcoming.dday`)는 `daysBetweenYmd(kstDate(), ymd)` — 예전 `setHours(0,0,0,0)` 기준은 Vercel(UTC)에서 KST 00:00~09:00에 하루 크게 나오고, 캐시하면 그 오차가 온종일 고정된다. ⚠️ 캐시 히트 payload는 계산분과 **내용은 같지만 최상위 키 순서가 뒤집힌다**(jsonb 라운드트립, 2026-08-07 prod 실측) — 검증할 때 `JSON.stringify` 비교는 항상 false다. `deepStrictEqual`로 볼 것
  - **시장 신호**(`lib/marketSignal.js` `buildSignal`): 지표 4종(거래량·계약 해제·직거래 비중·법인 순매수). ⚠️ **창을 신고 기한(30일)만큼 뒤로 물린다**(`REPORT_LAG_DAYS`) — 실거래 신고 기한이 계약 후 30일이라 "최근 30일 계약분"은 구조적으로 미완성이고, 보정 없이 직전 창과 비교하면 **매일 모든 지역이 −55~−65% "거래량 급감"**으로 뜬다. 근거는 41173 캐시의 계약일 10일 단위 분포(신고 끝난 5·6월은 평탄 212/172/255·168/124/140, 진행 중 7월만 114→50→19 급락, 2026-08-04 실측). `window`를 함께 반환해 카드 헤더가 "최근 30일"이 아니라 실제 창을 찍는다. ⚠️ 법인 지표는 `buyerGbn`에 **값이 있을 때만**(`corporate.available`) — 0으로 표시하면 "법인 거래 없음"이라는 거짓말이 된다(2026-08-03엔 태그가 안 왔으나 **2026-09-29 실측: 값이 채워져 온다**(`공공기관`·`개인` 등) — 옛 캐시 행엔 여전히 없다). ⚠️ 🆕 새 거래 피드는 반대로 **최근 30일 그대로** — 비교가 아니라 "새로 들어온 것"이라 지연이 곧 신선도다
  - **시세 정확도 단일 지점**: `fetchRawMonths`가 캐시/수집분을 반환할 때 `excludeAbnormal()`로 **해제·직거래를 걷어낸다** → 이 함수를 거치는 네 라우트(`/trades`·`/trend`·`/rank`·`/briefing`)가 같은 기준을 공유한다. 제외 기준을 바꾸려면 여기 한 곳만. ⚠️ 캐시에는 **원본 그대로** 저장하고 걸러내기는 읽을 때 한다(기준이 바뀌어도 재수집 불필요). 필드가 없는 옛 캐시 행은 `lacksDealFlags()`가 미스로 돌려 **자가 재수집**(마이그레이션 없음). ⚠️ `lacksDealFlags`에 **`buyerGbn` 검사를 넣지 말 것**(2026-08-03에 넣으려다 철회) — 실측상 캐시 781행 중 `buyerGbn` 보유 0이라 전량이 stale이 되는데 `/api/briefing`은 `cacheOnly`라 재수집을 못 해 **기존 ⭐관심단지 브리핑까지 빈다**. 법인 필드 부재는 `corporate.available=false`가 이미 정확히 처리한다. ⚠️ 해제는 거래 후 나중에 발생하므로 과거 달 캐시는 늦게 반영된다 — cron이 최근 2개월만 재수집하는 게 현실적 타협. ⚠️ `excludeAbnormal()`은 걸러낸 거래를 **사유와 함께 `removed`로 반환**하고 `fetchRawMonths`가 실어 보낸다 — 시장 신호의 원천이 이것이다(시세에서 빼는 건 맞지만, 뺀 것 자체가 신호). 반환 형태를 바꾸면 신호가 빈다
  - API(실거래·단지): `/api/trades`(N개월 병합, 응답에 `excluded{cancelled,direct}`·단지별 `naverName`) · `/api/trend`(월별 추세 — 대표값은 **중앙값 `value`**, `avg`도 같이 반환. 한 평형의 월 거래가 1~3건이라 평균은 특수거래 하나에 통째로 끌려간다. `area`로 평형별, `months` 최대 36=3년) · `/api/favorites`(CRUD + PATCH=D-day 필드, 0004 컬럼 부재 시 GET 폴백·PATCH 409 graceful) · `/api/complex-info`(세대수/동수) · `/api/rank`(단지별 1년 상승률 — 최근 3개월 vs 12~14개월 전 ㎡당가, 창별 2건 미만 null)
  - API(cron·뉴스): `/api/cron/refresh`(즐겨찾기 지역 최근2개월 재수집 + **🔥 서울·경기 전역 재수집**(캐시 오래된 지역부터, 12곳씩, 25s 데드라인 — 응답 `hotCollect.skipped`가 매일 비는지 볼 것) + `trade_reports` 30일 프루닝 + **브리핑 캐시 워밍** + 추세 36개월 워밍 — 이 순서를 지킬 것, 위 브리핑 캐시 항목 참조) · `/api/hot`(🔥 핫플 — `trade_reports` 7일을 페이지네이션(PostgREST 1,000행 상한)으로 읽어 오늘·이번 주 단지 집계를 한 번에. 캐시를 읽지 않는다) · `/api/cron/news`(뉴스 일수집 — `lib/news.js` 2단 소스: 네이버 키 있으면 API/없으면 구글 RSS, 키워드=기본8종(수도권·매매 위주)+즐겨찾기 지역, link PK upsert 중복제거+30일 프루닝 — **+ 청약 수집 합류**, Hobby cron 한도 2개가 꽉 차서) · `/api/news`(**최근 7일**분 최신 300건 — 칩 필터는 클라. ⚠️ 컷은 `published_at >= kstDate()−6일`이라 프루닝(30일·`fetched_at` 기준)과 다르다 — 발행일이 오래된 행이 DB에 남아 있어 이 컷이 없으면 목록 아래에 끼어든다. 응답의 `days`·`since`로 화면 라벨이 서버 기준을 따라간다) · `/api/subscription`(청약 접수 임박순 20건, `receipt_end >= 오늘`). ⚠️ 이 "오늘"은 **KST 달력 날짜**(`format.kstDate()`) — UTC 날짜를 그대로 쓰면 KST 00:00~08:59에 어제가 나와 마감된 공고가 9시간 더 걸리고 카드가 `daysUntil`(브라우저=KST)로 음수를 받아 `D--1`을 찍는다(2026-08-05 수정). `marketSignal.ymd()`·briefing `cutoff`와 같은 계열 — **날짜 비교는 전부 `kstDate()`를 거칠 것**(위 lib 항목의 통합·가드 참조). 뉴스 페이지 상단은 `components/Briefing.js`(⭐관심단지·⏳일정·📊시장신호·🆕새거래·🏗청약·💰영향뉴스) — 자금 여유는 지도와 **같은 `calcMaxLoan`**으로 계산해 두 화면 숫자가 어긋나지 않게 함. 💰카드는 `classifyNews()`의 대출·금리/정책·세금 + 관심지역 기사(신규 분류 로직 없음). **수도권 온리**(2026-07-12): `isCapitalAreaNews()`를 수집(`fetchNews`)+조회(`/api/news`) 양쪽 적용 — 화이트리스트 우선이라 비수도권 지명"만" 언급된 기사만 제외, 카테고리는 `classifyNews()` 제목 룰(DB 컬럼 없음, 렌더 시 계산)
- 단지 세대수(`kapt.js`): 실거래가 API엔 없음 → 국토부 공동주택 API 별도. **현행 엔드포인트(2026-06 검증)**: 목록 `AptListService3/getSigunguAptList3`(시군구→kaptCode), 기본정보 `AptBasisInfoServiceV4/getAphusBassInfoV4`(kaptCode→`kaptdaCnt`세대수)
  - ⚠️ **둘 다 data.go.kr 활용신청 필요**(자동승인, 2026-06-25 승인 확인) — 미승인 403 / 구버전 V2·V3는 500=폐기
  - ⚠️ **이 계열은 응답이 JSON**(실거래가 API의 XML과 정반대 — `_type=xml`줘도 JSON). `response.body.items[]`(목록)/`response.body.item`(기본정보, `kaptdaCnt`는 float). 미승인/오류 시 `{kaptCode:null}`로 graceful(세대수만 생략)
  - 캐시 2겹: 인메모리(서버수명) + **`kapt_cache` 영구**(Supabase, `getComplexInfoMany` 일괄 — geocodeMany 패턴, 매칭 실패는 미캐시). 리스트 lazy는 `/api/complex-info` **POST 일괄**(GET은 세부패널 단건)
- 청약홈 분양정보(`applyhome.js`): `https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail`(분양) + `getRemndrLttotPblancDetail`(무순위). **data.go.kr 활용신청 승인 완료**(2026-08-03) — 기존 `DATA_GO_KR_KEY` 그대로 동작(계정당 키 1개를 서비스별 승인). ⚠️ 실거래가 API(http·XML)와 달리 **https + JSON**이고 키는 전부 **대문자 스네이크**
  - ⚠️ **접수일 필드명이 두 엔드포인트에서 다르다**(2026-08-04 실측): APT는 `RCEPT_BGNDE/RCEPT_ENDDE`, 무순위는 `SUBSCRPT_RCEPT_BGNDE/SUBSCRPT_RCEPT_ENDDE`(`RCEPT_BGNDE` 키 자체가 없고 `GNRL_RCEPT_*`는 null). 한쪽만 읽으면 무순위 접수일이 전부 null이 돼 "임박순" 정렬이 무너진다
  - ⚠️ `page=1&perPage=100`만 받는 근거는 응답이 **공고일 최신순**이라서다(실측: APT 07-31~04-29, 무순위 07-31~05-13이 한 페이지). 정렬이 뒤집히면 page 1이 2015년 공고가 돼 카드가 통째로 빈다 — 수확량 0이면 이 가정부터 의심할 것
  - 실패는 전부 graceful(`[]`) → 카드만 조용히 빠지고 뉴스 수집은 계속. ⚠️ UI는 **같은 단지·같은 마감일을 한 줄로 묶는다** — 무순위는 블록별로 쪼개 공고돼(더샵 송도그란테르 5개 블록) 6칸 카드를 한 단지가 다 먹는다. 묶음 키에 **`agency`를 포함**할 것(LH와 청약홈은 번호 체계가 무관)
  - **분양가·평형**(`getAPTLttotPblancMdl`, 2026-08-15): 평형별 `SUPLY_AR`(공급면적)+`LTTOT_TOP_AMOUNT`(분양가, 만원)+일반/특공 세대수. **지금 키로 이미 열려 있다**(활용신청 불필요). `cond[HOUSE_MANAGE_NO::EQ]`로 공고 단위 조회 — ⚠️ 응답의 `totalCount`는 **필터를 반영하지 않고 전체(14,570)를 그대로 준다**, 수확량은 `data.length`로 볼 것. ⚠️ **접수가 안 끝난 공고에만** 붙인다(공고당 요청 1회라 전량이면 매일 수십 번, 지난 공고의 분양가는 화면에 뜨지도 않는다 — 조회가 `receipt_end >= 오늘`로 거른다). 실측 cron 4.0s
  - ⚠️ **특별공급 접수일은 별도 필드**(`SPSPLY_RCEPT_BGNDE/ENDDE`)이고 **일반공급보다 먼저 마감한다** — 2026-08-15 실측: 두산위브더제니스 부천 특공 08-19 / 일반 08-21, 쌍용 더 플래티넘 서대문 특공 하루(08-24) / 일반 08-24~27. 100건 중 86건 보유. 일반 날짜만 보여주면 생애최초·신혼 대상이 사흘을 더 있는 줄 안다
  - **LH 공고**(`lib/lhNotice.js`, 2026-08-15 — **활용신청 승인 완료**) — 행복주택·국민임대·영구임대·매입임대·통합공공임대·든든전세. ⚠️ **청약홈엔 공공임대가 사실상 없다**(실측: APT 100건의 `RENT_SECD_NM`이 분양주택 99 / 분양전환 가능임대 1) → 이 API가 유일한 정공법. `apis.data.go.kr/B552555/lhLeaseNoticeInfo1`. ⚠️ **활용신청이 별도**([15058530](https://www.data.go.kr/data/15058530/openapi.do), 자동승인) — 같은 `DATA_GO_KR_KEY`지만 서비스별 승인이라 미승인 시 403 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`. graceful이라 죽어도 LH 줄만 빠진다. 실측 수확 19건·1.4s
    - 공고유형 `UPP_AIS_TP_CD` 전량 실측(창=게시일 −90일 ~ 마감 +180일): **06 임대(243)** = 행복주택 92·국민임대 78·영구임대 48·공공임대 18·통합공공임대 5 / **13 주거복지(124)** = 매입임대 121·집주인임대 3 / 05 분양(24) / 39 신혼희망타운(25) / 01 토지(199)·22 임대상가(89)는 **주택이 아니라 제외**
    - ⚠️ **든든전세는 06이 아니라 13에 있다**(매입임대로 분류). "임대주택=06"이라 짐작하면 통째로 놓친다 — 실측 14건이 전부 13에서 나왔다. ⚠️ 다만 **수도권 든든전세는 현재 0건**(부산·전북·경북·경남·광주전남뿐) — 코드가 아니라 공고 분포다. 열리면 자동으로 뜬다
    - ⚠️ **`PG_SZ=100`이면 잘린다** — 06만 243건이다. 300부터 전량이 와서 **1000**으로 잡아 페이징을 없앴다(유형 4종 × 요청 1회). 응답 첫 행 `ALL_CNT`가 전체 건수 — 받은 수와 어긋나면 이 값부터 의심
    - ⚠️ **주소·세대수·당첨자발표일·접수시작일이 아예 없다**(청약홈엔 있어서 헷갈린다). 수도권 판정은 `CNP_CD_NM`으로. `PAN_NT_ST_DT`는 접수일이 아니라 **공고게시일**이라 `receiptStart`에 넣지 말 것 — 넣으면 카드가 없는 접수일을 찍는다. 마감은 `CLSG_DT`(공고마감일). 날짜는 **"2026.08.14" 점 구분**
    - ⚠️ **입주자 모집과 사업자 공모가 한 목록에 섞여 온다** — "매입임대 공동생활가정 **운영기관** 모집공고"가 마감 임박순 1위로 올라와 6칸 카드 맨 윗줄을 먹었다. 구분 필드가 없어 `NOT_FOR_TENANTS` 이름 규칙으로 거른다(취약하니 **좁게** 유지)
    - ⚠️ **정정공고와 원공고가 둘 다 살아서 온다** — 실측 표시 후보 10줄 중 4줄이 중복이었다. 응답이 게시일 최신순이라 `dropRevisedDuplicates`가 **먼저 온 것(=정정본)만** 남긴다. 키는 `[…]` 접두사를 뗀 이름+마감일 — ⚠️ 마감일을 빼면 다른 공고가 합쳐진다
    - ⚠️ PK는 `subscription_items.house_manage_no` 공용이라 **LH 행은 `LH:<공고번호>` 접두사**로 네임스페이스를 나눈다. cron 응답의 `lh.sampleKeys`는 필드 회귀 감시용이니 지우지 말 것
  - ⚠️ **SH·GH는 수집하지 않는다 — 링크만**(2026-08-15 조사). SH는 모집공고 오픈API가 **아예 없고**(서울열린데이터광장·data.go.kr 모두 관리현황 정적파일뿐, 2021~2022년치), GH는 `GH주택청약 모집정보`가 있으나 **갱신주기가 연간**이라 임박순 레이더에 못 쓴다. 카드 하단에 각 청약 시스템 링크. 나중에 API가 생기면 `lhNotice.js`와 같은 모양으로 붙일 것
  - **자금 판정 배지**: 청약 카드도 지도·피드와 **같은 `calcMaxLoan`**을 쓴다. ⚠️ gap과 평형은 `bestModelFit`이 **한 모델에서** 뽑는다(지도 `bestFit`과 같은 이유 — 평형을 넘나들며 고르면 못 사는 조합이 "여유"로 뜬다). 규제지역 판정용 `lawdCd`는 공고가 안 주므로 `regions.lawdCdFromAddress()`로 주소 역매칭 — ⚠️ **긴 이름 우선 + 시도 확인**이 필수(수원시 장안구/권선구 구별, 인천 중구가 서울 중구로 붙는 것 방지)
- 네이버 외부링크(키 불필요): 헤더 "🔎 네이버 검색"=통합검색(전체탭), 평형 카드 "N건·🏠매물"=네이버 부동산 검색 딥링크 `m.land.naver.com/search/result/{umd 단지명}`. ⚠️ 단지 고정 URL 비공개 → 단지명 검색 **best-effort**(`naverLandUrl(umdNm, aptNm, canonicalName)`)
  - **성공 판정법**(검증할 때 쓸 것): 검색이 단지를 찾으면 **`fin.land.naver.com/complexes/{번호}`로 리다이렉트**된다(응답 len ≈48,190). 못 찾으면 `m.land`에 머문다(len ≈55,330). 본문 문자열 매칭은 개행 때문에 헛짚기 쉬움
  - **1순위는 카카오 정식 단지명**(`canonicalName`) — 국토부명이 네이버 표기와 자주 다르다(`공작아파트`→`공작부영아파트`, `삼성래미안`→`비산삼성래미안아파트`). 지오코딩 때 이미 받는 값이라 추가 호출 0. 2026-07-29 안양 동안구 30곳 실측: 국토부명 21/30(70%) → 카카오명+동 24/30(**80%**), 진 사례 없음. 저장은 `geocode_cache.place_name`(0006)
  - canonicalName이 없을 때만 기존 괄호 2단계 처리: 안이 동·필지번호(숫자/영문/쉼표뿐 or `제?N(상가)동`)면 **통째 제거**(`한미(A1,A2,B)`→"한미"가 정확매칭, 2026-07-05 실측), 한글 들었으면 **공백으로 풀어 유지**(`동편마을(3단지)`→"동편마을 3단지" — 빼면 0건)
- 자동 갱신: `vercel.json` cron 2개 — `/api/cron/refresh`(06:00 KST) + `/api/cron/news`(06:30 KST). **Hobby 한도 = 프로젝트당 cron 2개·1일1회라 꽉 참**(추가하려면 기존 라우트에 합칠 것). 라우트의 `maxDuration=60` + 추세 워밍 40s 데드라인 가드는 **지우지 말 것**(첫 워밍 타임아웃 방지, 미완주분은 다음 실행이 이어감). 보호용 `CRON_SECRET` env — 설정 시 `Authorization: Bearer <secret>` 필요(Vercel Cron이 자동 첨부). **배포 시 반드시 설정**(미설정이면 누구나 국토부 호출 트리거 가능). 로컬은 미설정이라 curl로 바로 호출 가능. `/api/trades` 응답에 `fetchedAt`(캐시 신선도) 포함
### 스택·변경 검증
- 스택 버전: Next.js 16 + React 19 (수동 스캐폴딩, `create-next-app` 미사용 — 기존 .md 파일 충돌 회피)
- 변경 검증: `npx next build` (컴파일/타입 + prerender) **+ `npm test`** (순수 lib, **Node 내장 `node:test` — 의존성 0**, 2026-07-25 도입). 현재 커버: `acquisitionCost`(세율 경계값)·`loanPolicy`(gap↔neededLoan 일치성)·`format`·`tradeStats`(평 환산 경계값·이상치 제외·중앙값)·`marketSignal`(창 경계·KST 날짜·신고 지연 보정 회귀 가드, 2026-08-04 추가)·`briefingCache`(지문 — favorites 순서 무관·★ 추가/삭제/메모 반영·`fetched_at` 반영 + **재료 golden 해시**, 2026-08-06 추가)·`format`(`daysBetweenYmd` 타임존 무관 D-day + `kstDate` 경계·cron 시각 + **KST 오프셋 단일 정의 구조 가드**, 2026-08-14 보강)·`subscription`(주소→`lawd_cd` 역매칭 + LH 응답 파서 — 모양 3종 + **실응답 한 행 golden** + 정정공고 중복 제거, 2026-08-15 추가)·`complexRows`(마커·리스트 공용 행 파생 — 필터·배지 경계·bestFit 동일평형 보장·정렬 비파괴, 2026-08-30 추가)·`loanPolicy.loanCalcFor`(어댑터가 `area`를 흘려보내는지 = 농특세 회귀 가드)·`format.addYearsYmd`(윤년 클램프, 2026-08-30 추가)·`news`(중요도 — 카테고리 가중·신호어·관심지역·정치 감점·임계 3↔4 경계, 2026-08-31 추가)·`format.addDaysYmd`(월/연 경계·윤년 — 뉴스 7일 컷의 기준일)·`newsWatch`(📢 요주의 단지 — **실측 제목 golden**: 추출 7종·오탐 12종·지역 추정 4종·임계 경계·병합·매체 조건, 2026-09-02 추가)·`mapFilters.matchesComplexName`(이름 검색 — 지역 접두어 스트립 = 딥링크 착지 가드)·`tradeReports`(🔥 새 신고 판별 — 멀티셋 비교·해제 표시는 새 거래 아님·기준선 보호 48h 경계·가격 기준 중앙값, 2026-09-29)·`hotRank`(🔥 집계·칩별 순위 — 해제·직거래 제외(해링턴타워 170건)·PostgREST 문자열 숫자·다른 지역 동명 뉴스 불일치·가점 경계) — 총 181개. ⚠️ `node --test tests/`(디렉터리 형태)는 `MODULE_NOT_FOUND`로 **실패** → 글로브를 따옴표로: `node --test "tests/*.test.mjs"`. ⚠️ `MODULE_TYPELESS_PACKAGE_JSON` 경고는 무해 — 없애려고 `package.json`에 `"type":"module"` **추가 금지**(Next 빌드 깨짐). ⚠️ **린트는 이 프로젝트에 없다** — eslint 설정·의존성 미설치. `package.json`의 `lint` 스크립트는 Next 15 잔재라 Next 16에선 **실행 실패**(`next lint` 서브커맨드 제거 → `lint`를 디렉터리로 해석), 그래서 2026-07-25에 스크립트를 지웠다. 검증은 build+test 둘이 전부. ⚠️ `KakaoMap.js`의 `// eslint-disable-next-line react-hooks/exhaustive-deps` 주석들은 린트가 없어 **무효지만 "deps를 의도적으로 뺐다"는 표시라 지우지 말 것**(deps 함정이 이 파일의 상습 사고 지점).
  - 검증 3종의 역할이 다르다(2026-07-25 각각 실제로 다른 버그를 잡음): **`npm test`** = 계산 불변식(클램프로 교차검증이 죽는 것) / **Playwright 실측** = 레이아웃 수치(패딩 26px 초과) / **`npx next build`** = prerender 단계의 null 참조(JSX 변수화 가드). 스크린샷 눈대중은 마지막에.
### 도메인 계산 규칙 (평 환산·세금·대출)
- **평 표기는 공급면적 기준**(`tradeStats.toPyeong`, 2026-07-29): 실거래가 API는 **전용면적만** 주는데 사람들이 말하는 "34평"은 공급(전용+주거공용) 기준이라, 전용을 그냥 3.3058로 나누면 국평 84㎡가 25평으로 나와 어긋난다 → `전용㎡ × SUPPLY_RATIO(1.33) ÷ 3.3058`. 검증: 84.96㎡→34평(실제 공급 111.98㎡=33.9평) / 60→24 / 75→30 / 135→54. ⚠️ 단지별 전용률이 71~78%로 흩어져 **±1평 오차**가 있는 근사치다(정확히 하려면 단지별 공급면적을 따로 받아야 하는데 누락이 많아 근사로 감). ⚠️ 화면의 "N평"은 전부 이 함수를 거칠 것 — `AREA_FILTERS` 라벨(~24평/24~34평/34~54평/54평~)도 이 환산과 맞춰져 있고 `tests/tradeStats.test.mjs`가 경계값을 지킨다
  - ⚠️ **청약만은 예외 — `pyeongFromSupply(공급㎡)`를 쓴다**(2026-08-15 신설). 청약홈 `getAPTLttotPblancMdl`은 **실제 공급면적**을 주므로 1.33 근사를 쓰면 어긋난다: 더샵 신길센트럴시티 전용 51.9953 → 실제 공급 73.8748 = **22평**인데 `toPyeong(51.9953)`은 **21평**. 두 함수를 합치면 한쪽이 반드시 틀린다(원천이 주는 값이 달라서 갈린 것) — 실거래=`toPyeong` / 청약=`pyeongFromSupply`
- 세금·수수료(`acquisitionCost.js`): 취득세(지방세법 §11①8, 6억↓1%/6~9억 선형/9억↑3%)·지방교육세(세율×1/10, 중과 시 0.4% 고정)·농특세(**전용 85㎡ 초과만** 0.2%)·중개보수(공인중개사법 시행규칙 별표1 + VAT)·등기비. ⚠️ 등기비 `REGISTRY_RATE`/`REGISTRY_FIXED`만 **법령 아닌 경험치 근사**(채권 할인손실이 시세 의존) — 실제 견적 겪으면 이 둘만 교체. ⚠️ `householdType`이 3단계뿐이라 **`다주택`=2주택 취급**(조정 8%), 3주택 이상 12%는 미구현(사용자가 무주택/최대 1주택이라 미발생, 2026-07-25 결정)
- ⚠️ `calcMaxLoan`의 `neededLoan`은 **`maxLoan`으로 클램프하지 말 것** — 한도를 넘는 것 자체가 자금 부족 신호이고, `gap ≥ 0 ⟺ maxLoan ≥ neededLoan` 교차검증이 여기서 나온다(클램프하면 부등식이 항상 참이 돼 검증이 죽음). 월납·DSR은 실제 받게 될 `plannedLoan = min(neededLoan, maxLoan)` 기준. 월납은 **실제 금리**, DSR은 **스트레스 금리** — 둘이 다른 게 정상(HelpModal에서 설명)
### 검증·디버깅 방법 (API 확인 · Playwright · 단독 스크립트)
- API 동작 확인: `npm run dev`(백그라운드) → 로그 "Ready" 대기 → `curl "http://localhost:3000/api/trades?lawdCd=11680&dealYmd=202605"`
- UI 시각 검증(브라우저): `npm i --no-save playwright` + `chromium.launch({channel:"chrome",headless:true})` — **설치된 크롬 사용, 브라우저 다운로드 없음**(이 머신 검증됨). 임시 `scripts/tmp-*.mjs`로 실클릭·스크린샷 후 삭제
  - **선택자**: 이 앱은 인라인 스타일이라 클래스 훅이 `.trade-pin`·`.cx-row`뿐 → `page.$$eval("div", …)` 같은 광범위 선택자는 body를 통째로 잡아 출력이 폭발한다(엄격한 정규식으로 좁힐 것)
  - **클릭 함정**: 핀 클릭은 겹침 인터셉트 잦음 → **단지 선택은 핀 대신 `.cx-row`(리스트 행) 클릭이 가장 안전**(2026-07-29). 핀을 꼭 눌러야 하면 `elementFromPoint` 히트테스트로 클릭 가능한 핀을 골라 클릭. `aria-label="닫기"`는 세부패널·모달 2개 매칭(첫 요소가 오버레이에 가려 클릭 타임아웃, 2026-07-12) → 모달은 오버레이 좌표 `page.mouse.click`으로 닫기
  - **요청 폭포 측정**: `page.on("request"/"response")`로 `/api/` 요청의 시작·종료 시각을 찍으면 직렬화가 눈에 보인다(무관한 요청은 동시 출발이어야 정상). **재현하기 어려운 상태는 `page.route`로 응답을 가로채 조작** — 실제 응답을 `route.fetch()`로 받아 필드만 비우고 `route.fulfill({json})`하면 "★ 단지에 최근 거래가 없는 날"처럼 12일 뒤에나 오는 상태를 지금 재현할 수 있다(2026-08-05, 카드 소멸 버그를 이렇게 확정)
  - **레이아웃 검증**: 크기/레이아웃 버그는 스크린샷 전에 `getBoundingClientRect`·computedStyle **실측부터**(시군구 304px 사고를 즉시 특정한 방법). 패널 겹침은 **px 부호로 판정**(`A.bottom − B.top ≤ 0` = 안 겹침), 겹침 의심 시 `document.elementFromPoint(x,y)`가 그 요소를 반환하는지로 판별, 오버레이 요소는 `getComputedStyle(e).zIndex === "31"`로 찾기
  - **오진 주의**: 카카오 CustomOverlay는 **뷰포트 밖이면 DOM에 없음**(타지역 ★ 검증은 줌아웃 필요). ⚠️ dev 스크린샷 좌하단의 검은 원은 **`nextjs-portal`(Next dev 전용 오버레이)** — 앱/카카오 요소로 오진 말 것(프로덕션엔 없음, 2026-07-25 오진 1건)
  - **성능 측정은 `next build && next start`(로컬 prod 빌드)에서** — dev는 온디맨드 컴파일이 신호를 덮는다. ⚠️ **절대 ms를 믿지 말 것**: 같은 빌드에서도 run1이 run3보다 1초 느리다(서버 워밍). 견고한 지표는 **"게이트가 없는 요청과 문제 요청의 출발 시각 간격"**(`/api/favorites` 출발 ↔ `/api/trades` 출발 = SDK 대기 1,257ms → 9ms, 2026-09-04). 3~5회 중앙값 + 이 간격을 함께 볼 것. 워터폴은 `performance.getEntriesByType("resource")`, "내용 보임"은 `setInterval`로 `.cx-row` 첫 등장 시각 — ⚠️ `addInitScript`에서 `MutationObserver`는 `document.documentElement`가 아직 없어 던진다(seed 전체가 죽어 측정이 0으로 나온다)
  - **지도 카메라 상태 관측**: 카카오 map 객체는 전역에 없다 → idle마다 저장되는 **`localStorage.re_map_view`(`{lawdCd,lat,lng,level}`)를 읽어** 중심·확대가 움직였는지 판정한다(`setBounds`가 복원 위치를 덮었는지 = fitRef 회귀 가드). 현위치 경로는 `newContext({geolocation, permissions:["geolocation"]})`로 주입. ⚠️ **지역 경계 좌표를 쓰지 말 것** — 강남역(37.4979, 127.0276)은 실제로 **서초구**라 코드가 맞는데도 실패로 보인다(2026-09-04 오진 1건) → 삼성동(37.514, 127.0565) 같은 한복판을 쓸 것
  - **버그가 진짜인지는 같은 스크립트를 prod에도 돌려 가른다** — 로컬 수정본과 prod URL에 동일 시나리오를 태우면 "고쳤다"가 아니라 "prod에 실재했고 지금은 아니다"가 증거로 남는다(2026-09-04 딥링크 버그: prod 강남구·0곳 / 로컬 구로구·2곳)
  - **타이밍·상태 주입**: dev 첫 페이지 방문은 온디맨드 컴파일로 느림 → `waitForSelector` 타임아웃 45s 권장(15s 타임아웃 실제 발생). 자금 색칠(ok/no 핀) 검증은 `page.addInitScript`로 `re_loan_profile` localStorage 선주입
- lib·외부 API 단독 검증(dev서버 불필요): 임시 `scripts/*.mjs`에서 `.env.local` 수동 파싱(`process.env` 주입)→ `await import("../app/lib/..")`→ `fetch`. 지오코딩률 측정·data.go.kr 응답 확인에 유용. `app/lib` import 시 `MODULE_TYPELESS_PACKAGE_JSON` 경고는 무해(grep로 필터). 끝나면 스크립트 삭제(커밋 금지)
  - ⚠️ **"이상해 보인다"는 증상은 원본 응답을 전수 덤프해 태그·분포부터 확인할 것.** 추세 그래프 이상치를 "표본 부족이라 어쩔 수 없다"로 넘길 뻔했는데, 원본 XML의 태그 목록을 찍어보니 `cdealType`(해제)·`dealingGbn`(직거래)이 파서에서 통째로 누락돼 있었다(2026-07-29 — 이 세션 최대 성과). 가설로 고치기 전에 원본부터.
  - ⚠️ `trades.js`는 단독 `import` 불가: 내부 `./supabaseServer`(확장자 없는 import)를 raw node가 못 찾아 `ERR_MODULE_NOT_FOUND`로 죽음. supabase 미의존 lib(`regions`/`loanPolicy`/`news`)는 OK — `news.js`는 이를 위해 `./regions.js` **확장자 import** 유지(새 lib도 이 패턴 권장). trades 계열 검증은 국토부/카카오 API를 **직접 fetch**해 우회(엔드포인트/헤더는 `trades.js`에서 복사)
### 이 머신의 셸·환경 함정 (Git Bash · PowerShell · 한글)
- ⚠️ **줄바꿈이 파일마다 다르다** — `.md`(CLAUDE·PROGRESS)는 **CRLF**, `app/**/*.js`는 **LF**. 앵커 문자열로 치환하는 스크립트는 `\n` 앵커가 .md에서 **0회 매칭**으로 실패한다(2026-09-04 실제 발생) → 읽을 때 `raw.replace(/\r\n/g,"\n")`로 정규화하고 쓸 때 되돌릴 것
- ⚠️ Git Bash에서 `curl -o /tmp/x` 한 파일을 node가 못 읽음(win 경로 불일치) → 응답은 **stdin 파이프**나 cwd 상대경로로 받을 것
- ⚠️ dev 서버 좀비: 새 `npm run dev`가 "Another next dev server is already running"으로 죽으면 stale 프로세스가 락 점유 → PowerShell `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ?{$_.CommandLine -match 'next'} | %{Stop-Process $_.ProcessId -Force}` 로 정리 (bash `pkill -f next`는 불안정)
- ⚠️ 한글 인자 API 테스트는 bash `curl`로 금지(명령줄 UTF-8 깨져 DB에 깨진 값 저장) → `node -e`의 `fetch`+`encodeURIComponent` 사용
- ⚠️ bash에서 `node -e "..."` 인라인 JS에 백틱 템플릿 리터럴 금지(명령치환으로 해석돼 bad substitution) → 문자열 연결(`'['+x+']'`)로
- ⚠️ 한글 커밋 메시지는 PowerShell here-string(`git commit -m @'...'@`)이 괄호·특수문자에서 깨져 실패 → 임시파일에 쓰고 `git commit -F <file>` (검증됨). 임시파일은 **Write 도구**로 쓸 것 — PS5.1 `Set-Content -Encoding utf8`은 **BOM을 붙여 커밋 제목 첫머리에 U+FEFF가 박힘**(2026-07-02 실제 발생). 경로는 `.git\COMMIT_MSG_TMP.txt`처럼 **.git 폴더 안**에 두면 git status에 안 잡혀 오염 없음(이전 세션 잔재가 남아 있으니 Write 전 Read 필요)
- ⚠️ PowerShell `Invoke-WebRequest .Content`는 한글 JSON을 코드페이지로 잘못 디코드 → **.NET 문자열 자체가 깨짐**(콘솔 표시뿐 아님). 읽은 한글 값을 **재요청에 쓰면 서버 매칭 실패**(추세가 0건처럼 보임) → 한글 round-trip 검증은 `node` fetch로
### 그 외 구현 메모
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
- 캐시: `trade_raw_cache`(월별 원본거래, 이번달 12h TTL) + `geocode_cache`(단지 좌표 + `place_name` 카카오 정식명, 0006 — 2026-07-29 MCP로 적용) + `kapt_cache`(세대수 영구, 0003 — 2026-07-05 생성 완료) + `favorites`(0004 D-day 컬럼 lease_end/note/note_date) + `news_items`(뉴스 30일 보관, 0005 — 2026-07-08 MCP로 생성 완료) + `subscription_items`(청약 공고, `house_manage_no` PK로 자연 중복제거, 0007 — 2026-08-04 MCP로 적용. 프루닝 없음 — 조회가 `receipt_end >= 오늘`로 거르고 PK 덕에 하루 몇 건씩만 는다) + `briefing_cache`(브리핑 응답 payload **단일 행**, `id=1` 체크 제약, 0008 — 2026-08-07 MCP로 적용. 지문 불일치 시 덮어쓰므로 행이 늘지 않아 프루닝 불필요). **0009**(2026-08-15 MCP로 적용)가 `subscription_items`에 `agency`/`detail_kind`/`spsply_start`/`spsply_end`/`models`(평형별 분양가 jsonb)/`price_min`/`price_max`/`lawd_cd`를 추가 — ⚠️ PK는 그대로 두고 **LH 행에 `LH:` 접두사**로 네임스페이스를 나눈다(번호 체계가 무관해 언젠가 반드시 충돌). **0010**(2026-09-29 MCP로 적용) `trade_reports` — 🔥 핫플용 **새로 신고된 거래**(PK `lawd_cd,trade_key`, `reported_on` = 처음 본 KST 날짜, `ref_median` = 기록 시점 가격 기준). 기록 지점은 `trades.fetchRawMonths`의 재수집 upsert **직전** 한 곳(옛 payload와 비교). ⚠️ **기준선 보호**: 이전 캐시가 없거나 48h 넘은 달은 기록하지 않는다(방치 지역의 몇 주치가 "오늘"로 몰림). 해제·직거래도 원본 저장, 읽을 때 거른다. cron이 30일 프루닝.
  - `place_name` 규약: **NULL=미확인**(다음 조회 때 채움) / **`""`=확인했으나 아파트 매칭 없음**(재조회 방지). ⚠️ 백필은 요청당 `PLACE_NAME_BACKFILL_LIMIT`(40)로 **상한**을 둔다 — 없으면 0006 직후 첫 방문이 지역 전체(수백 곳)를 재지오코딩하다 함수 타임아웃(Vercel 기본 10s). 좌표는 이미 있어 나눠 채워도 화면은 정상(실측 33→63→94→105/132로 수렴). ⚠️ 백필 재조회가 실패하면 **캐시 좌표를 유지**할 것(null로 덮으면 멀쩡한 핀이 사라짐) 구 `trade_cache`(geocoded payload)는 미사용. 지오코딩은 `geocodeMany`=캐시 1회 일괄조회+미스만 병렬(단건 순차조회 금지). ⚠️ 카카오 결과는 **아파트 카테고리(`주거시설 > 아파트`)를 우선 선택**할 것 — 첫 결과를 그냥 쓰면 단지 안의 전기차충전소·관리사무소·어린이집에 핀이 꽂힌다(2026-07-29 안양 동안구 60곳 실측: 다른 동 0건·실패 0건인데 **7곳이 비아파트 POI**). 이 선택이 `place_name`(네이버 딥링크용)도 겸한다.
- 운영 테이블 **대량 delete는 자동 권한 분류기가 차단**(2026-07-12 news_items 비수도권 정리 시도) → 조회 필터 + TTL 프루닝 자연소멸 같은 **비파괴 경로로 설계**할 것.
