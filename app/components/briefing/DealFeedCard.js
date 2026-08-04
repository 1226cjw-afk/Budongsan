"use client";

// 🆕 새 거래 피드 — 관심 지역에 새로 신고된 실거래.
// 참조 사이트(koreamonitor)의 "방금 신고된 실거래"를 우리 맥락으로: 전국이 아니라
// 내 관심 범위만 보고, 각 거래에 **내 자금 대비 판정**을 붙인다(참조엔 없는 축).
//
// ⚠️ 이 카드의 창은 최근 30일 그대로다 — 📊 시장 신호처럼 뒤로 물리지 않는다.
//    신호는 "구간끼리 비교"라 덜 채워진 구간이 왜곡을 만들지만, 여기는 비교가 아니라
//    "새로 들어온 것 보여주기"라 지연이 곧 신선도다(2026-08-04).

import { useMemo, useState } from "react";
import { calcMaxLoan } from "../../lib/loanPolicy";
import { formatManwon, shortDate } from "../../lib/format";
import { toPyeong } from "../../lib/tradeStats";
import { regionName } from "../../lib/regions";
import { C } from "../../lib/palette";
import {
  card, cardHead, headSub, row, rowDivider, rowTop, rowName, rowPrice, rowMeta,
  rowBadges, okTag, noTag, upTag, downTag,
} from "./styles";

const MAX_ROWS = 12;

export default function DealFeedCard({ feed, favorites, profile, assets, hasIncome }) {
  const [tab, setTab] = useState("fav");

  // 자금 여유 계산은 지도·관심단지 카드와 같은 calcMaxLoan을 쓴다(숫자가 어긋나지 않게).
  const withGap = useMemo(
    () =>
      (feed || []).map((t) => {
        if (!hasIncome) return { ...t, gap: null };
        const ln = calcMaxLoan({
          price: t.amount,
          lawdCd: t.lawdCd,
          householdType: profile.householdType,
          isFirstTime: profile.isFirstTime,
          annualIncome: Number(profile.income),
          existingAnnualDebt: Number(profile.existingDebt) || 0,
          rate: (Number(profile.rate) || 0) / 100,
          termYears: Number(profile.termYears) || 40,
          area: t.area,
          assets,
        });
        return { ...t, gap: ln && ln.maxLoan > 0 ? assets - ln.requiredCash : null };
      }),
    [feed, profile, assets, hasIncome]
  );

  const rows = useMemo(() => {
    if (tab === "fav") {
      return withGap
        .filter((t) => favorites.has(`${t.lawdCd}|${t.umdNm}|${t.aptNm}`))
        .slice(0, MAX_ROWS);
    }
    // 관심지역 탭: 자금을 넣었으면 살 수 있는 것만 추린다(안 넣었으면 전부).
    const list = hasIncome ? withGap.filter((t) => t.gap != null && t.gap >= 0) : withGap;
    return list.slice(0, MAX_ROWS);
  }, [withGap, tab, favorites, hasIncome]);

  if (!feed?.length) return null;

  return (
    <section>
      <div style={cardHead}>
        🆕 새 거래 <span style={headSub}>· 최근 30일 · 국토부 신고분</span>
      </div>
      <div style={card}>
        <div style={tabRow}>
          <button
            onClick={() => setTab("fav")}
            style={{ ...tabBtn, ...(tab === "fav" ? tabBtnOn : null) }}
          >
            ★ 단지
          </button>
          <button
            onClick={() => setTab("region")}
            style={{ ...tabBtn, ...(tab === "region" ? tabBtnOn : null) }}
          >
            관심 지역{hasIncome ? " · 살 수 있는 것" : ""}
          </button>
        </div>

        {rows.length === 0 ? (
          <div style={emptyRow}>
            {tab === "fav"
              ? "★ 담은 단지에 최근 30일 새 거래가 없어요."
              : "조건에 맞는 새 거래가 없어요."}
          </div>
        ) : (
          rows.map((t, i) => {
            const chg = t.prevAmount ? ((t.amount - t.prevAmount) / t.prevAmount) * 100 : null;
            return (
              <div
                key={`${t.lawdCd}-${t.umdNm}-${t.aptNm}-${t.dealDate}-${t.amount}-${i}`}
                style={{ ...row, ...(i > 0 ? rowDivider : null) }}
              >
                <div style={rowTop}>
                  <span style={rowName}>{t.aptNm}</span>
                  <span style={rowPrice}>{formatManwon(t.amount)}</span>
                </div>
                <div style={rowMeta}>
                  {regionName(t.lawdCd)} {t.umdNm} · {toPyeong(t.area)}평
                  {t.floor ? ` · ${t.floor}층` : ""} · {shortDate(t.dealDate)} 계약
                </div>
                <div style={rowBadges}>
                  {chg != null && (
                    <span style={chg >= 0 ? upTag : downTag}>
                      직전 대비 {chg >= 0 ? "+" : ""}
                      {chg.toFixed(1)}%
                    </span>
                  )}
                  {t.gap != null && (
                    <span style={t.gap >= 0 ? okTag : noTag}>
                      {t.gap >= 0 ? `✓ 여유 ${formatManwon(t.gap)}` : `부족 ${formatManwon(-t.gap)}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

const tabRow = { display: "flex", gap: 6, padding: "10px 15px 0" };
// ⚠️ border는 비shorthand로 — On에서 borderColor만 덮는 구조라 shorthand를 쓰면
//    React dev 경고가 난다(pillBtn이 같은 이유로 이 패턴).
const tabBtn = {
  fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 999,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.sub, cursor: "pointer",
};
const tabBtnOn = { borderColor: C.blue, background: C.blueSoft, color: C.blue };
const emptyRow = { padding: "14px 15px", fontSize: 12, color: C.muted };
