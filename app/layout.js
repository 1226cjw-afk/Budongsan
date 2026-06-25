export const metadata = {
  title: "RealEstate Map — 부동산 실거래가 지도",
  description: "국토부 실거래가를 지도 위에 표시하는 개인용 부동산 웹앱",
};

// 모바일 스케일링 + 노치 대응(시트가 하단 safe-area 침범하지 않도록).
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
