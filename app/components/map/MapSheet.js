"use client";

// 모바일 지도 시트 — 목록이 늘 바닥에 떠 있고(peek), 단지를 고르면 상세가 **같은 시트 위에 쌓인다**.
// 왜: 예전엔 시트 슬롯이 하나(sheet: settings|list|detail)라 상세가 목록을 **대체**했고, 닫으면
//     빈 지도로 떨어져 목록을 다시 열려면 ⚙️ → "단지 목록 보기" 2탭이 필요했다(2026-09-29 실측).
// 드래그: 그립/머리를 위로 밀면 한 단계↑, 아래로 밀면 한 단계↓, 탭하면 peek↔half.

import { useRef } from "react";
import {
  mapSheet, SNAP_H, sheetHandle, sheetGrip, sheetHeadRow, sheetHeadTitle, sheetHeadBtn,
  sheetBody, sheetPane,
} from "../mapStyles";

const ORDER = ["peek", "half", "full"];
const DRAG_PX = 24;

export default function MapSheet({ snap, setSnap, title, detail, detailTitle, onBack, onClose, list }) {
  const drag = useRef(null);
  const stop = (e) => e.stopPropagation(); // 머리 버튼을 누른 게 시트 토글로 번지지 않게

  function onPointerDown(e) {
    drag.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerUp(e) {
    const y0 = drag.current;
    drag.current = null;
    if (y0 == null) return;
    const dy = e.clientY - y0;
    const i = ORDER.indexOf(snap);
    if (Math.abs(dy) < DRAG_PX) {
      setSnap(snap === "peek" ? "half" : "peek");
      return;
    }
    setSnap(ORDER[Math.max(0, Math.min(ORDER.length - 1, i + (dy < 0 ? 1 : -1)))]);
  }

  const showBody = snap !== "peek";
  return (
    <div style={{ ...mapSheet, height: SNAP_H[snap] }} data-sheet={snap}>
      <div style={sheetHandle} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <div style={sheetGrip} />
        {detail ? (
          <div style={sheetHeadRow}>
            <button onPointerDown={stop} onPointerUp={stop} onClick={onBack} style={sheetHeadBtn}>
              ← 목록
            </button>
            <span style={sheetHeadTitle}>{detailTitle}</span>
            <button onPointerDown={stop} onPointerUp={stop} onClick={onClose} style={sheetHeadBtn} aria-label="상세 닫기">
              ✕
            </button>
          </div>
        ) : (
          <div style={sheetHeadRow}>
            <span style={sheetHeadTitle}>{title}</span>
            <span style={{ color: "#94a3b8", fontSize: 12 }}>{snap === "peek" ? "▲" : "▼"}</span>
          </div>
        )}
      </div>
      {showBody && (
        <div style={sheetBody}>
          <div style={{ ...sheetPane, visibility: detail ? "hidden" : "visible" }}>{list}</div>
          {detail && <div style={sheetPane}>{detail}</div>}
        </div>
      )}
    </div>
  );
}
