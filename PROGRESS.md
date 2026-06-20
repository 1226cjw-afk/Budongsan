# RealEstate_Map 진척

## 상태: 개발 착수 (2026-06-17 시작)

## ▶ 다음 세션 시작점 (여기서 이어서)
**B(지도+실거래가 마커) + git init + UX(지역/연월 선택) 완료.** 다음 후보:
- **A = Supabase 캐싱** (다음 권장): 단지 170곳 순차 지오코딩에 ~9초 걸림 → 실거래+좌표를 캐시.
  **선결 = 사용자 작업**: Supabase 프로젝트 생성 → `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 추가. 키 들어오면 코드 작업 착수.
- **UX 추가**: 면적별(평형) 가격 필터 (지역/연월 선택은 완료)

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
