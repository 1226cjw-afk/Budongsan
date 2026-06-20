# RealEstate_Map — 부동산 지도/대출 비교 웹앱

## 한 줄 소개
지도 위에 국토부 실거래가 매물대를 띄우고, 내 자산 대비 LTV/DSR 설정에 따라
대출 가능 여부·필요 대출액을 계산해 비교해주는 개인용 부동산 웹앱.
참조 서비스: 네이버 부동산 / 아파트실거래 / 호갱노노 (데이터는 직접 가져오지 않고 같은 원천에서 수집).

## 기술 스택
- **Next.js** (App Router) + **Supabase** (DB/Auth/실시간)
- 지도: **카카오맵 API 확정** (2026-06-17) — 키 2종: **JS 키**(`NEXT_PUBLIC_KAKAO_MAP_KEY`, 클라이언트 지도용) / **REST 키**(`KAKAO_REST_API_KEY`, 서버 지오코딩용, 비밀). 둘 다 카카오 디벨로퍼스 `앱 → 플랫폼 키`에서 발급
- 배포: 미정 (Vercel 유력 — Next.js와 궁합)

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
1. **지도 + 실거래가** — 지도 위 위치별 실거래 매물대 표시  ← **현재 MVP**
2. **대출 계산/비교** — 자산·LTV·DSR 입력 → 대출 가능액/가능여부, 정책 반영 비교 화면
3. **즐겨찾기 + 자동 업데이트** — 관심 위치 저장, 실거래가 주기적 자동 갱신

## MVP (1단계) 범위
- 지도 띄우기 (지도 API 연동, 키 발급)
- 국토부 실거래가 API 연동 → 특정 지역 거래 데이터 수집
- 지도 위에 매물대(거래가) 마커/오버레이로 표시
- 대출 계산·즐겨찾기·실시간 갱신은 2단계 이후

## 개발 메모
- 실행: `npm run dev` → http://localhost:3000 (카카오 디벨로퍼스에 이 도메인 등록돼 있어야 지도 뜸)
- 구조: App Router. 지도는 `app/components/KakaoMap.js`(클라이언트, SDK `autoload=false`로 동적 로드). 실거래가 마커는 여기에 추가
- 스택 버전: Next.js 16 + React 19 (수동 스캐폴딩, `create-next-app` 미사용 — 기존 .md 파일 충돌 회피)

## 작업 규칙
- 비밀키(API 키, Supabase 키, `.mcp.json`)는 **절대 커밋 금지** → `.gitignore` 확인 필수.
  Next.js에서는 `.env.local` 사용, `NEXT_PUBLIC_` 접두사는 클라이언트 노출되니 주의.
- 정책 규칙(LTV/DSR)은 하드코딩하되 **출처·시행일 주석**을 반드시 달 것 (나중에 갱신 추적).
- 한글 든 파일은 Read 도구로 볼 것 (PowerShell Get-Content 인코딩 깨짐).
- 진척은 이 폴더의 `PROGRESS.md`에 기록.
