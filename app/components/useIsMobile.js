"use client";

// 좁은 화면(≤640px) 판정 — KakaoMap·AppShell 공용. 미디어쿼리가 아니라 JS 분기인 이유는
// 이 앱이 인라인 스타일 스프레드로 모바일을 가르기 때문이다(mapStyles 주석 참조).
// ⚠️ 서버 렌더 값은 false — 마운트 후에 갱신된다(하이드레이션 불일치 방지).

import { useEffect, useState } from "react";

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}
