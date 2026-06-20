export const metadata = {
  title: "RealEstate Map — 부동산 실거래가 지도",
  description: "국토부 실거래가를 지도 위에 표시하는 개인용 부동산 웹앱",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
