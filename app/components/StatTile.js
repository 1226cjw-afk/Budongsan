"use client";

// 스탯 타일 — 작은 라벨 / 큰 숫자 / 캡션. 참조 사이트(koreamonitor)의 정보 밀도를 차용.
// ⚠️ 색은 tone 2종뿐이다. 상승=빨강 관례를 쓰지 않는 이유는 이 앱에서 빨강이 이미
//    "자금부족"을 뜻해서다 — 한 색이 두 뜻이 되면 마커 색칠과 충돌한다(2026-08-03).

import { C } from "../lib/palette";

export default function StatTile({ label, value, caption, tone = "neutral" }) {
  return (
    <div style={tile}>
      <div style={tileLabel}>{label}</div>
      <div style={{ ...tileValue, color: tone === "warn" ? C.amber : C.text }}>{value}</div>
      {caption && <div style={tileCaption}>{caption}</div>}
    </div>
  );
}

const tile = {
  background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12,
  padding: "10px 12px", minWidth: 0,
};
const tileLabel = { fontSize: 10.5, fontWeight: 700, color: C.muted, whiteSpace: "nowrap" };
const tileValue = {
  fontSize: 20, fontWeight: 800, marginTop: 3, lineHeight: 1.15,
  fontVariantNumeric: "tabular-nums",
};
const tileCaption = { fontSize: 10.5, color: C.muted, marginTop: 3, lineHeight: 1.4 };
