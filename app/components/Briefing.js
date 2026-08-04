"use client";

// 📋 오늘의 브리핑 — 뉴스 페이지 상단 카드 묶음의 컨테이너.
// 데이터 조달(fetch·localStorage)과 빈 상태 판정만 여기서 하고, 렌더는 briefing/ 아래 카드들이 한다.
// ⚠️ 카드를 더 얹을 땐 이 파일에 JSX를 쌓지 말고 briefing/에 파일을 추가할 것 —
//    KakaoMap.js가 1263→1751줄로 되자란 전철을 피하려는 분리다(2026-08-03).

import { useEffect, useMemo, useState } from "react";
import { classifyNews } from "../lib/news";
import { loadSeen, markSeen } from "../lib/briefingSeen";
import { emptyHint } from "./briefing/styles";
import FavoriteCard from "./briefing/FavoriteCard";
import ScheduleCard from "./briefing/ScheduleCard";
import MarketSignalCard from "./briefing/MarketSignalCard";
import DealFeedCard from "./briefing/DealFeedCard";
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

  if (data === null) return null; // 로딩 중엔 자리를 차지하지 않는다

  const hasIncome = Number(profile?.income) > 0;
  const assets = usableAssets(profile);
  const hasAny = data.complexes?.length || data.upcoming?.length;

  // 즐겨찾기가 없으면 빈 카드 3개 대신 안내 한 줄.
  if (!hasAny) {
    return (
      <div style={emptyHint}>
        지도에서 <b>★</b>로 관심 단지를 담으면, 여기에 그 단지의 새 실거래와 일정이 떠요.
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
      {impact.length > 0 && <ImpactNewsCard news={impact} hasIncome={hasIncome} />}
    </div>
  );
}
