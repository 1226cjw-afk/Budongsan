"use client";

// 모바일 셸 — 상단 1줄 바 + 하단 시트.
//
// 왜 분리했나: 상단 컨트롤 패널이 세로로 무한정 자라 하단 시트와 겹쳤다(둘 다 z:10).
// 상단을 고정 높이 1줄로 잠그고 나머지를 시트 하나에 몰아넣으면 겹침이 불가능해진다.
// 시트 슬롯은 KakaoMap의 sheet 상태 하나가 관리한다(동시에 둘 이상 열리지 않음).

import {
  mobileTopBar, mobileTopText, mobileTopBtn, mobileTopBtnDot,
  sheetBackdrop, mobileSheet, sheetGrip, newsBadge,
} from "./mapStyles";

// ⚠️ 🔄 갱신은 상단 바에 **직접** 둔다 — ⚙️ 시트 안에만 있으면 매번 시트를 열어야 해서
// "갱신하려고 설정을 여는" 번거로움이 생긴다(2026-07-29 사용자 요청).
export function MobileTopBar({ summary, hasFilter, onOpenSettings, onRefresh, refreshing, newsNew }) {
  return (
    <div style={mobileTopBar}>
      <span style={mobileTopText}>{summary}</span>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        style={mobileTopBtn}
        aria-label="실거래가 새로 갱신"
      >
        {refreshing ? "⏳" : "🔄"}
      </button>
      <button onClick={onOpenSettings} style={mobileTopBtn} aria-label="지역·필터·자금 설정">
        ⚙️
        {hasFilter && <span style={mobileTopBtnDot} />}
      </button>
      <a href="/news" style={mobileTopBtn} aria-label="뉴스">
        📰
        {newsNew > 0 && <span style={newsBadge}>{newsNew}</span>}
      </a>
    </div>
  );
}

export function MobileSheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <>
      <div style={sheetBackdrop} onClick={onClose} />
      <div style={mobileSheet}>
        <div style={sheetGrip} />
        {children}
      </div>
    </>
  );
}
