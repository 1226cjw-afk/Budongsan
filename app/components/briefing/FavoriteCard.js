"use client";

// ⭐ 관심 단지 — ★로 담은 단지의 최근 30일 새 실거래.
//
// 자금 여유는 지도와 같은 loanPolicy.loanCalcFor 어댑터로 계산한다 —
// 두 화면의 숫자가 어긋날 수 없게 하려고 계산을 공유한다.
// ⚠️ hasIncome은 props로 받아 그대로 쓴다(카드 안에서 다시 판정하지 말 것) —
//    판정 기준이 갈리면 지도와 브리핑의 배지가 어긋난다.

import { loanCalcFor } from "../../lib/loanPolicy";
import { formatManwon, shortDate } from "../../lib/format";
import { regionName } from "../../lib/regions";
import { isNew, complexKey } from "../../lib/briefingSeen";
import {
  card, cardHead, headSub, row, rowDivider, rowTop, rowName, rowPrice, rowMeta,
  rowBadges, upTag, downTag, okTag, noTag, rowBtn,
} from "./styles";

export default function FavoriteCard({ complexes, seen, profile, assets, hasIncome, onFocus }) {
  const loanFor = loanCalcFor(profile, assets);
  return (
    <section>
      <div style={cardHead}>
        ⭐ 관심 단지 <span style={headSub}>· 최근 30일</span>
      </div>
      <div style={card}>
        {complexes.map((c, i) => {
          const top = c.recent[0];
          const fresh = isNew(c, seen);
          const chg = c.prevAmount ? ((top.amount - c.prevAmount) / c.prevAmount) * 100 : null;
          const ln = hasIncome
            ? loanFor(top.amount, { lawdCd: c.lawdCd, area: top.area })
            : null;
          const gap = ln && ln.maxLoan > 0 ? assets - ln.requiredCash : null;
          return (
            <button
              key={complexKey(c)}
              onClick={() => onFocus?.({ lawdCd: c.lawdCd, aptNm: c.aptNm, umdNm: c.umdNm })}
              style={{ ...row, ...rowBtn, ...(i > 0 ? rowDivider : null) }}
            >
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
                    {gap >= 0 ? `✓ 여유 ${formatManwon(gap)}` : `부족 ${formatManwon(-gap)}`}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
