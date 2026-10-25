"use client";

// 내 자금 프로필 — 지도가 **쓰는** 쪽(입력·저장)과 그 파생값(자기자금·대출 계산기·loanKey).
// 오늘·뉴스 탭은 읽기만 한다(useLoanProfile). 2026-10-25 KakaoMap.js에서 분리.
// ⚠️ 자기자금 정의는 lib/loanPolicy.usableAssets 한 곳이다 — 여기서 따로 더하지 말 것(오늘 탭과 갈라진다).

import { useEffect, useState } from "react";
import { loanCalcFor, ownedProceeds, usableAssets } from "../../lib/loanPolicy";
import { PROFILE_KEY, PROFILE_EVENT } from "../useLoanProfile";

const COST_NOTICE_KEY = "re_cost_notice_seen"; // 부대비용 반영 안내를 본 적 있는지

// 단위: 만원(보유자산/연소득/기존상환액), % (금리), 년(만기).
export const DEFAULT_PROFILE = {
  assets: "",        // 보유자산(여유 현금)
  income: "",        // 연소득
  existingDebt: "",  // 기존 대출 연 원리금상환액
  monthlySaving: "", // 월 저축 가능액 — "얼마 더 모으면 되나" 계산용(선택)
  householdType: "무주택", // 무주택 | 1주택 | 다주택
  isFirstTime: false,      // 생애최초 구입
  rate: "4",         // 실제 대출금리(%)
  termYears: "40",   // 만기(년) — 주담대 최장 기본(은행/네이버 기본값)
  // 갈아타기(보유 주택 매도) — owned는 세부패널 평형 카드의 "보유" 토글로 지정.
  // 지정 시점의 기준가 스냅샷을 저장(재지정하면 최신가로 갱신). 실수령 = 기준가 − 대출잔액 − 보증금.
  owned: null,          // { lawdCd, umdNm, aptNm, area, priceRecent, priceAvg, capturedYmd }
  ownedLoanBalance: "", // 매도 시 상환할 대출 잔액(만원)
  ownedDeposit: "",     // 매도 시 반환할 임차 보증금 정산액(만원)
  ownedAcquiredYmd: "", // 취득일(잔금일) — 비과세(보유 2년) D-day 계산용
};

// priceBasis(recent|avg) = 지도 기준가 토글 — 보유 주택 매도가를 어느 값으로 볼지도 따라간다.
export default function useMapProfile(priceBasis) {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [showCostNotice, setShowCostNotice] = useState(false);

  // 로컬 저장분 복원. ⚠️ 마운트 이후에만 읽는다(useState 초기값 → 하이드레이션 불일치).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved) setProfile((p) => ({ ...p, ...JSON.parse(saved) }));
    } catch {
      /* 무시 */
    }
  }, []);

  function updateProfile(patch) {
    setProfile((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      } catch {
        /* 무시 */
      }
      return next;
    });
  }

  // 오늘·뉴스 탭(keep-alive)이 자금 변경을 따라오게 알린다 — useLoanProfile 주석 참조.
  // ⚠️ setProfile 업데이터 안에서 쏘지 말 것(렌더 중 다른 컴포넌트 setState 경고) → effect로.
  useEffect(() => {
    window.dispatchEvent(new Event(PROFILE_EVENT));
  }, [profile]);

  const incomeNum = Number(profile.income);
  const hasProfile = incomeNum > 0; // 연소득 없으면 DSR 계산 불가
  // 갈아타기: 보유 주택 지정 시 예상 매도 실수령을 자기자금에 합산(lib/loanPolicy).
  // assets가 구매가능 색칠·자금 여유 정렬·평형 카드 비교 전부의 기준이다.
  const { salePrice: ownedSalePrice, net: ownedNet } = ownedProceeds(profile, priceBasis);
  const assets = usableAssets(profile, priceBasis);
  const affordMode = hasProfile && assets > 0;

  // 마커·리스트 계산에 실제로 영향을 주는 자금 입력만 추린 키(문자열이라 얕은 비교가 통한다).
  // ⚠️ profile 객체를 그대로 deps에 넣으면 자금 입력창에 **한 글자 칠 때마다** 객체가 새로 만들어져
  //    마커 수백 개가 통째로 다시 그려진다 — 입력이 끊기는 주된 원인이었다(2026-07-29).
  //    자금 관련 새 입력이 마커에 영향 주면 **이 배열에 추가**할 것.
  const loanKey = [
    assets, incomeNum, profile.existingDebt, profile.rate,
    profile.termYears, profile.householdType, profile.isFirstTime,
  ].join("|");

  // 자금 프로필 → 대출 계산기. 브리핑 카드 3종과 **같은 어댑터**(loanCalcFor)를 쓴다.
  const loanForPrice = loanCalcFor(profile, assets);

  // 부대비용 반영 안내 — 자금을 설정해 둔 기존 사용자에게만, 최초 1회.
  // 필요자금이 갑자기 커 보여 "고장났나" 싶은 것을 막는다.
  useEffect(() => {
    if (!hasProfile) return;
    try {
      if (!localStorage.getItem(COST_NOTICE_KEY)) setShowCostNotice(true);
    } catch {
      /* 무시 */
    }
  }, [hasProfile]);

  function dismissCostNotice() {
    setShowCostNotice(false);
    try {
      localStorage.setItem(COST_NOTICE_KEY, "1");
    } catch {
      /* 무시 */
    }
  }

  return {
    profile, updateProfile,
    hasProfile, assets, affordMode, loanKey, loanForPrice,
    owned: profile.owned, ownedSalePrice, ownedNet,
    showCostNotice, dismissCostNotice,
  };
}
