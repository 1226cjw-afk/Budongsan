"use client";

// 🏗 청약 레이더 — 수도권 분양·무순위, 접수 임박순.
// ⚠️ 청약홈 API가 죽거나 미승인이면 목록이 비어 이 카드는 렌더되지 않는다(설계된 동작).
//    브리핑의 다른 카드는 그대로 뜬다.

import { useMemo } from "react";
import { daysUntil } from "../../lib/format";
import { C } from "../../lib/palette";
import { card, cardHead, headSub, row, rowDivider, rowTop, rowName, rowPrice, rowMeta } from "./styles";

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

// ⚠️ items는 Briefing이 내려준다 — 이 안에서 fetch하지 말 것. 이 카드는 부모의 로딩
//    게이트(data === null) 뒤에 마운트되므로, 여기서 부르면 /api/briefing이 끝나야
//    /api/subscription이 출발한다(2026-08-05 실측 +410ms). null = 아직 로딩 중.
export default function SubscriptionCard({ items }) {
  // 같은 단지·같은 마감일·같은 구분이면 한 줄로. 세대수는 합산한다.
  const groups = useMemo(() => {
    const by = new Map();
    for (const it of items || []) {
      const k = `${baseName(it.name)}|${it.receipt_end}|${it.kind}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(it);
    }
    return [...by.values()].map((list) => {
      const head = list[0];
      const households = list.reduce((s, x) => s + (x.households || 0), 0);
      return {
        key: head.house_manage_no,
        name: list.length > 1 ? baseName(head.name) : head.name,
        blocks: list.length,
        households: households || null,
        region: head.region,
        kind: head.kind,
        url: head.url,
        receipt_start: head.receipt_start,
        receipt_end: head.receipt_end,
      };
    });
  }, [items]);

  if (!items?.length) return null;

  return (
    <section>
      <div style={cardHead}>
        🏗 청약 레이더 <span style={headSub}>· 수도권 · 접수 임박순</span>
      </div>
      <div style={card}>
        {groups.slice(0, MAX_ROWS).map((it, i) => {
          const d = it.receipt_end ? daysUntil(it.receipt_end) : null;
          return (
            <a
              key={it.key}
              href={it.url || "#"}
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
                {it.region} · {it.kind}
                {it.blocks > 1 ? ` · ${it.blocks}개 블록` : ""}
                {it.households ? ` · ${it.households}세대` : ""}
                {it.receipt_start && it.receipt_end
                  ? ` · 접수 ${it.receipt_start.slice(5)}~${it.receipt_end.slice(5)}`
                  : ""}
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
