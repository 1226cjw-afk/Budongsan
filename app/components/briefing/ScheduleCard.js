"use client";

// ⏳ 다가오는 일정 — 즐겨찾기에 적어둔 전세 만기·메모의 D-30 이내 건.

import { C } from "../../lib/palette";
import { card, cardHead, row, rowDivider, rowTop, rowName, rowPrice, rowMeta } from "./styles";

export default function ScheduleCard({ upcoming }) {
  return (
    <section>
      <div style={cardHead}>⏳ 다가오는 일정</div>
      <div style={card}>
        {upcoming.map((u, i) => (
          <div key={`${u.aptNm}-${u.kind}-${i}`} style={{ ...row, ...(i > 0 ? rowDivider : null) }}>
            <div style={rowTop}>
              <span style={rowName}>
                {u.kind === "lease" ? "🔑" : "📌"} {u.aptNm}
              </span>
              {/* D-7 이내는 빨강 — 이 화면에서 빨강은 "지금 손 써야 함"이다. */}
              <span style={{ ...rowPrice, color: u.dday <= 7 ? C.red : "#b45309" }}>
                D-{u.dday}
              </span>
            </div>
            <div style={rowMeta}>{u.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
