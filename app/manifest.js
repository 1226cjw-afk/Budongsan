// PWA 매니페스트 — 폰 홈 화면에 추가하면 주소창 없이 앱처럼 열린다(2026-10-05).
// 이 앱은 "매일 반복 확인" 도구이고 사용자는 폰 위주라, 브라우저 탭을 찾아 들어오는 단계를 없앤다.
// 오프라인 지원(서비스 워커)은 일부러 넣지 않았다 — 실거래·브리핑은 늘 서버 데이터라 캐시된 낡은
// 화면을 보여주는 쪽이 더 해롭다.
// ⚠️ iOS 홈 화면 앱은 Safari와 **localStorage가 분리**된다 — 자금 설정(re_loan_profile)·마지막 지도 위치는
//    홈 화면 앱에서 한 번 다시 입력해야 한다. ★ 즐겨찾기는 서버(Supabase)라 그대로 보인다.
// 아이콘은 app/icon.svg와 같은 디자인을 PNG로 렌더한 것(public/icon-*.png, app/apple-icon.png).
export default function manifest() {
  return {
    name: "RealEstate Map — 부동산 실거래가 지도",
    short_name: "부동산",
    description: "국토부 실거래가 지도 · 대출 계산 · 오늘의 브리핑",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc", // globals.css body 배경 — 스플래시가 첫 화면과 이어진다
    theme_color: "#ffffff",
    lang: "ko",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
