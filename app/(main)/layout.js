// 지도·오늘·뉴스 세 탭이 공유하는 셸. ⚠️ 형제 라우트 사이 이동에선 이 레이아웃이 리마운트되지
// 않는다 — 지도가 한 번만 뜨는 근거가 이것이다. 새 탭 페이지는 이 그룹 안에 둘 것.
import AppShell from "../components/AppShell";

export default function MainLayout({ children }) {
  return <AppShell>{children}</AppShell>;
}
