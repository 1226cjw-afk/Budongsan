"use client";

// ⚖️ 같은 평형의 월별 중앙값 추세를 단지별로 겹쳐 그린다(단일 Y축 — 전부 같은 단위 만원).
// ⚠️ 색만으로 단지를 구분하지 않는다: 범례 + 선 끝 번호(①②…) + 표 머리의 같은 번호.
//    팔레트(SERIES_COLORS)는 대비 3:1 미만 색이 있어(dataviz 검증 WARN) 표·번호가 그 보완이다.
// ⚠️ 선과 점은 TrendChart와 같이 **같은 접근자**(px/py)를 통과시킨다 — 2026-08-14 선만 평균이던 사고.

import { useEffect, useRef, useState } from "react";
import { C } from "../../lib/palette";
import { formatManwon } from "../../lib/format";

// dataviz 기본 범주 팔레트 1~4번(라이트) — validate_palette.js 통과(CVD 최악 ΔE 9.1).
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
export const SERIES_MARKS = ["①", "②", "③", "④"];

const eok = (v) => (v / 10000).toFixed(1) + "억";
const ymLabel = (ymd) => `${ymd.slice(2, 4)}.${ymd.slice(4)}`;

export default function CompareTrendChart({ months, lines }) {
  const [hover, setHover] = useState(null); // 월 인덱스
  // 그리기 폭 = 실제 px 폭. viewBox를 600 고정으로 두면 모바일(≈340px)에서 축 글씨가 5px대로 줄어든다
  // (2026-11-01 Playwright 390px 실측). 폭을 맞추면 글씨는 늘 지정한 px 크기다.
  const wrapRef = useRef(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0) setW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const vals = lines.flatMap((l) => l.series.map((p) => p.value)).filter((v) => v != null);
  const drawable = lines.filter((l) => l.series.filter((p) => p.value != null).length >= 2);
  if (!months?.length || vals.length < 2 || !drawable.length) {
    return <div ref={wrapRef} style={{ fontSize: 12, color: C.muted, padding: "10px 2px" }}>겹쳐 그릴 월별 거래가 부족합니다.</div>;
  }

  const H = W < 480 ? 180 : 200, AX = 46, PADR = 26, PADT = 10, PADB = 22;
  const plotW = W - AX - PADR;
  const plotH = H - PADT - PADB;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min) * 0.08 || max * 0.05 || 1;
  const lo = min - pad;
  const span = max + pad - lo;
  const n = months.length;
  const x = (i) => AX + (i * plotW) / (n - 1);
  const y = (v) => PADT + (1 - (v - lo) / span) * plotH;
  const TICKS = 4;
  const ticks = Array.from({ length: TICKS + 1 }, (_, k) => lo + (span * k) / TICKS);

  function moveAt(clientX, el) {
    const r = el.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((sx - AX) / plotW) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  }

  const hoverRows = hover == null ? [] : lines
    .map((l) => ({ ...l, p: l.series[hover] }))
    .filter((l) => l.p?.value != null);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block", touchAction: "pan-y" }}
        onMouseMove={(e) => moveAt(e.clientX, e.currentTarget)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => e.touches[0] && moveAt(e.touches[0].clientX, e.currentTarget)}
        role="img"
        aria-label="단지별 월별 중앙값 추세"
      >
        {ticks.map((tv, k) => (
          <g key={k}>
            <line x1={AX} y1={y(tv)} x2={W - PADR} y2={y(tv)} stroke="#eef2f7" strokeWidth="1" />
            <text x={AX - 6} y={y(tv) + 3} textAnchor="end" fontSize="10" fill={C.muted}>{eok(tv)}</text>
          </g>
        ))}
        {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={C.muted}>{ymLabel(months[i])}</text>
        ))}
        {hover != null && (
          <line x1={x(hover)} y1={PADT} x2={x(hover)} y2={PADT + plotH} stroke={C.muted} strokeWidth="1" strokeDasharray="3 3" />
        )}
        {lines.map((l) => {
          const pts = l.series.map((p, i) => ({ ...p, i })).filter((p) => p.value != null);
          if (!pts.length) return null;
          const px = (p) => x(p.i);
          const py = (p) => y(p.value);
          const last = pts[pts.length - 1];
          return (
            <g key={l.key}>
              {pts.length >= 2 && (
                <polyline
                  points={pts.map((p) => `${px(p)},${py(p)}`).join(" ")}
                  fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                />
              )}
              {pts.map((p) => (
                <circle key={p.i} cx={px(p)} cy={py(p)} r={hover === p.i ? 4.5 : 3}
                  fill={l.color} stroke="#fff" strokeWidth="2" />
              ))}
              <text x={px(last) + 7} y={py(last) + 4} fontSize="11" fontWeight="700" fill={C.text}>{l.mark}</text>
            </g>
          );
        })}
      </svg>

      {hover != null && hoverRows.length > 0 && (
        <div
          style={{
            position: "absolute", top: 4, pointerEvents: "none",
            ...(hover > (n - 1) / 2 ? { left: 8 } : { right: 8 }),
            background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8,
            boxShadow: "0 4px 12px rgba(15,23,42,0.10)", padding: "6px 9px", fontSize: 11.5, color: C.text,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 3 }}>{ymLabel(months[hover])}</div>
          {hoverRows.map((l) => (
            <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 5, lineHeight: 1.6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
              <span style={{ color: C.sub }}>{l.mark}</span>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{formatManwon(l.p.value)}</b>
              <span style={{ color: C.muted }}>{l.p.count}건</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
