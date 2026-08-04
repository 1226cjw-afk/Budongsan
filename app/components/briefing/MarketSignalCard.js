"use client";

// 📊 시장 신호 — 시세에서 걸러낸 거래를 지표로 되살린 카드.
// 참조: koreamonitor /estate "시장 신호" 패널.

import StatTile from "../StatTile";
import { regionName } from "../../lib/regions";
import { C } from "../../lib/palette";
import { card, cardHead, headSub } from "./styles";

// 증감 표기 — ▲▼ + 부호. 색은 쓰지 않는다(빨강=자금부족과 충돌하므로).
const deltaText = (d) =>
  d === 0 ? "직전 30일과 같음" : `직전 30일 대비 ${d > 0 ? "▲" : "▼"}${Math.abs(d)}`;

// "2026-06-04" → "6/04". 헤더에 실제 창을 찍어 "최근 30일"로 오해하지 않게 한다.
const md = (s) => (s ? `${+s.slice(5, 7)}/${s.slice(8, 10)}` : "");

export default function MarketSignalCard({ signal }) {
  // 표본이 아예 없는 지역(cron이 아직 안 데운 곳)은 0으로 채운 타일 대신 통째로 생략한다.
  const regions = (signal?.byRegion || []).filter((r) => r.volume.count + r.volume.prevCount > 0);
  if (!regions.length) return null;

  // 창은 지역과 무관하게 같다(같은 asOf로 계산) — 첫 지역 것을 헤더에 쓴다.
  const win = regions[0].window;

  return (
    <section>
      <div style={cardHead}>
        📊 시장 신호{" "}
        <span style={headSub}>
          · {md(win?.start)}~{md(win?.end)} 계약분 · 신고 확정 구간
        </span>
      </div>
      <div style={card}>
        {regions.map((r, i) => (
          <div
            key={r.lawdCd}
            style={{
              padding: "11px 15px",
              ...(i > 0 ? { borderTop: `1px solid ${C.divider}` } : null),
            }}
          >
            <div style={regionLabel}>{regionName(r.lawdCd)}</div>
            <div style={grid}>
              <StatTile
                label="거래량"
                value={`${r.volume.count}건`}
                caption={deltaText(r.volume.delta)}
              />
              <StatTile
                label="계약 해제"
                value={`${r.cancelled.count}건`}
                caption={
                  r.cancelled.latestDay
                    ? `최근 ${r.cancelled.latestDay}`
                    : deltaText(r.cancelled.delta)
                }
                tone={r.cancelled.delta > 0 ? "warn" : "neutral"}
              />
              {/* 법인 타일이 숨겨지면 타일이 3개(홀수)라 오른쪽 아래가 빈다 —
                  지역마다 반복되면 구멍처럼 보여서 마지막 타일을 2칸으로 늘린다. */}
              <div style={{ gridColumn: r.corporate.available ? "auto" : "span 2" }}>
                <StatTile
                  label="직거래 비중"
                  value={`${(r.direct.ratio * 100).toFixed(1)}%`}
                  caption={`${r.direct.count}건 / 전체 ${r.direct.total}건`}
                />
              </div>
              {r.corporate.available && (
                <StatTile
                  label="법인 순매수"
                  value={`${r.corporate.net > 0 ? "+" : ""}${r.corporate.net}건`}
                  caption={`매수 ${r.corporate.buy} · 매도 ${r.corporate.sell}`}
                />
              )}
            </div>
          </div>
        ))}
        <div style={footnote}>
          해제·직거래는 시세 계산에서 빠진 거래예요. 최근 30일은 신고 기한(계약 후 30일)
          때문에 아직 덜 채워져 있어서, 신고가 끝난 구간끼리 비교했어요.
        </div>
      </div>
    </section>
  );
}

const regionLabel = { fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 7 };
// ⚠️ 2열 고정 — /news는 640px 단일 컬럼이라 4열은 들어가지 않는다.
const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 };
const footnote = {
  padding: "9px 15px", borderTop: `1px solid ${C.divider}`,
  fontSize: 10.5, color: C.muted, lineHeight: 1.5, background: "#fafbfc",
};
