// 브리핑 카드 공통 스타일 — 카드 껍데기·행·배지.
// Briefing.js에 몰려 있던 상수를 카드별 파일 분리(2026-08-03)에 맞춰 여기로 옮겼다.
// 카드가 늘어도 행 높이·배지 색이 어긋나지 않게 하려는 것.

import { C, CARD_SHADOW } from "../../lib/palette";

export const card = {
  background: "#fff", borderRadius: 16, border: `1px solid ${C.border}`,
  boxShadow: CARD_SHADOW, overflow: "hidden",
};
export const cardHead = { fontSize: 12, fontWeight: 700, color: C.sub, margin: "2px 2px 6px" };
export const headSub = { color: C.muted, fontWeight: 400 };
export const row = { display: "block", padding: "11px 15px" };
export const rowDivider = { borderTop: `1px solid ${C.divider}` };
export const rowTop = {
  display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8,
};
export const rowName = { fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.4 };
export const rowPrice = {
  fontSize: 13.5, fontWeight: 800, color: C.text,
  whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
};
export const rowMeta = { fontSize: 11, color: C.muted, marginTop: 3 };
export const rowBadges = { display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" };
export const tagBase = {
  fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap",
};
export const upTag = { ...tagBase, color: "#b45309", background: "#fef9c3" };
export const downTag = { ...tagBase, color: "#1d4ed8", background: C.blueSoft };
export const okTag = { ...tagBase, color: "#047857", background: "#dcfce7" };
export const noTag = { ...tagBase, color: "#be123c", background: "#ffe4e6" };
export const emptyHint = {
  background: "#fff", borderRadius: 14, border: `1px solid ${C.border}`,
  boxShadow: CARD_SHADOW, padding: "14px 16px",
  fontSize: 12.5, color: C.sub, lineHeight: 1.6,
};
