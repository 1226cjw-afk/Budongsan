"use client";

// 🏗 청약 레이더 — 수도권 분양·무순위(청약홈) + 공공임대(LH), 접수 임박순.
// ⚠️ 소스가 죽거나 미승인이면 그 기관 줄만 빠진다(설계된 동작). 브리핑의 다른 카드는 그대로 뜬다.
//
// ⚠️ **SH·GH는 데이터가 아니라 링크다.** 2026-08-15 조사: SH는 모집공고 오픈API가 아예 없고
//    (서울열린데이터광장·data.go.kr 모두 관리현황 정적파일뿐), GH는 "GH주택청약 모집정보"가
//    있으나 갱신주기가 **연간**이라 임박순 레이더에 쓸 수 없다. 없는 걸 있는 척 비워 두는 것보다
//    "여기서 보라"고 보내는 게 정직하다 → 카드 하단 링크. 나중에 API가 생기면 lhNotice.js와
//    같은 모양으로 붙이면 된다.

import { useMemo } from "react";
import { daysUntil, formatManwon } from "../../lib/format";
import { loanCalcFor } from "../../lib/loanPolicy";
import { pyeongFromSupply } from "../../lib/tradeStats";
import { C } from "../../lib/palette";
import {
  card, cardHead, headSub, row, rowDivider, rowTop, rowName, rowPrice, rowMeta,
  rowBadges, tagBase, okTag, noTag,
} from "./styles";

const MAX_ROWS = 6;

// 단지명에서 블록 표기를 떼어 같은 단지끼리 묶기 위한 기준 이름.
// ⚠️ 2026-08-04 실측: 무순위는 블록별로 쪼개 공고돼 "더샵 송도그란테르 G5-1/3/4/5/11블록"
//    5건이 같은 날 마감으로 올라왔고, 6칸짜리 카드의 5칸을 먹어 2,432세대짜리 다른
//    단지가 잘렸다. 줍줍 공고의 상례라 매번 재발한다 → 묶어서 한 줄로 준다.
//    괄호 suffix → 블록 토큰 순으로 떼되, 문장 중간의 괄호는 건드리지 않는다
//    ("수원당수지구 A5블록 신혼희망타운(공공분양) 추가 입주자모집"은 그대로 남는다).
function baseName(name) {
  return (name || "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s*[A-Za-z0-9-]+(블록|블럭)\s*$/, "")
    .trim();
}

// 평형 한 장의 자금 판정. 지도·새 거래 피드와 **같은 어댑터**(loanCalcFor)를 쓴다 — 두 화면에서
// 같은 금액이 다르게 나오면 도구를 믿을 수 없게 된다.
// ⚠️ gap과 평형은 **같은 모델에서** 뽑아야 한다. 여러 평형을 넘나들며 "제일 싼 분양가"와
//    "제일 큰 여유"를 따로 고르면, 실제로는 살 수 없는 조합이 여유로 표시된다
//    (지도 bestFit()이 같은 이유로 {gap, monthly}를 한 평형에서 뽑는다).
function bestModelFit(models, lawdCd, profile, assets) {
  const loanFor = loanCalcFor(profile, assets);
  let best = null;
  for (const m of models) {
    // ⚠️ area는 전용면적(공급 아님) — 85㎡ 초과면 농특세가 붙는다.
    const ln = loanFor(m.price, { lawdCd, area: m.exclusiveAr });
    if (!ln || ln.maxLoan <= 0) continue;
    const gap = assets - ln.requiredCash;
    if (!best || gap > best.gap) best = { gap, model: m };
  }
  return best;
}

// ⚠️ items·profile은 Briefing이 내려준다 — 이 안에서 fetch하지 말 것. 이 카드는 부모의 로딩
//    게이트(data === null) 뒤에 마운트되므로, 여기서 부르면 /api/briefing이 끝나야
//    /api/subscription이 출발한다(2026-08-05 실측 +410ms). null = 아직 로딩 중.
export default function SubscriptionCard({ items, profile, assets, hasIncome }) {
  // 같은 단지·같은 마감일·같은 구분·같은 기관이면 한 줄로. 세대수는 합산한다.
  // ⚠️ 키에 agency를 포함할 것 — LH와 청약홈은 번호 체계가 무관해 동명 공고가 섞일 수 있다.
  const groups = useMemo(() => {
    const by = new Map();
    for (const it of items || []) {
      const k = `${baseName(it.name)}|${it.receipt_end}|${it.kind}|${it.agency || ""}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(it);
    }
    return [...by.values()].map((list) => {
      const head = list[0];
      const households = list.reduce((s, x) => s + (x.households || 0), 0);
      // 분양가·평형은 블록을 합쳐 한 벌로 본다(같은 단지의 다른 블록도 같은 평형대다).
      const models = list.flatMap((x) => x.models || []);
      const prices = models.map((m) => m.price).filter(Boolean);
      const fit =
        hasIncome && models.length
          ? bestModelFit(models, head.lawd_cd, profile, assets)
          : null;
      return {
        key: head.house_manage_no,
        name: list.length > 1 ? baseName(head.name) : head.name,
        blocks: list.length,
        households: households || null,
        region: head.region,
        kind: head.kind,
        agency: head.agency,
        detailKind: head.detail_kind,
        url: head.url,
        receipt_start: head.receipt_start,
        receipt_end: head.receipt_end,
        spsply_end: head.spsply_end,
        priceMin: prices.length ? Math.min(...prices) : null,
        priceMax: prices.length ? Math.max(...prices) : null,
        fit,
      };
    });
  }, [items, profile, assets, hasIncome]);

  if (!items?.length) return null;

  return (
    <section>
      <div style={cardHead}>
        🏗 청약 레이더 <span style={headSub}>· 수도권 · 접수 임박순</span>
      </div>
      <div style={card}>
        {groups.slice(0, MAX_ROWS).map((it, i) => {
          const d = it.receipt_end ? daysUntil(it.receipt_end) : null;
          // 특별공급은 일반보다 먼저 마감한다 — 더 이르면 그쪽이 실질 마감이라 함께 띄운다.
          const sp = it.spsply_end ? daysUntil(it.spsply_end) : null;
          const spEarlier = sp != null && d != null && sp < d && sp >= 0;
          const inner = (
            <>
              <div style={rowTop}>
                <span style={rowName}>{it.name}</span>
                {d != null && (
                  // D-3 이내는 빨강 — ⏳ 일정 카드와 같은 "지금 손 써야 함" 신호.
                  <span style={{ ...rowPrice, color: d <= 3 ? C.red : "#b45309" }}>
                    {d === 0 ? "오늘 마감" : `D-${d}`}
                  </span>
                )}
              </div>
              <div style={rowMeta}>
                {it.region} · {it.detailKind || it.kind}
                {it.blocks > 1 ? ` · ${it.blocks}개 블록` : ""}
                {it.households ? ` · ${it.households}세대` : ""}
                {it.receipt_start && it.receipt_end
                  ? ` · 접수 ${it.receipt_start.slice(5)}~${it.receipt_end.slice(5)}`
                  : ""}
              </div>
              <div style={rowBadges}>
                {it.agency && (
                  <span style={it.agency === "LH" ? lhTag : applyTag}>
                    {it.agency === "LH" ? "🏢 LH" : "🏛 청약홈"}
                  </span>
                )}
                {it.priceMin != null && (
                  <span style={priceTag}>
                    분양가{" "}
                    {it.priceMin === it.priceMax
                      ? formatManwon(it.priceMin)
                      : `${formatManwon(it.priceMin)}~${formatManwon(it.priceMax)}`}
                  </span>
                )}
                {it.fit && (
                  <span style={it.fit.gap >= 0 ? okTag : noTag}>
                    {it.fit.gap >= 0
                      ? `✓ 여유 ${formatManwon(it.fit.gap)}`
                      : `부족 ${formatManwon(-it.fit.gap)}`}
                    {it.fit.model.supplyAr
                      ? ` · ${pyeongFromSupply(it.fit.model.supplyAr)}평`
                      : ""}
                  </span>
                )}
                {spEarlier && (
                  <span style={spTag}>
                    특공 마감 {sp === 0 ? "오늘" : `D-${sp}`}
                  </span>
                )}
              </div>
            </>
          );
          // ⚠️ url이 없을 때 href="#"로 두면 눌러도 아무 일이 없는 죽은 링크가 된다
          //    → 링크가 아닌 행으로 렌더해 클릭 자체를 없앤다(커서·hover도 안 뜬다).
          return it.url ? (
            <a
              key={it.key}
              href={it.url}
              target="_blank"
              rel="noreferrer"
              className="news-row"
              style={{
                ...row, textDecoration: "none", color: "inherit",
                ...(i > 0 ? rowDivider : null),
              }}
            >
              {inner}
            </a>
          ) : (
            <div key={it.key} style={{ ...row, ...(i > 0 ? rowDivider : null) }}>
              {inner}
            </div>
          );
        })}

        {/* SH·GH는 공식 API가 없다(파일 상단 ⚠️ 참조) → 공고 게시판으로 보낸다. */}
        <div style={agencyFoot}>
          공공임대는 기관별 청약 시스템에도 올라와요
          <div style={agencyLinks}>
            <a href="https://www.i-sh.co.kr/main/lay2/S1T111C133/contents.do" target="_blank" rel="noreferrer" style={agencyLink}>
              SH 서울주택도시공사 →
            </a>
            <a href="https://apply.gh.or.kr/sb/sr/sr7150/selectPbancRentHouseList.do" target="_blank" rel="noreferrer" style={agencyLink}>
              GH 경기주택도시공사 →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

const lhTag = { ...tagBase, color: "#0369a1", background: "#e0f2fe" };
const applyTag = { ...tagBase, color: C.sub, background: C.divider };
const priceTag = { ...tagBase, color: "#7c3aed", background: "#f3e8ff" };
const spTag = { ...tagBase, color: "#be123c", background: "#ffe4e6" };
const agencyFoot = {
  borderTop: `1px solid ${C.divider}`, padding: "10px 15px",
  fontSize: 11, color: C.muted, background: "#fbfdff",
};
const agencyLinks = { display: "flex", gap: 12, marginTop: 5, flexWrap: "wrap" };
const agencyLink = { fontSize: 11.5, fontWeight: 700, color: C.blue, textDecoration: "none" };
