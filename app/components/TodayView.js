"use client";

// 🔥 오늘 탭 — 브리핑(+ 핫플). 뉴스 목록은 📰 탭으로 분리됐다(2026-09-29).
// news는 셸이 한 번 받아 두 탭이 공유한다(📢 뉴스 칩 = buildNewsWatch 원료).

import Briefing from "./Briefing";
import { useShell } from "./AppShell";
import { TabHeader } from "./TabBar";

export default function TodayView() {
  const { news, tab } = useShell();
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
      <TabHeader title="🔥 오늘" sub="관심 단지 · 새 신고 · 청약 — 매일 아침 갱신" />
      <Briefing news={news.withCat} active={tab === "today"} />
    </div>
  );
}
