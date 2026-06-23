# RealEstate_Map 진척

## 상태: 개발 착수 (2026-06-17 시작)

## ▶ 다음 세션 시작점 (여기서 이어서)
**MVP~3단계 + Vercel 배포까지 완료. 실서비스 가동 중** → https://budongsan-virid.vercel.app
남은 후보:
- 즐겨찾기 타지역 마커 표시(현재는 현재 지역만 금색).
- 경기 일부 지오코딩률 개선(분당 145건→35곳).
- 추세 3년(년도별) 확장 보류(현재 월별 12개월).
- (선택) 커스텀 도메인 연결 / 2FA 설정.
- MCP: `.mcp.json`에 PAT 입력 완료. **Claude 재시작해야 MCP 서버 로드됨**

## ✅ Vercel 배포 완료 (2026-06-23)
- **prod URL**: https://budongsan-virid.vercel.app — 대시보드 import 방식(GitHub `Budongsan` 레포).
  ⚠️ **Vercel CLI는 이 머신에서 불가**(한글 계정명→illegal HTTP header) → 대시보드로 진행.
- **환경변수 7종** 등록(과거 "5종"은 오기): `NEXT_PUBLIC_KAKAO_MAP_KEY`/`KAKAO_REST_API_KEY`/
  `DATA_GO_KR_KEY`/`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/
  `SUPABASE_SECRET_KEY` + `CRON_SECRET`.
- **카카오 디벨로퍼스 Web 플랫폼**에 `https://budongsan-virid.vercel.app` 사이트 도메인 등록(지도 표시 조건).
- **검증**(2026-06-23): 지도+마커 정상 · prod `/api/trades` 137단지 100% 지오코딩 ·
  cron `/api/cron/refresh` 인증 없음/틀린 키 → **401**(CRON_SECRET 보호 확인).
- 브라우저 동작확인(localStorage·평형별 대출·도움말 모달·지도클릭→근접단지) 사용자 "통과" 확인.

## ✅ 단지 패널 보강: 세대수·뉴스·평형별 추세 (2026-06-21)
- **평형별 시세 추세 + Y축 가격**: `TrendChart` 재작성 — 좌측 Y축에 가격 눈금(억) +
  격자선. 추세 섹션에 **평형 선택 칩(전체/각 평형)** → `/api/trend?area=㎡`로 해당 평형만.
  검증: 호계동 평촌어바인퍼스트 39㎡ 12개월 값 정상.
- **관련 뉴스**: 세부패널에 "📰 관련 뉴스 검색" 링크 → 네이버 뉴스 검색(지역+단지명, 새 탭).
  키·설정 불필요.
- **세대수/동수**: `app/lib/kapt.js` + `/api/complex-info` 신설. 국토부 공동주택 API로
  시군구 목록→kaptCode 매칭→기본정보(세대수). 패널 부제목에 "N세대 · M개동" 표시.
  ⚠️ **현행 엔드포인트 V3목록/V4기본정보** 확정(구버전 500=폐기, 현행 403=미승인).
  **data.go.kr에서 '공동주택 단지목록'+'기본정보' 2개 활용신청 필요**(자동승인). 미승인이라
  지금은 세대수 '—' (graceful 검증 완료). 승인되면 즉시 표시.
- `npx next build` 통과. 평형별 추세·뉴스는 즉시 동작, 세대수는 활용신청 후.

## ✅ 3단계 실거래가 자동 갱신 (2026-06-21)
- **`/api/cron/refresh`**: 즐겨찾기(관심 지역) distinct `lawd_cd` × 최근 2개월(이번달+지난달,
  지연신고 반영)을 `fetchRawMonth(refresh:true)`로 강제 재수집 → `trade_raw_cache` 신선 유지.
  `CRON_SECRET` 설정 시 Bearer 인증(Vercel Cron 자동 첨부), 미설정 시 오픈(로컬).
- **`vercel.json`**: cron `0 21 * * *`(매일 06:00 KST) → 배포 후 자동 실행. 새 테이블 없음.
- **신선도 노출**: `trades.js`에 `latestFetchedAt` 추가 → `/api/trades` 응답 `fetchedAt`.
  `KakaoMap.js`에 "🕒 갱신 N시간 전" + **🔄 수동 갱신 버튼**(`refresh=1`) 추가.
- 검증: 임시 즐겨찾기(41173) 추가→cron이 202606(143)/202605(589) 재수집(1s)→삭제 원복.
  `fetchedAt` 응답 확인. `npx next build` 통과.
- ⚠️ 배포 시 `CRON_SECRET` 필수(미설정 prod = 누구나 국토부 호출 트리거 가능).

## ✅ 2단계 대출 계산 UI + 디자인 정리 (2026-06-21)
- `KakaoMap.js`에 `loanPolicy.js`의 `calcMaxLoan`/`isRegulated` 연결. **전면 재작성**.
- **내 자금 프로필**: 좌측 컨트롤 💰 버튼 토글 폼(보유자산/연소득/기존대출 연상환액/
  가구유형/금리%/만기년/생애최초). `localStorage`(`re_loan_profile`)에 저장 → 새로고침 유지.
- **평형별 대출 분석**(세부패널): 단지 선택 시 평형(㎡)별 카드 — 평균/최근 시세 +
  기준가(최근/평균 토글) 기반 대출 가능액·제약(LTV/DSR)·필요자금·보유자산 대비
  **매수 가능/자금 부족**. 규제지역 다주택은 "대출 불가". 연소득 미입력 시 설정 유도.
- **도움말 모달**: 평형 섹션의 `?` 버튼 → LTV/DSR 계산식 설명 팝업(근거·면책 포함).
- **지도 빈 곳 클릭 → 가까운 단지 선택**: map `click`에서 클릭 좌표 200m 내 최근접
  단지 자동 선택(haversine). (카카오 기본지도 POI 라벨은 타일이라 직접 클릭 불가 → 우회).
- **디자인 정리**: 색 팔레트 통일(C), 컨트롤/세부패널 카드화, 요약 3분할 카드, pill 버튼,
  마커 그림자 개선. `npx next build` 통과 + dev 서버 정상 컴파일.
- ⚠️ 순수 클라 로직(API 무관) → 브라우저에서 표시/저장/지도클릭 최종 확인 필요.

## ✅ 지오코딩 일괄처리 속도개선 (2026-06-21)
- 병목: 단지별 좌표를 **순차로 N회** Supabase 조회(안양 137회) → 재방문도 느림.
- `geocodeMany(lawdCd, items)`: ① 시군구 캐시 좌표 **1회 일괄 조회** ② 미스만 **병렬(동시 8)** 지오코딩
  ③ 새 좌표 **일괄 upsert**. `geocodeCached`(단건) 대체. `/api/trades`도 일괄 호출로 변경.
- 결과: 새 지역 첫 로드 ~10s→**2.2s**, 재방문 **0.36s** (3개월 유지). 검증: 송파 콜드/웜.

## ✅ 지도탐색 + 추세그래프 + 즐겨찾기 (2026-06-21)
- **지도 이동→지역 자동전환**: SDK `libraries=services`, `idle`에 중심좌표 `coord2regioncode`로
  시군구 인식 → 목록에 있으면 해당 지역 로드. 팬 시 자동맞춤 끔(fitRef), 드롭다운/즐겨찾기 시 맞춤.
- **기본 지역 안양시 동안구**(41173), 지도 중심 안양.
- **최근 3개월 병합**: `/api/trades?months=3`. 캐시 구조 개편 — `app/lib/trades.js` 공용
  (`fetchRawMonth`=원본 월별 캐시 `trade_raw_cache`, `geocodeCached`=좌표 캐시 `geocode_cache`).
  기존 trade_cache는 미사용. 검증: 안양동안 3개월 1377건/137단지/100%.
- **추세**: `/api/trend` 월별 12개월 평균(지오코딩 X, 빠름). 세부패널에 SVG 라인차트(상승=빨강).
- **즐겨찾기**: `/api/favorites` CRUD + `favorites` 테이블. 세부패널 ★토글, 목록 패널(클릭→이동),
  현재지역 즐겨찾기 마커 금색. 검증: 추가/목록/삭제 정상(UTF-8).
- DB: migration `0002_trend_geocode_favorites.sql` (3테이블, SQL Editor 실행 완료).
- ⚠️ 지도탐색은 브라우저에서 동작확인 필요(서버 테스트 불가).

## ✅ 지오코딩 개선 + 세부정보 패널 (2026-06-21)
- 지역 데이터 `app/lib/regions.js`로 분리(서버/클라 공용). `regionPrefix`/`regionToken` 추가.
- `route.js` geocode: 쿼리에 "시도 시군구" 붙이고, 결과 주소가 해당 지역 토큰 포함하는지 **검증**
  → 동명이단지가 부산 등으로 찍히던 버그 해결. 다단계 폴백으로 지오코딩율↑.
  검증: 안양 동안구 109단지 **100%**·부산 의심 0, 분당 35단지 100%.
- `KakaoMap.js`: 마커 클릭 → **우측 세부정보 패널**(준공년도, 이달 평균/최근, **평형별 표**:
  전용㎡(평)·건수·평균·최근). 인포윈도우 제거.
- ⚠️ 지오코딩 로직 바꿔 캐시 비웠음(재조회 시 재생성).

## ✅ 경기권 + 평균시세/최근거래 + 가격필터 (2026-06-21)
- `KakaoMap.js`: 지역 드롭다운 **서울+경기**(optgroup, 경기 41xxx 41개). 경기 코드 검증 권장.
- 마커=**평균 시세**, 인포윈도우=평균/최근거래(날짜)+**평수별 표**(거래수·평균·최근).
- **가격대 드롭다운**(전체/~3/3~6/6~9/9~12억) 추가. 면적+가격 동시 필터(클라, 재요청 없음).
- 검증: 분당(41135) 145건·12억↑ 0건, 단지별 평균/최근/평수별 정확.
- ⚠️ 경기 일부 지오코딩률 낮음(분당 145건→35곳) — 추후 개선 여지.

## ✅ 2단계 정책/계산 모듈 (2026-06-21)
- `app/lib/loanPolicy.js`: 규제지역 판정(서울 전역+경기 12곳), LTV/DSR 규칙, `calcMaxLoan`.
  근거 = **10.15 대책**(2025-10-16 시행) + 스트레스 DSR 3단계. 출처·시행일 주석 명시.
  규칙: 규제 LTV 40%(생애최초 80%/수도권 6억), 가격상한 15억↓6억·~25억 4억·25억↑ 2억,
  DSR 40%, 스트레스금리 규제 3.0%/지방 0.75%(2026-06-30 한시).
- 검증: 강남 20억→4억(LTV상한), 부산 5억→3.5억, 강남 30억→2억상한 확인.
- ⚠️ 정책 변경 시 이 파일만 갱신. UI/지도 연동은 다음 단계.

## ✅ 면적 필터 완료 (2026-06-20)
- `KakaoMap.js`: 전용면적 구간(전체/~60/60~85/85~135/135㎡~) 드롭다운 추가.
  데이터 로드(loadTrades)와 마커 렌더(renderMarkers) 분리 → 면적만 바꾸면 **재요청 없이** 클라에서 필터.
  구간 거래 없는 단지는 숨김, 가격 요약(최고/최저) 구간 기준 재계산.
- 검증: 강남구 202605 구간 합 149+116+99+36 = 400(전체) 일치.

## ✅ Supabase 캐싱 완료 (2026-06-20)
- 테이블 `public.trade_cache` (PK `lawd_cd`+`deal_ymd`, `payload jsonb`, `fetched_at`),
  RLS 켜고 정책 없음 → secret 키(서버)만 접근. 스키마: `supabase/migrations/0001_trade_cache.sql`
- `app/lib/supabaseServer.js`: secret 키 서버 클라이언트 (키 없으면 null → 캐시 없이 graceful degrade)
- `app/api/trades/route.js`: 캐시 히트 시 즉시 반환 / 미스 시 국토부+지오코딩 후 upsert.
  이번 달은 12h TTL, 지난 달은 영구. `?refresh=1`로 강제 갱신.
- **검증**: 강남구 202605 미스 10.8s → 히트 0.66s (cached:true), DB 행 저장 확인.
- 새 Supabase 키 형식 사용: publishable(클라)/secret(서버). `.env.local`에 URL/두 키 저장.

## ✅ git init + UX 완료 (2026-06-20)
- `git init` + 첫 커밋. `.gitignore`가 `.env.local`/`.mcp.json`/node_modules/.next 제외 확인
  (`.env.local`은 `!!` ignored 상태로 검증). 아직 원격 저장소 없음.
- `KakaoMap.js`: 서울 25개 구 + 최근 13개월 거래연월 **선택 드롭다운** 추가
  (기존 강남구/202605 하드코딩 제거). 로드 후 마커에 맞춰 `map.setBounds()` 자동 이동.
- `npx next build` 통과 확인.

## ✅ B단계 완료 (2026-06-17) — 지도에 실거래가 마커
- `app/api/trades/route.js`: 국토부 실거래가 호출(http/UA/XML quirk 준수) → `<item>` 정규식 파싱
  → 단지명 기준 그룹핑 → 카카오 로컬 API 지오코딩(키워드→지번 폴백) → JSON 반환
- `app/components/KakaoMap.js`: `/api/trades` 호출 → 단지별 가격 커스텀 오버레이 마커 +
  클릭 시 거래건수/최고·최저가 인포윈도우. 좌측 상단 상태 배지.
- 검증: 강남구(11680)/202605 → 거래 366건 / 170단지 / **170곳 전부 지오코딩 성공**
- 카카오 REST 키(`KAKAO_REST_API_KEY`) `.env.local` 등록·검증 완료

## 결정된 것
- 폴더명: `RealEstate_Map`
- 스택: Next.js (App Router) + Supabase
- MVP: 지도 + 국토부 실거래가 표시부터
- 데이터: 국토부 실거래가 공개 API(data.go.kr) + **카카오맵 API 확정**
- 지도 키: 카카오 JS 키 발급·`.env.local` 저장, `localhost:3000` 도메인 등록 완료

## 다음 할 일 (MVP)
- [x] 지도 API 선택 → **카카오 확정**, JS 키 발급
- [x] 카카오 디벨로퍼스 사이트 도메인 등록 (`http://localhost:3000`)
- [x] Next.js(App Router) 초기화 + 카카오맵 컴포넌트로 지도 띄우기 (서울시청 중심 + 마커)
- [x] 브라우저에서 지도 표시 최종 확인 (서울시청 지도 정상 렌더링)
- [x] 공공데이터포털(data.go.kr) 실거래가 API 키 발급 + **실호출 검증 완료**
      (호출 quirk: http만 동작 / User-Agent 필수 / XML 전용 `_type=json` 금지)
- [ ] Supabase 프로젝트 생성 → URL/키 `.env.local` 연결
- [ ] 실거래가 API 호출 → 한 지역(법정동코드+거래연월) 데이터 받아오기 테스트
- [x] 실거래가 API 호출 → 한 지역(법정동코드+거래연월) 데이터 받아오기 (API 라우트)
- [x] 단지 주소 → 카카오 로컬 API 지오코딩 → 좌표 변환
- [x] 받아온 거래가를 지도 위 마커/오버레이로 표시
- [ ] Supabase에 실거래 캐시 저장 (호출 한도·지오코딩 지연 대응)

## 미정 / 나중에 결정
- 배포처: Vercel 유력
- LTV/DSR 정책 규칙 상세 (2단계)
- 실시간 자동 갱신 주기·방식 (3단계)

## 메모
- 참조 앱(호갱노노 등)은 공개 API 없음 → 같은 원천(국토부)에서 직접 수집하는 구조.
