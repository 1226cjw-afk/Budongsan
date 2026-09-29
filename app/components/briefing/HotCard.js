"use client";

// 🔥 핫플 단지 — 새로 신고된 거래가 몰린 단지(오늘 / 이번 주) + 칩(종합·거래·가격·뉴스).
// 원료: /api/hot(trade_reports 집계, 서울+경기 전역) + buildNewsWatch(뉴스 요주의 단지).
// 순위는 lib/hotRank.rankHot — ⚠️ 가점·임계값은 임시값(7일치 쌓이면 실측으로 확정).
//
// ⚠️ 이 카드는 📢 요주의 단지 카드를 흡수했다(2026-09-29). 그 카드의 규칙을 그대로 상속한다:
//    ① **★가 0개여도 반드시 렌더** — ★를 담게 만드는 입구다(Briefing 빈 상태 분기 참조)
//    ② **★를 여기서 직접 담지 않는다 — 지도로 보내기만** — 뉴스 이름 ≠ 실거래명이라 짐작으로
//       ★를 만들면 즐겨찾기 키가 어긋난 죽은 행이 된다. 판단은 지도에서 눈으로.
//    ③ 지역을 못 정한 뉴스 단지는 이동 버튼을 감춘다(틀린 곳으로 보내느니 기사만).

import { useMemo, useState } from "react";
import { rankHot, HOT_PRICE_MIN_REPORTS } from "../../lib/hotRank";
import { loanCalcFor } from "../../lib/loanPolicy";
import { formatManwon } from "../../lib/format";
import { toPyeong } from "../../lib/tradeStats";
import { regionName } from "../../lib/regions";
import { C } from "../../lib/palette";
import {
  card, cardHead, headSub, row, rowDivider, rowTop, rowName, rowPrice, rowMeta, rowBadges,
  tagBase, upTag, okTag, noTag, rowBtn,
} from "./styles";

const CHIPS = [["total", "종합"], ["trade", "거래"], ["price", "가격"], ["news", "뉴스"]];
const FOLD = 5;

export default function HotCard({ hot, watch, profile, assets, hasIncome, onFocus }) {
  const todayN = hot?.today?.complexes?.length || 0;
  const weekN = hot?.week?.complexes?.length || 0;
  // null = 자동. 첫 배포 후 며칠은 오늘이 비어 있다 → 이번 주, 둘 다 비면 뉴스 칩.
  const [win, setWin] = useState(null);
  const [chip, setChip] = useState(null);
  const [open, setOpen] = useState(false);
  const w = win ?? (todayN ? "today" : "week");
  const ch = chip ?? (todayN || weekN ? "total" : "news");

  const loanFor = useMemo(() => loanCalcFor(profile, assets), [profile, assets]);
  const rows = useMemo(
    () => rankHot({ complexes: hot?.[w]?.complexes || [], watch, chip: ch }),
    [hot, w, watch, ch]
  );
  const shown = open ? rows : rows.slice(0, FOLD);

  return (
    <section>
      <div style={cardHead}>
        🔥 핫플 단지 <span style={headSub}>· 서울·경기 새 신고 기준</span>
      </div>
      <div style={card}>
        <div style={ctrlRow}>
          <span style={seg}>
            {[["today", "오늘"], ["week", "이번 주"]].map(([v, l]) => (
              <button key={v} onClick={() => setWin(v)} style={{ ...segB, ...(w === v ? segOn : null) }}>
                {l}
              </button>
            ))}
          </span>
          <span style={chips}>
            {CHIPS.map(([v, l]) => (
              <button key={v} onClick={() => setChip(v)} style={{ ...chipB, ...(ch === v ? chipOn : null) }}>
                {l}
              </button>
            ))}
          </span>
        </div>

        {hot === null ? (
          <div style={emptyRow}>불러오는 중…</div>
        ) : shown.length === 0 ? (
          <div style={emptyRow}>
            {ch === "news"
              ? "최근 뉴스에 반복 등장한 단지가 없어요."
              : w === "today"
                ? "오늘 새 신고는 아직이에요 — 매일 아침 쌓여요. 이번 주를 보세요."
                : "이번 주 새 신고 기록이 아직 없어요 — 매일 아침부터 쌓여요."}
          </div>
        ) : (
          shown.map((r, i) =>
            r.kind === "news" ? (
              <NewsRow key={r.key} n={r.news} i={i} onFocus={onFocus} />
            ) : (
              <TradeRow
                key={r.key} r={r} i={i} onFocus={onFocus}
                loanFor={loanFor} assets={assets} hasIncome={hasIncome}
              />
            )
          )
        )}

        {rows.length > FOLD && (
          <button onClick={() => setOpen((v) => !v)} style={moreBtn}>
            {open ? "접기" : `더보기 (${rows.length - FOLD})`}
          </button>
        )}
        <div style={footnote}>12억 미만 거래 · 신고일 기준 · 해제·직거래 제외</div>
      </div>
    </section>
  );
}

function TradeRow({ r, i, onFocus, loanFor, assets, hasIncome }) {
  const x = r.c;
  const latest = x.latest;
  const ln = hasIncome && latest?.amount ? loanFor(latest.amount, { lawdCd: x.lawdCd, area: latest.area }) : null;
  const gap = ln && ln.maxLoan > 0 ? assets - ln.requiredCash : null;
  const jump = x.jump && x.jump.pct > 0 && x.reports >= HOT_PRICE_MIN_REPORTS ? x.jump : null;
  return (
    <button
      onClick={() => onFocus({ lawdCd: x.lawdCd, aptNm: x.aptNm, umdNm: x.umdNm })}
      style={{ ...row, ...rowBtn, ...(i > 0 ? rowDivider : null) }}
    >
      <div style={rowTop}>
        <span style={rowName}>
          <span style={rankNo}>{i + 1}</span>
          {x.aptNm}
        </span>
        {latest?.amount ? <span style={rowPrice}>{formatManwon(latest.amount)}</span> : null}
      </div>
      <div style={rowMeta}>
        {regionName(x.lawdCd)} {x.umdNm}
        {latest?.area ? ` · 최근 ${toPyeong(latest.area)}평` : ""} · 지도에서 보기 →
      </div>
      <div style={rowBadges}>
        <span style={reportTag}>신고 {x.reports}건</span>
        {jump && <span style={upTag}>{jump.pyeong}평 직전 대비 +{jump.pct}%</span>}
        {r.newsHit && <span style={newsTag}>뉴스 {r.newsHit.articles}건</span>}
        {gap != null && (
          <span style={gap >= 0 ? okTag : noTag}>
            {gap >= 0 ? `✓ 여유 ${formatManwon(gap)}` : `부족 ${formatManwon(-gap)}`}
          </span>
        )}
      </div>
    </button>
  );
}

function NewsRow({ n, i, onFocus }) {
  return (
    <div style={{ ...row, ...(i > 0 ? rowDivider : null) }}>
      <div style={rowTop}>
        <span style={rowName}>
          <span style={rankNo}>{i + 1}</span>
          {n.name}
          {n.regionName && <span style={regionText}> · {n.regionName}</span>}
        </span>
        <span style={newsTag}>기사 {n.articles}건 · {n.days}일</span>
      </div>
      {n.top?.link && (
        <a href={n.top.link} target="_blank" rel="noreferrer" style={topLink}>
          {n.top.title}
        </a>
      )}
      {n.lawdCd ? (
        <button onClick={() => onFocus({ lawdCd: n.lawdCd, aptNm: n.name })} style={gotoBtn}>
          지도에서 보기 →
        </button>
      ) : (
        <div style={{ ...rowMeta, marginTop: 6 }}>지역이 특정되지 않아 기사로만 확인돼요</div>
      )}
    </div>
  );
}

const ctrlRow = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 15px 4px" };
const seg = { display: "flex", gap: 2, padding: 2, borderRadius: 9, background: C.divider };
const segB = {
  padding: "4px 10px", borderRadius: 7, border: "none", background: "transparent",
  fontSize: 11.5, fontWeight: 700, color: C.sub, cursor: "pointer",
};
const segOn = { background: "#fff", color: C.text, boxShadow: "0 1px 2px rgba(15,23,42,0.08)" };
const chips = { display: "flex", gap: 5, flexWrap: "wrap" };
// ⚠️ 비shorthand border — chipOn이 borderColor만 덮는다.
const chipB = {
  padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
  borderWidth: 1, borderStyle: "solid", borderColor: C.border, background: "#fff", color: C.sub,
};
const chipOn = { borderColor: "#fdba74", background: "#fff7ed", color: "#c2410c" };
const rankNo = {
  display: "inline-block", minWidth: 18, marginRight: 6, fontSize: 12, fontWeight: 800,
  color: "#c2410c", fontVariantNumeric: "tabular-nums",
};
const reportTag = { ...tagBase, color: "#c2410c", background: "#ffedd5" };
const newsTag = { ...tagBase, color: "#9a3412", background: "#fff7ed" };
const regionText = { fontSize: 11.5, fontWeight: 500, color: C.muted };
const topLink = { display: "block", marginTop: 5, fontSize: 11.5, color: C.sub, textDecoration: "none", lineHeight: 1.45 };
const gotoBtn = {
  display: "inline-block", marginTop: 7, padding: "4px 9px", border: "none", cursor: "pointer",
  fontSize: 11, fontWeight: 700, color: "#1d4ed8", background: C.blueSoft, borderRadius: 7,
};
const moreBtn = {
  display: "block", width: "100%", padding: "9px 15px", border: "none", borderTop: `1px solid ${C.divider}`,
  background: "#fff", color: C.blue, fontSize: 12, fontWeight: 700, cursor: "pointer",
};
const emptyRow = { padding: "14px 15px", fontSize: 12, color: C.muted, lineHeight: 1.6 };
const footnote = {
  padding: "8px 15px", borderTop: `1px solid ${C.divider}`,
  fontSize: 10.5, color: C.muted, background: "#fafbfc",
};
