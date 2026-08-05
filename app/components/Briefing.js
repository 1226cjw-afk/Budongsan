"use client";

// 📋 오늘의 브리핑 — 뉴스 페이지 상단 카드 묶음의 컨테이너.
// 데이터 조달(fetch·localStorage)과 빈 상태 판정만 여기서 하고, 렌더는 briefing/ 아래 카드들이 한다.
// ⚠️ 카드를 더 얹을 땐 이 파일에 JSX를 쌓지 말고 briefing/에 파일을 추가할 것 —
//    KakaoMap.js가 1263→1751줄로 되자란 전철을 피하려는 분리다(2026-08-03).
// ⚠️ 카드가 쓸 데이터의 fetch도 **반드시 여기서** 시작할 것. 카드 안에서 fetch하면 그 카드는
//    아래 로딩 게이트(data === null) 뒤에야 마운트돼, 서로 무관한 요청이 직렬화된다(2026-08-05).

import { useEffect, useMemo, useState } from "react";
import { classifyNews } from "../lib/news";
import { loadSeen, markSeen } from "../lib/briefingSeen";
import { emptyHint } from "./briefing/styles";
import FavoriteCard from "./briefing/FavoriteCard";
import ScheduleCard from "./briefing/ScheduleCard";
import MarketSignalCard from "./briefing/MarketSignalCard";
import DealFeedCard from "./briefing/DealFeedCard";
import SubscriptionCard from "./briefing/SubscriptionCard";
import ImpactNewsCard from "./briefing/ImpactNewsCard";

const PROFILE_KEY = "re_loan_profile"; // KakaoMap과 동일 키
const IMPACT_CATS = ["대출·금리", "정책·세금"]; // 내 자금 계획에 직접 영향
const MAX_IMPACT = 3;

// 지도의 assets 정의와 같다 — 여유현금 + 보유주택 매도 실수령.
function usableAssets(p) {
  if (!p) return 0;
  const o = p.owned;
  const sale = o ? o.priceRecent || o.priceAvg || 0 : 0;
  const net = o
    ? Math.max(0, sale - (Number(p.ownedLoanBalance) || 0) - (Number(p.ownedDeposit) || 0))
    : 0;
  return (Number(p.assets) || 0) + net;
}

export default function Briefing({ news }) {
  const [data, setData] = useState(null); // null = 로딩 중
  const [subs, setSubs] = useState(null); // 🏗 청약 — /api/briefing과 무관, 같이 출발시킨다
  const [profile, setProfile] = useState(null);
  const [seen, setSeen] = useState({});

  useEffect(() => {
    setSeen(loadSeen()); // 렌더용 스냅샷 — markSeen 후에도 이번 방문의 🆕는 유지된다
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) setProfile(JSON.parse(raw));
    } catch {
      /* 무시 */
    }
    fetch("/api/briefing")
      .then((r) => r.json())
      .then((d) => {
        setData(d.complexes ? d : { complexes: [], upcoming: [] });
        markSeen(d.complexes); // 본 순간 확인 처리 → 다음 방문엔 🆕가 빠진다
      })
      .catch(() => setData({ complexes: [], upcoming: [] })); // 실패해도 뉴스 목록은 살린다

    // ⚠️ 청약 fetch를 SubscriptionCard 안으로 되돌리지 말 것. 그 카드는 로딩 게이트
    //    뒤에 마운트돼서, 무관한 두 요청이 직렬화됐다 — 2026-08-05 실측(로컬 prod 빌드):
    //    briefing 응답 1497ms → 그제서야 1650ms에 /api/subscription 시작 → 카드 노출
    //    1907ms. 여기서 나란히 출발시키면 그 410ms가 통째로 사라진다.
    fetch("/api/subscription")
      .then((r) => r.json())
      .then((d) => setSubs(d.items || []))
      .catch(() => setSubs([])); // 실패해도 나머지 브리핑은 살린다
  }, []);

  // 내게 영향 있는 뉴스 — 대출·금리/정책·세금 + 관심지역 기사.
  const impact = useMemo(
    () =>
      (news || [])
        .filter((it) => {
          const cat = it.cat || classifyNews(it.title);
          return IMPACT_CATS.includes(cat) || (it.keyword || "").endsWith(" 아파트");
        })
        .slice(0, MAX_IMPACT),
    [news]
  );

  // ★ 단지 키 집합 — 피드에서 "내 단지 거래"를 가려낸다.
  // ⚠️ useMemo로 뺄 것. JSX에 `new Set(...)`을 인라인하면 렌더마다 새 참조가 생겨
  //    DealFeedCard의 rows useMemo가 매번 무효화된다(피드 60건 × 대출계산).
  const favoriteKeys = useMemo(
    () => new Set((data?.complexes || []).map((c) => `${c.lawdCd}|${c.umdNm}|${c.aptNm}`)),
    [data]
  );

  // 로딩 중엔 자리만 잡아둔다.
  // ⚠️ null을 반환하지 말 것 — 브리핑 영역이 0px였다가 응답이 오는 순간 카드 여러 장이
  //    한꺼번에 나타나며 아래 뉴스 목록을 밀어냈다(≈1.9s 뒤 레이아웃 점프, 2026-08-05).
  //    청약 카드는 여기 끼우지 않는다 — 최종 위치가 피드 아래라, 먼저 띄우면 그 카드가
  //    다시 아래로 내려가는 2차 점프가 생긴다. fetch는 이미 위에서 출발했으므로 손해 없음.
  if (data === null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={skeleton} />
        <style>{`@keyframes brf-pulse { 0%,100% { opacity: 0.55 } 50% { opacity: 0.9 } }`}</style>
      </div>
    );
  }

  const hasIncome = Number(profile?.income) > 0;
  const assets = usableAssets(profile);

  // ⚠️ complexes·upcoming만 보고 판정하지 말 것. 📊 시장 신호와 🆕 새 거래 피드는 ★ "단지"가
  //    아니라 관심 "지역" 기준이라, ★ 단지에 최근 30일 거래가 없어도 내용이 있다. 예전 판정은
  //    그 경우 둘을 통째로 버리고 "★로 관심 단지를 담으면" 안내를 띄웠다 — 이미 담아둔 사람에게
  //    담으라고 하는 셈이다. 2026-08-05 실측: ★ 4곳의 최신 거래가 7/18이라 8/17이면 30일 창을
  //    벗어나 신호 4개 지역·피드 60건이 통째로 사라질 예정이었다(재현 확인).
  const hasAny =
    data.complexes?.length ||
    data.upcoming?.length ||
    data.signal?.byRegion?.length ||
    data.feed?.length;

  // 즐겨찾기가 아예 없을 때만 안내 한 줄(이때 서버는 signal·feed를 아예 만들지 않는다).
  // ⚠️ 청약 레이더는 이 분기에서도 렌더한다 — ★와 무관한 정보라 즐겨찾기가 없는
  //    사용자에게도 보여야 한다(안내만 뜨는 빈 화면 방지).
  if (!hasAny) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={emptyHint}>
          지도에서 <b>★</b>로 관심 단지를 담으면, 여기에 그 단지의 새 실거래와 일정이 떠요.
        </div>
        <SubscriptionCard items={subs} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.complexes?.length > 0 && (
        <FavoriteCard
          complexes={data.complexes}
          seen={seen}
          profile={profile}
          assets={assets}
          hasIncome={hasIncome}
        />
      )}
      {data.upcoming?.length > 0 && <ScheduleCard upcoming={data.upcoming} />}
      {data.signal && <MarketSignalCard signal={data.signal} />}
      {data.feed?.length > 0 && (
        <DealFeedCard
          feed={data.feed}
          favorites={favoriteKeys}
          profile={profile}
          assets={assets}
          hasIncome={hasIncome}
        />
      )}
      <SubscriptionCard items={subs} />
      {impact.length > 0 && <ImpactNewsCard news={impact} hasIncome={hasIncome} />}
    </div>
  );
}

// 카드 한 장 높이의 자리표시. 실제 첫 카드(관심 단지)의 대략적인 높이에 맞춘다.
const skeleton = {
  height: 132,
  borderRadius: 16,
  background: "linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)",
  border: "1px solid #e2e8f0",
  animation: "brf-pulse 1.4s ease-in-out infinite",
};
