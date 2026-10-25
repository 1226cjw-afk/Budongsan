"use client";

// 모바일 시트의 "뒤로가기 = 닫기". 열리는 순간 히스토리 한 칸을 쌓고, popstate로 그 칸을 벗어나면 닫는다.
// 반환하는 close()는 버튼(✕·← 목록)용 — 쌓아 둔 칸이 그대로면 history.back()으로 걷어 낸다.
// 상세 시트(reSheet:"detail")와 ⚙️ 설정 시트(reSheet:"settings")가 같은 모양이라 2026-10-25 하나로 합쳤다.
// ⚠️ history.state를 **펼쳐서** 넣을 것 — Next App Router가 자기 상태(__NA 등)를 거기 둔다. 빠지면
//    popstate에서 Next가 전체 새로고침을 한다. 우리 키(reSheet)는 그 옆에 얹기만 한다.
// ⚠️ 도착한 항목이 여전히 내 키면 닫지 않는다 — 상세 위에 설정을 열었다가 뒤로가기로 설정만 닫는 경우
//    popstate가 두 리스너에 다 온다(상세는 남아야 한다).
// ⚠️ 시트가 다른 경로(지역 전환 등)로 닫히면 쌓인 한 칸이 남는다 — 그 뒤 뒤로가기 한 번은 아무 일도
//    안 한다(무해).

import { useCallback, useEffect, useRef } from "react";

export default function useBackToClose(open, key, onClose) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ ...window.history.state, reSheet: key }, "");
    const onPop = () => {
      if (window.history.state?.reSheet !== key) onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, key]);

  return useCallback(() => {
    if (window.history.state?.reSheet === key) window.history.back(); // → popstate → onClose
    else onCloseRef.current();
  }, [key]);
}
