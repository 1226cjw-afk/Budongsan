"use client";

// ⚖️ 비교 담기 목록(localStorage) — 지도 세부패널(⚖️ 버튼)이 쓰고 비교 탭이 읽고 쓴다.
// ⚠️ 탭 셸이 지도·비교 탭을 둘 다 계속 마운트해 두므로(keep-alive) 각자 state를 들고 있으면 갈라진다.
//    같은 탭 안의 localStorage 변경엔 storage 이벤트가 안 오니 COMPARE_EVENT를 직접 쏴서 맞춘다
//    (useLoanProfile의 PROFILE_EVENT와 같은 방식).
// ⚠️ 마운트 이후에만 읽는다 — useState 초기값으로 읽으면 하이드레이션 불일치.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COMPARE_KEY, COMPARE_EVENT, sanitizeCompareList, addToCompare, removeFromCompare, compareKey,
} from "../lib/compare";

function read() {
  try {
    return sanitizeCompareList(JSON.parse(localStorage.getItem(COMPARE_KEY) || "[]"));
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(COMPARE_KEY, JSON.stringify(list));
  } catch {
    /* 사생활 보호 모드 등 — 이번 세션 state로만 유지 */
  }
  window.dispatchEvent(new Event(COMPARE_EVENT));
}

export default function useCompareList() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const sync = () => setList(read());
    sync();
    window.addEventListener(COMPARE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(COMPARE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const keys = useMemo(() => new Set(list.map(compareKey)), [list]);

  // 반환 {added, full} — 호출부가 "꽉 찼어요" 안내를 띄울 수 있게.
  // ⚠️ 저장소에서 다시 읽고 고친다 — 다른 화면이 방금 바꾼 목록을 이 컴포넌트의 낡은 state로 덮지 않게.
  const add = useCallback((item) => {
    const r = addToCompare(read(), item);
    if (r.added) write(r.list);
    return r;
  }, []);
  const remove = useCallback((key) => write(removeFromCompare(read(), key)), []);
  const toggle = useCallback(
    (item) => {
      const k = compareKey(item);
      if (read().some((x) => compareKey(x) === k)) {
        remove(k);
        return { added: false, full: false, removed: true };
      }
      return add(item);
    },
    [add, remove]
  );
  const clear = useCallback(() => write([]), []);

  return { list, keys, has: (item) => keys.has(compareKey(item)), add, remove, toggle, clear };
}
