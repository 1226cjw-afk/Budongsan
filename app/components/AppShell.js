"use client";

// 앱 셸 — 지도는 **한 번만** 뜨고 계속 산다. 오늘·뉴스 탭은 그 위를 덮는 패널이다.
// 왜: 예전엔 /news로 <a href> 이동이라 탭을 오갈 때마다 전체 새로고침 → 카카오 SDK·실거래·
//     선택 단지를 전부 버렸다(2026-09-29 사용자: "이동이 너무 부자연스럽다").
// ⚠️ 페이지(app/(main)/**/page.js)는 URL만 제공하고 null을 렌더한다. 화면은 여기서 pathname으로
//    골라 그리고, **한 번 연 패널은 계속 마운트**해 둔다 — 페이지 컴포넌트로 두면 탭을 떠날 때
//    언마운트돼 돌아올 때 /api/briefing 재요청 + 스크롤이 맨 위로 튄다.
// ⚠️ KakaoMap을 조건부로 렌더하지 말 것 — 언마운트되는 순간 이 셸을 만든 이유가 사라진다.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import KakaoMap from "./KakaoMap";
import TabBar from "./TabBar";
import TodayView from "./TodayView";
import NewsList from "./NewsList";
import useIsMobile from "./useIsMobile";
import useLoanProfile from "./useLoanProfile";
import { classifyNews, newsPriority } from "../lib/news";
import { countNew } from "../lib/briefingSeen";
import { tabPanelMobile, tabPanelDesktop } from "./mapStyles";

const ShellCtx = createContext(null);
export const useShell = () => useContext(ShellCtx);

export function tabFromPath(p) {
  if (p === "/news") return "today";
  if (p && p.startsWith("/news/list")) return "news";
  return "map";
}

// /api/news — 두 탭(오늘의 📢 뉴스 칩 · 뉴스 목록)이 공유. 필요한 탭이 처음 열릴 때 1회만 받는다.
function useNewsFeed(enabled) {
  const [items, setItems] = useState(null); // null = 로딩 중(또는 아직 안 받음)
  const [days, setDays] = useState(7);
  const [error, setError] = useState("");
  const profile = useLoanProfile();
  const hasIncome = Number(profile?.income) > 0;

  const reload = useCallback(async () => {
    try {
      // ⚠️ limit 600: 2026-09-02 키워드 확장 후 최근 7일이 이미 372건. 잘리면 요주의 집계 모수가 준다.
      const res = await fetch("/api/news?limit=600");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setItems(json.items);
      if (json.days) setDays(json.days);
      setError("");
    } catch (e) {
      setError(e.message);
      setItems([]);
    }
  }, []);
  const started = useRef(false);
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    reload();
  }, [enabled, reload]);

  // 카테고리·중요도는 제목에서 한 번만 계산(둘 다 DB 컬럼 없음). 소득이 있으면 대출 기사 한 칸 ↑.
  const withCat = useMemo(
    () =>
      (items || []).map((it) => {
        const cat = classifyNews(it.title);
        return { ...it, cat, priority: newsPriority({ ...it, cat }, { hasIncome }) };
      }),
    [items, hasIncome]
  );
  return useMemo(
    () => ({ items, withCat, days, error, reload, hasIncome }),
    [items, withCat, days, error, reload, hasIncome]
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const tab = tabFromPath(pathname);
  const isMobile = useIsMobile();

  const [visited, setVisited] = useState(() => new Set([tab]));
  useEffect(() => {
    setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab)));
  }, [tab]);

  const news = useNewsFeed(visited.has("today") || visited.has("news"));

  // 🔥 오늘 배지 — 브리핑 미확인 단지 수. 지도 초기 로드와 경쟁하지 않게 조금 늦게 부른다.
  const [newsNew, setNewsNew] = useState(0);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      fetch("/api/briefing")
        .then((r) => r.json())
        .then((d) => alive && setNewsNew(countNew(d.complexes)))
        .catch(() => {});
    }, 1500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);
  useEffect(() => {
    if (tab === "today") setNewsNew(0); // Briefing이 markSeen — 본 순간 배지를 지운다
  }, [tab]);

  // 🔥 오늘 탭 → 지도의 단지. KakaoMap이 focusRef에 자기 핸들러를 꽂는다.
  // 모바일은 패널이 지도를 덮으니 지도 탭으로 전환, 데스크톱은 탭을 유지한 채 옆 지도·우측 상세만 연다.
  const focusRef = useRef(null);
  const focusComplex = useCallback(
    (target) => {
      if (isMobile && tab !== "map") router.push("/");
      focusRef.current?.(target);
    },
    [isMobile, tab, router]
  );

  const value = useMemo(
    () => ({ tab, isMobile, focusRef, focusComplex, news, newsNew }),
    [tab, isMobile, focusComplex, news, newsNew]
  );

  const panel = (id, node) =>
    visited.has(id) && (
      <div
        style={{
          ...(isMobile ? tabPanelMobile : tabPanelDesktop),
          visibility: tab === id ? "visible" : "hidden",
          pointerEvents: tab === id ? "auto" : "none",
        }}
        aria-hidden={tab !== id}
      >
        {node}
      </div>
    );

  return (
    <ShellCtx.Provider value={value}>
      <KakaoMap />
      {panel("today", <TodayView />)}
      {panel("news", <NewsList />)}
      {isMobile && <TabBar />}
      {children}
      <style>{`.news-row { transition: background 0.15s; } .news-row:hover { background: #f8fafc; }`}</style>
    </ShellCtx.Provider>
  );
}
