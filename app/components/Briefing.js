"use client";

// 📋 오늘의 브리핑 — 뉴스 페이지 상단 3카드.
// ⭐ 관심 단지 변동 / ⏳ 다가오는 일정 / 💰 내게 영향 있는 뉴스.
//
// 자금 여유는 지도와 같은 loanPolicy.calcMaxLoan으로 계산한다 —
// 두 화면의 숫자가 어긋날 수 없게 하려고 계산을 공유한다.

import { useEffect, useMemo, useState } from "react";
import { calcMaxLoan } from "../lib/loanPolicy";
import { formatManwon, shortDate } from "../lib/format";
import { regionName } from "../lib/regions";
import { classifyNews } from "../lib/news";
import { C, CARD_SHADOW } from "../lib/palette";
import { loadSeen, markSeen, isNew, complexKey } from "../lib/briefingSeen";

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
        <section>
          <div style={cardHead}>
            ⭐ 관심 단지 <span style={headSub}>· 최근 30일</span>
          </div>
          <div style={card}>
            {data.complexes.map((c, i) => {
              const top = c.recent[0];
              const fresh = isNew(c, seen);
              const chg = c.prevAmount
                ? ((top.amount - c.prevAmount) / c.prevAmount) * 100
                : null;
              const ln = hasIncome
                ? calcMaxLoan({
                    price: top.amount,
                    lawdCd: c.lawdCd,
                    householdType: profile.householdType,
                    isFirstTime: profile.isFirstTime,
                    annualIncome: Number(profile.income),
                    existingAnnualDebt: Number(profile.existingDebt) || 0,
                    rate: (Number(profile.rate) || 0) / 100,
                    termYears: Number(profile.termYears) || 40,
                    area: top.area,
                    assets,
                  })
                : null;
              const gap = ln && ln.maxLoan > 0 ? assets - ln.requiredCash : null;
              return (
                <div key={complexKey(c)} style={{ ...row, ...(i > 0 ? rowDivider : null) }}>
                  <div style={rowTop}>
                    <span style={rowName}>
                      {fresh && "🆕 "}
                      {c.aptNm}
                    </span>
                    <span style={rowPrice}>{formatManwon(top.amount)}</span>
                  </div>
                  <div style={rowMeta}>
                    {regionName(c.lawdCd)} {c.umdNm} · {Math.round(top.area)}㎡ ·{" "}
                    {shortDate(top.dealDate)} 계약
                    {c.recent.length > 1 && ` · 30일간 ${c.recent.length}건`}
                  </div>
                  <div style={rowBadges}>
                    {chg != null && (
                      <span style={chg >= 0 ? upTag : downTag}>
                        직전 {formatManwon(c.prevAmount)} 대비 {chg >= 0 ? "+" : ""}
                        {chg.toFixed(1)}%
                      </span>
                    )}
                    {gap != null && (
                      <span style={gap >= 0 ? okTag : noTag}>
                        {gap >= 0
                          ? `✓ 여유 ${formatManwon(gap)}`
                          : `부족 ${formatManwon(-gap)}`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {data.upcoming?.length > 0 && (
        <section>
          <div style={cardHead}>⏳ 다가오는 일정</div>
          <div style={card}>
            {data.upcoming.map((u, i) => (
              <div
                key={`${u.aptNm}-${u.kind}-${i}`}
                style={{ ...row, ...(i > 0 ? rowDivider : null) }}
              >
                <div style={rowTop}>
                  <span style={rowName}>
                    {u.kind === "lease" ? "🔑" : "📌"} {u.aptNm}
                  </span>
                  <span style={{ ...rowPrice, color: u.dday <= 7 ? C.red : "#b45309" }}>
                    D-{u.dday}
                  </span>
                </div>
                <div style={rowMeta}>{u.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {impact.length > 0 && (
        <section>
          <div style={cardHead}>
            💰 내게 영향 있는 뉴스
            {hasIncome && <span style={headSub}> · 대출 한도에 영향 가능</span>}
          </div>
          <div style={card}>
            {impact.map((it, i) => (
              <a
                key={it.link}
                href={it.link}
                target="_blank"
                rel="noreferrer"
                className="news-row"
                style={{
                  ...row,
                  textDecoration: "none",
                  color: "inherit",
                  ...(i > 0 ? rowDivider : null),
                }}
              >
                <div style={rowName}>{it.title}</div>
                <div style={rowMeta}>
                  {it.source} · {it.cat || classifyNews(it.title)}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const card = {
  background: "#fff", borderRadius: 16, border: `1px solid ${C.border}`,
  boxShadow: CARD_SHADOW, overflow: "hidden",
};
const cardHead = { fontSize: 12, fontWeight: 700, color: C.sub, margin: "2px 2px 6px" };
const headSub = { color: C.muted, fontWeight: 400 };
const row = { display: "block", padding: "11px 15px" };
const rowDivider = { borderTop: `1px solid ${C.divider}` };
const rowTop = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 };
const rowName = { fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.4 };
const rowPrice = {
  fontSize: 13.5, fontWeight: 800, color: C.text,
  whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
};
const rowMeta = { fontSize: 11, color: C.muted, marginTop: 3 };
const rowBadges = { display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" };
const tagBase = {
  fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap",
};
const upTag = { ...tagBase, color: "#b45309", background: "#fef9c3" };
const downTag = { ...tagBase, color: "#1d4ed8", background: C.blueSoft };
const okTag = { ...tagBase, color: "#047857", background: "#dcfce7" };
const noTag = { ...tagBase, color: "#be123c", background: "#ffe4e6" };
const emptyHint = {
  background: "#fff", borderRadius: 14, border: `1px solid ${C.border}`,
  boxShadow: CARD_SHADOW, padding: "14px 16px",
  fontSize: 12.5, color: C.sub, lineHeight: 1.6,
};
