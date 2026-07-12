// KakaoMap 계열 인라인 스타일 상수 모음(팔레트는 lib/palette.js).
// ⚠️ 상수 추가 전 이 파일에서 이름 grep 필수 — 중복 정의 시 dev 컴파일 에러.
// ⚠️ 토글쌍(xxx/xxxOn)은 xxxOn이 borderColor만 덮으면 shorthand `border` 금지
//    (React dev 경고 → pillBtn처럼 borderWidth/Style/Color로 분해).

import { C, PANEL_SHADOW } from "../lib/palette";

export const controlPanel = {
  position: "absolute", top: 14, left: 14, zIndex: 10,
  background: "rgba(255,255,255,0.98)", padding: 14,
  borderRadius: 14, boxShadow: PANEL_SHADOW, border: `1px solid ${C.border}`,
  fontSize: 13, display: "flex", flexDirection: "column", gap: 9, width: 300,
};
export const panelTitle = { fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" };
export const newsTabLink = {
  fontSize: 11, fontWeight: 600, color: C.blue, textDecoration: "none",
  padding: "2px 8px", background: C.blueSoft, borderRadius: 999,
};
export const detailPanel = {
  position: "absolute", top: 14, right: 14, bottom: 14, zIndex: 10, width: 320,
  overflowY: "auto", background: "#fff", padding: "18px 20px",
  borderRadius: 16, boxShadow: PANEL_SHADOW, border: `1px solid ${C.border}`,
};
// ⚠️ flex:1 금지 — 세로 flex 패널의 직계 자식이면 세로로 늘어남(시군구 칸 304px 사고).
// 가로 행에서 폭을 나눌 땐 사용처에서 flex:1을 덧씌울 것.
export const selectStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: `1px solid ${C.border}`, fontSize: 13, background: "#fff",
  color: C.text, cursor: "pointer",
};
export const pillBtn = {
  flex: 1, padding: "8px 6px", borderRadius: 8,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.sub, fontSize: 12, fontWeight: 600, cursor: "pointer",
};
export const pillBtnOn = { background: C.blueSoft, borderColor: "#bfdbfe", color: C.blue };
export const statusText = { fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.4 };
export const refreshBtn = {
  flex: "0 0 auto", padding: "3px 8px", borderRadius: 7, border: `1px solid ${C.border}`,
  background: "#fff", color: C.sub, fontSize: 11, fontWeight: 600, cursor: "pointer",
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
  width: 116, padding: "6px 8px", borderRadius: 7, border: `1px solid ${C.border}`,
  fontSize: 12, background: "#fff", color: C.text,
};
export const favRow = {
  fontSize: 12, color: C.text, padding: "6px 2px",
  borderBottom: `1px solid ${C.divider}`,
};
// 즐겨찾기 D-day(임대차 만기·이벤트 메모) UI.
export const favEditBtn = {
  flexShrink: 0, marginLeft: 6, fontSize: 11, padding: "0 6px", borderRadius: 6,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.muted, cursor: "pointer",
};
export const favDdayLine = {
  display: "flex", gap: 10, flexWrap: "wrap", marginTop: 3,
  fontSize: 11, fontWeight: 600, color: "#b45309",
};
export const favEditBox = {
  marginTop: 4, padding: "6px 8px", background: C.blueSoft,
  borderWidth: 1, borderStyle: "solid", borderColor: "#dbeafe", borderRadius: 8,
};
export const favSaveBtn = {
  fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 6,
  borderWidth: 1, borderStyle: "solid", borderColor: C.blue,
  background: C.blue, color: "#fff", cursor: "pointer",
};

// 단지 리스트 패널(네이버식) — 정렬 바 + 행 목록.
export const sortBar = {
  display: "flex", alignItems: "center", gap: 8,
  paddingTop: 9, borderTop: `1px solid ${C.divider}`,
};
export const sortSelect = {
  flex: "0 1 150px", padding: "5px 7px", borderRadius: 7,
  border: `1px solid ${C.border}`, fontSize: 12, background: "#fff",
  color: C.text, cursor: "pointer", fontWeight: 600,
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
  fontSize: 10, fontWeight: 700, borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap",
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
  background: "#fff", borderRadius: "16px 16px 0 0",
  padding: "14px 14px calc(16px + env(safe-area-inset-bottom))",
  boxShadow: "0 -6px 24px rgba(15,23,42,0.18)",
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
};
export const ownedBtnOn = { borderColor: C.green, color: C.green, background: "#f0fdf4" };
export const ownedBox = {
  marginTop: 2, marginBottom: 6, padding: "8px 10px", background: "#fffbeb",
  borderWidth: 1, borderStyle: "solid", borderColor: "#fde68a", borderRadius: 8,
};
export const ownedClearBtn = {
  marginLeft: 6, fontSize: 10, padding: "0 6px", borderRadius: 6,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.muted, cursor: "pointer", verticalAlign: "1px",
};

export const noticeBox = {
  marginTop: 8, padding: "10px 12px", background: C.blueSoft,
  border: `1px solid #dbeafe`, borderRadius: 10, fontSize: 12, color: C.sub, lineHeight: 1.5,
};
export const pyeongCard = {
  // pyeongCardOn이 borderColor만 덮어쓰므로 shorthand border 금지(React 혼용 경고)
  padding: "10px 12px", borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  borderRadius: 10, background: "#fff",
};
export const pyeongCardOn = {
  borderColor: C.blue, background: C.blueSoft, boxShadow: `0 0 0 1px ${C.blue}`,
};
export const loanRow = { marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}` };

export const basisToggle = {
  display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 7, overflow: "hidden",
};
export const basisBtn = {
  border: "none", background: "#fff", color: C.sub, fontSize: 11,
  padding: "3px 9px", cursor: "pointer", fontWeight: 600,
};
export const basisBtnOn = { background: C.blue, color: "#fff" };
export const helpBtn = {
  width: 22, height: 22, borderRadius: "50%", border: `1px solid ${C.border}`,
  background: "#fff", color: C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer",
  lineHeight: 1, padding: 0,
};
export const bindingTag = {
  marginLeft: 5, fontSize: 9, color: C.sub, background: "#e2e8f0",
  borderRadius: 4, padding: "1px 5px", verticalAlign: "middle", fontWeight: 600,
};
export const regBadge = {
  fontSize: 10, color: "#b91c1c", background: "#fee2e2", borderRadius: 5, padding: "2px 7px", fontWeight: 600,
};
export const nonRegBadge = {
  fontSize: 10, color: "#15803d", background: "#dcfce7", borderRadius: 5, padding: "2px 7px", fontWeight: 600,
};
export const linkBtn = {
  border: "none", background: "none", color: C.blue, fontWeight: 700,
  cursor: "pointer", padding: 0, fontSize: 12,
};

export const modalOverlay = {
  position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};
export const modalCard = {
  position: "relative", width: "100%", maxWidth: 380, maxHeight: "85vh", overflowY: "auto",
  background: "#fff", borderRadius: 16, padding: "20px 22px", boxShadow: "0 12px 40px rgba(15,23,42,0.3)",
};
export const helpBlock = { marginTop: 14 };
export const helpHead = { fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 4 };
export const helpBody = { fontSize: 12.5, color: C.text, lineHeight: 1.7 };
