// KakaoMap 계열 인라인 스타일 상수 모음(팔레트는 lib/palette.js).
// ⚠️ 상수 추가 전 이 파일에서 이름 grep 필수 — 중복 정의 시 dev 컴파일 에러.
// ⚠️ 토글쌍(xxx/xxxOn)은 xxxOn이 borderColor만 덮으면 shorthand `border` 금지
//    (React dev 경고 → pillBtn처럼 borderWidth/Style/Color로 분해).

import { C, PANEL_SHADOW, GLASS, GLASS_BORDER, TRANSITION } from "../lib/palette";

// 레이어 순서 — 모바일에서 패널이 겹치던 원인이 z-index 중복(전부 10)이었다.
// 새 오버레이를 추가할 땐 반드시 여기에 등록할 것.
// PANEL = 오늘·뉴스 탭 패널(지도·시트를 덮는다) / TABBAR = 모바일 하단 탭바(패널 위, 모달 아래).
export const Z = { MAP: 0, TOPBAR: 20, BACKDROP: 30, SHEET: 31, PANEL: 40, TABBAR: 45, MODAL: 50 };
// 모바일 하단 탭바 높이(px, safe-area 제외). 시트·패널·📍 버튼이 이 위에 앉는다.
export const TABBAR_H = 56;

export const controlPanel = {
  position: "absolute", top: 14, left: 14, zIndex: Z.TOPBAR,
  ...GLASS, padding: 14,
  borderRadius: 18, boxShadow: PANEL_SHADOW, border: GLASS_BORDER,
  fontSize: 13, display: "flex", flexDirection: "column", gap: 9, width: 300,
};
export const panelTitle = { fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" };
export const detailPanel = {
  position: "absolute", top: 14, right: 14, bottom: 14, zIndex: Z.TOPBAR, width: 320,
  overflowY: "auto", ...GLASS, background: "rgba(255,255,255,0.94)", padding: "18px 20px",
  borderRadius: 20, boxShadow: PANEL_SHADOW, border: GLASS_BORDER,
};
// ⚠️ flex:1 금지 — 세로 flex 패널의 직계 자식이면 세로로 늘어남(시군구 칸 304px 사고).
// 가로 행에서 폭을 나눌 땐 사용처에서 flex:1을 덧씌울 것.
export const selectStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 10,
  border: `1px solid ${C.border}`, fontSize: 13, background: "#fff",
  color: C.text, cursor: "pointer", transition: TRANSITION,
};
export const pillBtn = {
  flex: 1, padding: "8px 6px", borderRadius: 10,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.sub, fontSize: 12, fontWeight: 600, cursor: "pointer",
  transition: TRANSITION,
};
export const pillBtnOn = { background: C.blueSoft, borderColor: "#bfdbfe", color: C.blue };
export const statusText = { fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.4 };
export const refreshBtn = {
  flex: "0 0 auto", padding: "3px 8px", borderRadius: 8, border: `1px solid ${C.border}`,
  background: "#fff", color: C.sub, fontSize: 11, fontWeight: 600, cursor: "pointer",
  transition: TRANSITION,
};
export const hintLine = { fontSize: 11, color: C.muted };
export const hintText = { fontSize: 12, color: C.muted, padding: "8px 0" };
export const legendRow = { display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: C.sub };
export const legendItem = { display: "inline-flex", alignItems: "center", gap: 4 };
export const legendDot = { width: 9, height: 9, borderRadius: "50%", display: "inline-block" };

export const drawer = {
  marginTop: 2, borderTop: `1px solid ${C.divider}`, paddingTop: 10,
  display: "flex", flexDirection: "column", gap: 7, fontSize: 12,
};
export const drawerHead = { fontSize: 12, fontWeight: 700, color: C.text };
export const fieldRow = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
export const fieldLabel = { color: C.sub, fontSize: 12 };
export const fieldInput = {
  width: 116, padding: "6px 8px", borderRadius: 9, border: `1px solid ${C.border}`,
  fontSize: 12, background: "#fff", color: C.text, transition: TRANSITION,
};
export const favRow = {
  fontSize: 12, color: C.text, padding: "6px 2px",
  borderBottom: `1px solid ${C.divider}`,
};
// 즐겨찾기 D-day(임대차 만기·이벤트 메모) UI.
export const favEditBtn = {
  flexShrink: 0, marginLeft: 6, fontSize: 11, padding: "0 6px", borderRadius: 7,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.muted, cursor: "pointer", transition: TRANSITION,
};
export const favDdayLine = {
  display: "flex", gap: 10, flexWrap: "wrap", marginTop: 3,
  fontSize: 11, fontWeight: 600, color: "#b45309",
};
export const favEditBox = {
  marginTop: 4, padding: "6px 8px", background: C.blueSoft,
  borderWidth: 1, borderStyle: "solid", borderColor: "#dbeafe", borderRadius: 10,
};
export const favSaveBtn = {
  fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 7,
  borderWidth: 1, borderStyle: "solid", borderColor: C.blue,
  background: C.blue, color: "#fff", cursor: "pointer", transition: TRANSITION,
};
// ⚠️ 즐겨찾기 해제는 **여기서도** 되어야 한다. 지도 핀으로만 풀 수 있게 두면 지울 방법이
//    사라지는 경우가 있다: 단지 핀은 면적·가격 필터를 통과한 거래가 있어야만 그려지고
//    (renderMarkers), 타지역 ★ 폴백은 현재 지역을 제외한다 → 필터에 걸리거나 그 달 거래가
//    없는 ★ 단지는 지도에서 완전히 사라져 세부패널의 ★ 버튼에 도달할 수 없다.
//    2026-08-15 실제 발생(구로구 예원아파트 · 94.63㎡ = 공급 38평이라 "24~34평" 필터 하나로 재현).
export const favDelBtn = {
  flexShrink: 0, marginLeft: 4, fontSize: 11, padding: "0 6px", borderRadius: 7,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.red, cursor: "pointer", transition: TRANSITION,
};

// 단지 리스트 패널(네이버식) — 정렬 바 + 행 목록.
export const sortBar = {
  display: "flex", alignItems: "center", gap: 8,
  paddingTop: 9, borderTop: `1px solid ${C.divider}`,
};
export const sortSelect = {
  flex: "0 1 150px", padding: "5px 7px", borderRadius: 8,
  border: `1px solid ${C.border}`, fontSize: 12, background: "#fff",
  color: C.text, cursor: "pointer", fontWeight: 600, transition: TRANSITION,
};
// 이름 검색 — 📢 요주의 단지의 "지도에서 보기"가 착지하는 자리이기도 하다.
// ⚠️ nameSearchInput의 flex:1은 **가로 행(nameSearchBar) 안**이라 안전하다. 컨트롤 패널의
//    세로 flex 직계 자식에 flex:1을 주면 세로로 자란다(시군구 select 304px 사고, 2026-07-03).
export const nameSearchBar = { display: "flex", alignItems: "center", gap: 6, paddingTop: 8 };
export const nameSearchInput = {
  flex: 1, minWidth: 0, padding: "5px 8px", borderRadius: 8,
  border: `1px solid ${C.border}`, fontSize: 12, background: "#fff",
  color: C.text, transition: TRANSITION,
};
export const nameSearchClear = {
  padding: "5px 8px", borderRadius: 8, border: `1px solid ${C.border}`,
  background: "#fff", color: C.sub, fontSize: 11, fontWeight: 700,
  cursor: "pointer", whiteSpace: "nowrap",
};
export const nameSearchMiss = {
  fontSize: 12, color: C.muted, padding: "8px 0", lineHeight: 1.6,
};
export const onlyBuyLabel = {
  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11,
  color: C.sub, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
};
export const listScroll = { flex: 1, minHeight: 0, overflowY: "auto", margin: "0 -6px", padding: "0 6px" };
export const rowTop = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 };
export const rowName = {
  fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: "nowrap",
  overflow: "hidden", textOverflow: "ellipsis",
};
export const rowPrice = {
  fontSize: 13, fontWeight: 800, color: C.text, whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};
export const rowSub = { fontSize: 11, color: C.sub, marginTop: 2 };
export const rowBadges = { display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" };
const badgeBase = {
  fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap",
};
export const hotBadge = { ...badgeBase, color: "#b91c1c", background: "#fee2e2" };
export const upBadge = { ...badgeBase, color: "#b45309", background: "#fef9c3" };
export const downBadge = { ...badgeBase, color: "#1d4ed8", background: C.blueSoft };
export const rebuildBadge = { ...badgeBase, color: "#92400e", background: "#fef3c7" };
export const gapOkBadge = { ...badgeBase, color: "#047857", background: "#dcfce7" };
export const gapNoBadge = { ...badgeBase, color: "#be123c", background: "#ffe4e6" };
// 선반영 게이지: 지역 중앙값 대비 초과상승. 크게 양수면 재료(재건축 등) 선반영↑ = 경고 톤.
export const excessBadge = { ...badgeBase, color: C.sub, background: C.divider };
export const excessHotBadge = { ...badgeBase, color: "#b45309", background: "#fef3c7" };
// ── 모바일 셸 ────────────────────────────────────────────────
// 상단은 높이가 고정된 1줄 바, 나머지는 전부 하단 시트 하나.
// 시트는 한 번에 하나만 열리므로 겹침이 구조적으로 불가능하다.
export const mobileTopBar = {
  position: "absolute", top: 8, left: 8, right: 8, zIndex: Z.TOPBAR,
  ...GLASS, borderRadius: 14, border: GLASS_BORDER, boxShadow: PANEL_SHADOW,
  padding: "8px 10px", display: "flex", alignItems: "center", gap: 8,
};
// ⚠️ 1줄 고정 — status 전문(필터 태그·구매가능 수)은 길어서 안 들어간다.
// 짧은 요약만 넣고 ellipsis로 잠근다. 전문은 ⚙️ 시트 안에 그대로 있다.
export const mobileTopText = {
  flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: C.text,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
export const mobileTopBtn = {
  flex: "0 0 auto", position: "relative", padding: "5px 9px", borderRadius: 9,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.sub, fontSize: 13, cursor: "pointer",
  lineHeight: 1, textDecoration: "none", transition: TRANSITION,
};
// 필터가 걸려 있음을 1줄에서도 알리는 점.
export const mobileTopBtnDot = {
  position: "absolute", top: 2, right: 2, width: 6, height: 6,
  borderRadius: "50%", background: C.blue,
};
export const sheetBackdrop = {
  position: "absolute", inset: 0, zIndex: Z.BACKDROP,
  background: "rgba(15,23,42,0.28)",
};
export const mobileSheet = {
  // ⚠️ bottom = 탭바 높이 — 0이면 설정 시트 아랫단이 하단 탭바(Z.TABBAR)에 가려진다.
  position: "absolute", left: 0, right: 0,
  bottom: `calc(${TABBAR_H}px + env(safe-area-inset-bottom))`, zIndex: Z.SHEET,
  // ⚠️ boxSizing 필수 — globals.css에 border-box 전역 리셋이 없어서 기본값이 content-box다.
  // 없으면 maxHeight가 패딩(상10+하16=26px)을 제외해 시트가 70vh를 26px 넘긴다(2026-07-25 실측).
  boxSizing: "border-box",
  maxHeight: "70vh", display: "flex", flexDirection: "column", gap: 8,
  ...GLASS, background: "rgba(255,255,255,0.97)", borderRadius: "20px 20px 0 0",
  padding: "10px 14px 16px", // safe-area는 탭바가 먹는다
  boxShadow: "0 -1px 2px rgba(15,23,42,0.04), 0 -8px 32px rgba(15,23,42,0.16)",
  overflowY: "auto",
};
export const sheetGrip = {
  flex: "0 0 auto", width: 36, height: 4, borderRadius: 999,
  background: C.border, margin: "0 auto 4px",
};

// ── 지도 위 떠 있는 컨트롤 ──────────────────────────────────
// 패널·시트 밖에 직접 렌더한다. ⚠️ controlPanelContent에 넣으면 모바일에서 ⚙️ 시트를
// 열어야만 보인다 — 지도를 보면서 눌러야 하는 버튼이라 시트 밖이어야 한다.
// ⚠️ 데스크톱에서 right 정렬 금지 — 세부패널(right:14, width:320, 전체높이)이 덮어
// 클릭이 안 된다(2026-07-29 실측 clickable:false). 좌측 컨트롤 패널(14+340)과 우측
// 세부패널 사이의 빈 지도 영역에 놓는다. 모바일은 시트가 닫혀 있을 때만 우하단.
export const locateBtn = {
  position: "absolute", left: 368, bottom: 24, zIndex: Z.TOPBAR,
  width: 38, height: 38, borderRadius: "50%",
  ...GLASS, border: GLASS_BORDER, boxShadow: PANEL_SHADOW,
  fontSize: 16, lineHeight: 1, cursor: "pointer", color: C.sub,
  display: "flex", alignItems: "center", justifyContent: "center",
  transition: TRANSITION,
};
// 지도를 밀다 시군구가 바뀌면 조용히 갈아끼우지 않고 알린다 + 되돌릴 기회를 준다.
export const regionToastBox = {
  position: "absolute", left: "50%", transform: "translateX(-50%)", zIndex: Z.TOPBAR,
  ...GLASS, background: "rgba(15,23,42,0.88)", color: "#fff",
  padding: "8px 12px", borderRadius: 999, boxShadow: PANEL_SHADOW,
  fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 10,
  whiteSpace: "nowrap", maxWidth: "calc(100% - 28px)",
};
export const regionToastBtn = {
  border: "none", background: "rgba(255,255,255,0.18)", color: "#fff",
  fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
  cursor: "pointer", flex: "0 0 auto",
};

export const closeBtn = {
  position: "absolute", top: 12, right: 14, border: "none", background: "none",
  fontSize: 22, lineHeight: 1, cursor: "pointer", color: C.muted, zIndex: 1,
};
export const starBtn = {
  border: "none", background: "none", fontSize: 22, lineHeight: 1,
  cursor: "pointer", color: C.amber, padding: 0,
};

export const sectionLabel = { marginTop: 18, fontSize: 12, fontWeight: 700, color: C.text };
export const newsLink = {
  display: "inline-block", marginTop: 7, fontSize: 12, fontWeight: 600,
  color: C.blue, textDecoration: "none",
};
export const naverLandLink = {
  fontSize: 11, fontWeight: 600, color: C.blue, textDecoration: "none",
  whiteSpace: "nowrap", cursor: "pointer",
};

// 갈아타기(보유 주택) UI. 토글쌍은 비shorthand border(pillBtn 규칙 — On이 borderColor만 덮음).
export const ownedBtn = {
  fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 999,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.sub, cursor: "pointer", whiteSpace: "nowrap",
  transition: TRANSITION,
};
export const ownedBtnOn = { borderColor: C.green, color: C.green, background: "#f0fdf4" };
export const ownedBox = {
  marginTop: 2, marginBottom: 6, padding: "8px 10px", background: "#fffbeb",
  borderWidth: 1, borderStyle: "solid", borderColor: "#fde68a", borderRadius: 12,
};
export const ownedClearBtn = {
  marginLeft: 6, fontSize: 10, padding: "0 6px", borderRadius: 7,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.muted, cursor: "pointer", verticalAlign: "1px",
  transition: TRANSITION,
};

export const noticeBox = {
  marginTop: 8, padding: "10px 12px", background: C.blueSoft,
  border: `1px solid #dbeafe`, borderRadius: 12, fontSize: 12, color: C.sub, lineHeight: 1.5,
};
export const pyeongCard = {
  // pyeongCardOn이 borderColor만 덮어쓰므로 shorthand border 금지(React 혼용 경고)
  padding: "10px 12px", borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  borderRadius: 12, background: "#fff", transition: TRANSITION,
};
export const pyeongCardOn = {
  borderColor: C.blue, background: C.blueSoft,
  boxShadow: `0 0 0 1px ${C.blue}, 0 4px 14px rgba(37,99,235,0.14)`,
};
export const loanRow = { marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}` };

// iOS식 세그먼트 컨트롤 — 회색 트랙 + 활성 세그먼트 흰 카드(그림자 링).
// basisBtn은 트랙 밖(1년/3년 토글)에서도 단독 사용되므로 On은 링 섀도로 자립 가능해야 함.
export const basisToggle = {
  display: "inline-flex", padding: 2, gap: 2, background: C.divider,
  border: `1px solid ${C.border}`, borderRadius: 9,
};
export const basisBtn = {
  border: "none", background: "transparent", color: C.sub, fontSize: 11,
  padding: "3px 9px", cursor: "pointer", fontWeight: 600, borderRadius: 7,
  transition: TRANSITION,
};
export const basisBtnOn = {
  background: "#fff", color: C.blue,
  boxShadow: "0 0 0 1px rgba(226,232,240,0.9), 0 1px 3px rgba(15,23,42,0.12)",
};
export const helpBtn = {
  width: 22, height: 22, borderRadius: "50%", border: `1px solid ${C.border}`,
  background: "#fff", color: C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer",
  lineHeight: 1, padding: 0, transition: TRANSITION,
};
export const bindingTag = {
  marginLeft: 5, fontSize: 9, color: C.sub, background: "#e2e8f0",
  borderRadius: 4, padding: "1px 5px", verticalAlign: "middle", fontWeight: 600,
};
export const regBadge = {
  fontSize: 10, color: "#b91c1c", background: "#fee2e2", borderRadius: 6, padding: "2px 7px", fontWeight: 600,
};
export const nonRegBadge = {
  fontSize: 10, color: "#15803d", background: "#dcfce7", borderRadius: 6, padding: "2px 7px", fontWeight: 600,
};
export const linkBtn = {
  border: "none", background: "none", color: C.blue, fontWeight: 700,
  cursor: "pointer", padding: 0, fontSize: 12,
};

// 부대비용 내역 (평형 카드 안에서 접힘/펼침).
export const costToggle = {
  border: "none", background: "none", color: C.blue, fontSize: 11,
  fontWeight: 600, cursor: "pointer", padding: 0, textAlign: "left",
};
export const costTable = {
  marginTop: 6, padding: "7px 9px", background: "#f8fafc",
  borderWidth: 1, borderStyle: "solid", borderColor: C.divider,
  borderRadius: 9, fontSize: 11, color: C.sub,
};
export const costRow = {
  display: "flex", justifyContent: "space-between", padding: "2px 0",
};
export const monthlyLine = {
  fontSize: 12, color: C.sub, marginTop: 3,
  fontVariantNumeric: "tabular-nums",
};
// 부대비용 반영으로 필요자금이 늘어난 것을 최초 1회 알린다.
export const migrateNotice = {
  padding: "9px 11px", background: "#fffbeb",
  borderWidth: 1, borderStyle: "solid", borderColor: "#fde68a",
  borderRadius: 10, fontSize: 11, color: "#92400e", lineHeight: 1.5,
};

export const modalOverlay = {
  position: "fixed", inset: 0, zIndex: Z.MODAL, background: "rgba(15,23,42,0.40)",
  backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};
export const modalCard = {
  position: "relative", width: "100%", maxWidth: 380, maxHeight: "85vh", overflowY: "auto",
  background: "#fff", borderRadius: 20, padding: "20px 22px",
  boxShadow: "0 1px 2px rgba(15,23,42,0.06), 0 20px 60px -12px rgba(15,23,42,0.35)",
};
export const helpBlock = { marginTop: 14 };
export const helpHead = { fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 4 };
export const helpBody = { fontSize: 12.5, color: C.text, lineHeight: 1.7 };

// ── 탭 셸 (AppShell · TabBar · TodayView · NewsList) ──────────────────────
export const tabBar = {
  position: "fixed", left: 0, right: 0, bottom: 0, zIndex: Z.TABBAR,
  height: `calc(${TABBAR_H}px + env(safe-area-inset-bottom))`,
  paddingBottom: "env(safe-area-inset-bottom)", boxSizing: "border-box",
  display: "flex", ...GLASS, background: "rgba(255,255,255,0.96)",
  borderTop: `1px solid ${C.border}`,
};
export const tabItem = {
  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  gap: 2, fontSize: 10.5, fontWeight: 700, color: C.muted, textDecoration: "none", position: "relative",
};
export const tabItemOn = { color: C.blue };
export const tabIcon = { fontSize: 19, lineHeight: 1 };
export const tabDot = {
  position: "absolute", top: 6, left: "calc(50% + 8px)", minWidth: 16, height: 16, padding: "0 4px",
  borderRadius: 999, background: C.red, color: "#fff", fontSize: 10, fontWeight: 800,
  display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
};
// 오늘·뉴스 패널. ⚠️ 숨김은 visibility(스크롤 위치 보존) — display:none은 스크롤을 잃는다.
export const tabPanelMobile = {
  position: "fixed", top: 0, left: 0, right: 0,
  bottom: `calc(${TABBAR_H}px + env(safe-area-inset-bottom))`, zIndex: Z.PANEL,
  overflowY: "auto", background: "#f8fafc",
  padding: "0 14px 24px", boxSizing: "border-box",
};
// 데스크톱: 좌측 컨트롤 패널(340) 자리를 440으로 넓혀 덮는다 — 우측 세부패널과 지도는 그대로 보인다.
export const tabPanelDesktop = {
  position: "absolute", top: 14, left: 14, bottom: 14, width: 440, zIndex: Z.PANEL,
  overflowY: "auto", background: "#f8fafc", borderRadius: 18,
  boxShadow: PANEL_SHADOW, border: GLASS_BORDER, padding: "0 14px 18px", boxSizing: "border-box",
};
// 탭 머리 — 56px(모바일 상단 바와 같은 높이)로 고정해 탭을 넘나들어도 상단 기준선이 안 흔들린다.
// ⚠️ sticky라 배경을 칠해야 스크롤되는 카드가 머리 뒤로 비치지 않는다(패널 배경과 같은 색).
export const tabHeader = {
  position: "sticky", top: 0, zIndex: 2, height: 56, boxSizing: "border-box",
  display: "flex", alignItems: "center", gap: 8,
  background: "#f8fafc", margin: "0 -14px", padding: "0 14px",
};
export const tabHeaderTitle = {
  fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: C.text, whiteSpace: "nowrap",
};
export const tabHeaderSub = {
  flex: 1, minWidth: 0, fontSize: 11, color: C.muted,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
// 데스크톱 [지도 | 오늘 | 뉴스] 세그먼트.
export const segWrap = { display: "flex", gap: 2, padding: 2, borderRadius: 10, background: C.divider, flex: "0 0 auto" };
export const segBtn = {
  position: "relative", padding: "4px 9px", borderRadius: 8, fontSize: 11.5, fontWeight: 700,
  color: C.sub, textDecoration: "none", whiteSpace: "nowrap",
};
export const segBtnOn = { background: "#fff", color: C.text, boxShadow: "0 1px 2px rgba(15,23,42,0.08)" };

// ── 모바일 지도 시트(목록 ↔ 상세 스택) ─────────────────────────────
// 목록은 늘 바닥에 떠 있고(peek) 상세는 그 위에 쌓인다. 백드롭 없음 — 지도가 보이고 만져져야 한다.
// ⚠️ 높이는 SNAP_H로만. full = 상단 바(≈60) 아래까지.
export const SNAP_H = {
  peek: 64,
  half: "50vh",
  full: `calc(100dvh - ${TABBAR_H}px - env(safe-area-inset-bottom) - 64px)`,
};
export const mapSheet = {
  position: "absolute", left: 0, right: 0,
  bottom: `calc(${TABBAR_H}px + env(safe-area-inset-bottom))`, zIndex: Z.SHEET,
  display: "flex", flexDirection: "column", boxSizing: "border-box",
  ...GLASS, background: "rgba(255,255,255,0.97)", borderRadius: "20px 20px 0 0",
  boxShadow: "0 -1px 2px rgba(15,23,42,0.04), 0 -8px 32px rgba(15,23,42,0.16)",
  transition: "height 0.22s ease", overflow: "hidden",
};
export const sheetHandle = {
  flex: "0 0 auto", padding: "8px 14px 6px", touchAction: "none", cursor: "grab",
};
export const sheetHeadRow = {
  display: "flex", alignItems: "center", gap: 8, minHeight: 32,
  fontSize: 13.5, fontWeight: 700, color: C.text,
};
export const sheetHeadTitle = {
  flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
export const sheetHeadBtn = {
  flex: "0 0 auto", padding: "5px 10px", borderRadius: 9,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer",
};
// ⚠️ 목록·상세는 각자 스크롤 컨테이너 — 상세에서 "← 목록"으로 돌아왔을 때 목록 스크롤이 보존된다.
//    숨김은 visibility(display:none은 스크롤 위치를 잃는다).
export const sheetBody = { position: "relative", flex: 1, minHeight: 0 };
export const sheetPane = {
  position: "absolute", inset: 0, overflowY: "auto", padding: "0 14px 14px", boxSizing: "border-box",
};
