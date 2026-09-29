"use client";

// 하단 탭바(모바일) + 탭 세그먼트(데스크톱) + 탭 머리. 탭 판정은 URL(usePathname)이 단일 진실이다.
// ⚠️ 이동은 next/link — <a href>로 되돌리면 전체 새로고침이 돼 지도 SDK·실거래를 다시 받는다
//    (2026-09-29 이전의 "뉴스 ↔ 지도 이동이 부자연스럽다"의 원인이 정확히 그것이었다).

import Link from "next/link";
import { useShell } from "./AppShell";
import {
  tabBar, tabItem, tabItemOn, tabIcon, tabDot, segWrap, segBtn, segBtnOn,
  tabHeader, tabHeaderTitle, tabHeaderSub,
} from "./mapStyles";

export const TABS = [
  { id: "map", href: "/", icon: "🗺", label: "지도" },
  { id: "today", href: "/news", icon: "🔥", label: "오늘" },
  { id: "news", href: "/news/list", icon: "📰", label: "뉴스" },
];

export default function TabBar() {
  const { tab, newsNew } = useShell();
  return (
    <nav style={tabBar} aria-label="탭">
      {TABS.map((t) => (
        <Link key={t.id} href={t.href} style={{ ...tabItem, ...(tab === t.id ? tabItemOn : null) }}>
          <span style={tabIcon}>{t.icon}</span>
          {t.label}
          {t.id === "today" && newsNew > 0 && <span style={tabDot}>{newsNew}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function TabSwitcher() {
  const { tab, newsNew } = useShell();
  return (
    <div style={segWrap} role="tablist">
      {TABS.map((t) => (
        <Link key={t.id} href={t.href} style={{ ...segBtn, ...(tab === t.id ? segBtnOn : null) }}>
          {t.icon} {t.label}
          {t.id === "today" && newsNew > 0 && ` ${newsNew}`}
        </Link>
      ))}
    </div>
  );
}

// 오늘·뉴스 탭 머리. 데스크톱은 여기 세그먼트가 붙는다(지도 탭은 ControlPanel 머리에 붙는다).
export function TabHeader({ title, sub, right }) {
  const { isMobile } = useShell();
  return (
    <div style={tabHeader}>
      <span style={tabHeaderTitle}>{title}</span>
      <span style={tabHeaderSub}>{sub}</span>
      {right}
      {!isMobile && <TabSwitcher />}
    </div>
  );
}
