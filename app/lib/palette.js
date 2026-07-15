// 공통 디자인 토큰 — 지도(KakaoMap)·뉴스(/news)가 같은 팔레트·그림자를 쓴다.
// 색 추가/변경은 여기 한 곳만. 컴포넌트별 스타일 객체는 components/mapStyles.js.

export const C = {
  text: "#0f172a", sub: "#64748b", muted: "#94a3b8",
  border: "#e2e8f0", divider: "#f1f5f9",
  blue: "#2563eb", blueSoft: "#eff6ff",
  green: "#059669", red: "#dc2626", amber: "#f59e0b",
};

// 레이어드 소프트 섀도(다층·저불투명) — 패널/모달용.
export const PANEL_SHADOW =
  "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.10), 0 24px 48px -16px rgba(15,23,42,0.14)";
// 카드용 얕은 섀도(뉴스 카드 등 문서 흐름 안의 흰 카드).
export const CARD_SHADOW =
  "0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.06)";

// 글래스 패널(지도 위 반투명 + blur). 사용처에서 스프레드 — background를 덮으면 불투명도 조절.
export const GLASS = {
  background: "rgba(255,255,255,0.88)",
  backdropFilter: "blur(20px) saturate(1.6)",
  WebkitBackdropFilter: "blur(20px) saturate(1.6)",
};
export const GLASS_BORDER = "1px solid rgba(226,232,240,0.75)";

// 인터랙티브 요소 공통 트랜지션(마이크로 인터랙션 150ms).
export const TRANSITION = "background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s";
