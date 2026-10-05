import "./globals.css";
import { preconnect, preload } from "react-dom";
import { KAKAO_SDK_URL, KAKAO_ORIGINS } from "./lib/kakaoSdk";

export const metadata = {
  title: "RealEstate Map — 부동산 실거래가 지도",
  description: "국토부 실거래가를 지도 위에 표시하는 개인용 부동산 웹앱",
  // iOS 홈 화면 추가 시 standalone으로 열기(PWA 매니페스트는 app/manifest.js). statusBarStyle "default"는
  // 콘텐츠를 상태 표시줄 **아래**에서 시작한다 — black-translucent로 바꾸면 상단 바가 노치 밑으로 들어간다.
  appleWebApp: { capable: true, title: "부동산", statusBarStyle: "default" },
};

// 모바일 스케일링 + 노치 대응(시트가 하단 safe-area 침범하지 않도록).
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }) {
  // 지도 SDK·타일 — 하이드레이션 전에 연결과 다운로드를 시작한다(lib/kakaoSdk.js 근거).
  // ⚠️ <link>를 JSX로 직접 쓰면 React 19가 preload를 호이스팅하면서 원래 자리에도 남겨 두 번 찍힌다
  //    (2026-10-05 실측) — react-dom의 preload/preconnect는 중복 제거해 <head>에 한 번만 넣는다.
  for (const o of KAKAO_ORIGINS) preconnect(o);
  preload(KAKAO_SDK_URL, { as: "script" });
  return (
    <html lang="ko">
      <head>
        {/* Pretendard Variable(동적 서브셋) — 실패해도 globals.css 폴백 스택으로 동작 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
