"use client";

// 내 자금 프로필(localStorage) 구독. 지도(KakaoMap)가 쓰고 오늘·뉴스 탭이 읽는다.
// ⚠️ 탭 셸은 오늘·뉴스 화면을 **계속 마운트해 둔다**(keep-alive). 마운트 때 한 번만 읽으면
//    지도에서 자금을 바꾼 뒤 오늘 탭으로 와도 옛 판정 배지가 남는다 — 같은 탭 안의 localStorage
//    변경은 `storage` 이벤트가 안 오므로 KakaoMap이 PROFILE_EVENT를 직접 쏜다.

import { useEffect, useState } from "react";

export const PROFILE_KEY = "re_loan_profile";
export const PROFILE_EVENT = "re-profile-change";

export function readProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function useLoanProfile() {
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    const sync = () => setProfile(readProfile());
    sync();
    window.addEventListener(PROFILE_EVENT, sync);
    window.addEventListener("storage", sync); // 다른 브라우저 탭에서 바꾼 경우
    return () => {
      window.removeEventListener(PROFILE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return profile;
}
