"use client";

// 평형 카드 한 장 — 시세 + 대출 계산 + (선택 시) 추세 그래프. 카드 자체가 추세 선택기다.
// ⚠️ 대출 수치(ln, gap)는 **호출부가 loanForGroup(g)로 계산해 넘긴다** — 카드가 자체적으로
//    다시 계산하지 않는다. 예전에 세부패널이 같은 계산을 따로 적으면서 loanForPrice(gp)로
//    area(g.m2)를 빠뜨려 전용 85㎡ 초과 평형에서 농어촌특별세가 통째로 빠졌다
//    (2026-08-14 실측: 11억 40평 −220만원 / 12억 54평 −238만원 → 같은 평형인데 리스트는
//    "부족", 카드는 "여유"). 결정적 증거는 아래 "농어촌특별세 (85㎡ 초과)" 행이 area가 늘 0이라
//    **한 번도 렌더된 적 없는 죽은 코드**였다는 것. 계산은 한 곳에서만 — 이 규칙을 되돌리지 말 것.

import { C } from "../../lib/palette";
import { formatManwon, monthsToLabel } from "../../lib/format";
import { naverLandUrl } from "../../lib/naverLand";
import TrendChart from "../TrendChart";
import {
  pyeongCard, pyeongCardOn, loanRow, bindingTag, monthlyLine, hintText,
  ownedBtn, ownedBtnOn, basisBtn, basisBtnOn, costToggle, costTable, costRow, naverLandLink,
} from "../mapStyles";

// "얼마 더 모으면 되나" — 현재 시세 기준 단순 나눗셈. 집값 상승·금리 변동은 반영하지 않는다
// (가정을 늘리면 숫자만 그럴듯해지고 신뢰도는 떨어진다).
function SavingHint({ gap, monthlySaving }) {
  const save = Number(monthlySaving) || 0;
  if (save <= 0) return null;
  const label = monthsToLabel(-gap / save);
  if (!label) return null;
  return (
    <span
      style={{ fontWeight: 500, color: C.sub }}
      title="현재 시세 기준 단순 계산입니다. 집값 변동은 반영하지 않습니다."
    >
      {` · 월 ${save.toLocaleString()}만 저축 시 ${label}`}
    </span>
  );
}

function CostTable({ cost, householdType }) {
  return (
    <div style={costTable} onClick={(e) => e.stopPropagation()}>
      <div style={costRow}>
        <span>취득세 ({(cost.taxRate * 100).toFixed(2)}%)</span>
        <span>{formatManwon(cost.acquisitionTax)}</span>
      </div>
      <div style={costRow}>
        <span>지방교육세</span>
        <span>{formatManwon(cost.localEduTax)}</span>
      </div>
      {cost.ruralTax > 0 && (
        <div style={costRow}>
          <span>농어촌특별세 (85㎡ 초과)</span>
          <span>{formatManwon(cost.ruralTax)}</span>
        </div>
      )}
      <div style={costRow}>
        <span>중개보수 (VAT 포함)</span>
        <span>{formatManwon(cost.brokerFee)}</span>
      </div>
      <div style={costRow}>
        <span>등기·채권 등 (근사)</span>
        <span>{formatManwon(cost.registryEtc)}</span>
      </div>
      {householdType === "다주택" && (
        <div style={{ marginTop: 4, color: C.muted, lineHeight: 1.5 }}>
          2주택 취득 기준입니다. 3주택 이상이면 취득세율이 12%로 더 높습니다.
        </div>
      )}
    </div>
  );
}

export default function PyeongCard({
  g, ln, gap, selected, isSel, onSelectArea,
  isOwned, onToggleOwned, regulated, profile, assets,
  trend, trendMonths, setTrendMonths, showCost, setShowCost,
}) {
  return (
    <div
      onClick={() => onSelectArea(g.m2)}
      style={{ ...pyeongCard, ...(isSel ? pyeongCardOn : null), cursor: "pointer" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>
          {g.m2}㎡ <span style={{ color: C.sub, fontWeight: 500 }}>· {g.pyeong}평</span>
        </span>
        <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleOwned(g); }}
            style={{ ...ownedBtn, ...(isOwned ? ownedBtnOn : null) }}
            title="갈아타기: 이 평형을 보유 주택으로 지정하면 예상 매도대금이 자기자금에 합산됩니다"
          >
            {isOwned ? "✓ 보유중" : "보유 지정"}
          </button>
          <a
            href={naverLandUrl(selected.umdNm, selected.aptNm, selected.naverName)}
            target="_blank"
            rel="noopener noreferrer"
            style={naverLandLink}
            title="네이버 부동산에서 이 단지 매물 보기"
            onClick={(e) => e.stopPropagation()}
          >
            {g.count}건 · 🏠 매물
          </a>
        </span>
      </div>
      <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
        평균 <b style={{ color: C.text }}>{formatManwon(g.avg)}</b>
        {" · "}최근 <b style={{ color: C.blue }}>{formatManwon(g.recentAmount)}</b>
      </div>

      {isSel && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}` }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>
              시세 추세 <span style={{ color: C.muted, fontWeight: 400 }}>· {trendMonths === 36 ? "최근 3년" : "최근 1년"}</span>
            </span>
            <span style={{ display: "flex", gap: 4 }}>
              {[{ v: 12, label: "1년" }, { v: 36, label: "3년" }].map((o) => (
                <button key={o.v} onClick={() => setTrendMonths(o.v)} style={{ ...basisBtn, ...(trendMonths === o.v ? basisBtnOn : null) }}>
                  {o.label}
                </button>
              ))}
            </span>
          </div>
          {trend.loading ? (
            <div style={hintText}>불러오는 중…</div>
          ) : trend.series ? (
            <TrendChart series={trend.series} areaLabel={`${g.m2}㎡`} />
          ) : null}
        </div>
      )}

      {ln && (
        ln.maxLoan <= 0 ? (
          <div style={{ ...loanRow, color: C.red, fontWeight: 600, fontSize: 12 }}>
            {regulated && profile.householdType === "다주택"
              ? "규제 다주택 — 대출 불가"
              : "대출 불가 (DSR 한도 초과)"}
          </div>
        ) : (
          <div style={loanRow}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.sub }}>
              <span>
                대출 <b style={{ color: C.text }}>{formatManwon(ln.maxLoan)}</b>
                <span style={bindingTag}>{ln.binding}</span>
              </span>
              <span>필요자금 <b style={{ color: C.text }}>{formatManwon(ln.requiredCash)}</b></span>
            </div>

            {/* 월납은 실제 금리 기준 현금흐름. DSR은 스트레스 금리 기준 규제 수치라 다르다. */}
            <div style={monthlyLine}>
              월 <b style={{ color: C.text }}>{ln.monthlyPayment.toLocaleString()}만원</b>
              {ln.dsrRatio != null && (
                <span style={{ color: C.muted }}>
                  {" · DSR "}{Math.round(ln.dsrRatio * 100)}%
                </span>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation(); // 카드 클릭(추세 선택기)과 충돌 방지
                setShowCost((v) => (v === g.m2 ? null : g.m2));
              }}
              style={costToggle}
            >
              {showCost === g.m2 ? "▾" : "▸"} 부대비용 {formatManwon(ln.acquisitionCost.total)} 내역
            </button>
            {showCost === g.m2 && (
              <CostTable cost={ln.acquisitionCost} householdType={profile.householdType} />
            )}

            {assets > 0 && (
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, color: gap >= 0 ? C.green : C.red }}>
                {gap >= 0 ? (
                  `✓ 매수 가능 · 여유 ${formatManwon(gap)}`
                ) : (
                  <>
                    {`✗ 자금 부족 ${formatManwon(-gap)}`}
                    <SavingHint gap={gap} monthlySaving={profile.monthlySaving} />
                  </>
                )}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
