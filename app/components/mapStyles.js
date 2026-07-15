// KakaoMap 계열 인라인 스타일 상수 모음(팔레트는 lib/palette.js).
// ⚠️ 상수 추가 전 이 파일에서 이름 grep 필수 — 중복 정의 시 dev 컴파일 에러.
// ⚠️ 토글쌍(xxx/xxxOn)은 xxxOn이 borderColor만 덮으면 shorthand `border` 금지
//    (React dev 경고 → pillBtn처럼 borderWidth/Style/Color로 분해).

import { C, PANEL_SHADOW, GLASS, GLASS_BORDER, TRANSITION } from "../lib/palette";

export const controlPanel = {
  position: "absolute", top: 14, left: 14, zIndex: 10,
  ...GLASS, padding: 14,
  borderRadius: 18, boxShadow: PANEL_SHADOW, border: GLASS_BORDER,
  fontSize: 13, display: "flex", flexDirection: "column", gap: 9, width: 300,
};
export const panelTitle = { fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" };
export const newsTabLink = {
  fontSize: 11, fontWeight: 600, color: C.blue, textDecoration: "none",
  padding: "3px 9px", background: C.blueSoft, borderRadius: 999, transition: TRANSITION,
};
export const detailPanel = {
  position: "absolute", top: 14, right: 14, bottom: 14, zIndex: 10, width: 320,
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
export const mobileListSheet = {
  position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 12,
  maxHeight: "62vh", display: "flex", flexDirection: "column", gap: 8,
  ...GLASS, background: "rgba(255,255,255,0.96)", borderRadius: "20px 20px 0 0",
  padding: "14px 14px calc(16px + env(safe-area-inset-bottom))",
  boxShadow: "0 -1px 2px rgba(15,23,42,0.04), 0 -8px 32px rgba(15,23,42,0.16)",
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

export const modalOverlay = {
  position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.40)",
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
