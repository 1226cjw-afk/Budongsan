// 월별 시세 추세 라인차트(SVG) + 좌측 Y축 가격 눈금. series: [{ymd, avg, count}] 과거→현재.

import { C } from "../lib/palette";
import { hintText } from "./mapStyles";

// Y축 가격 눈금용 축약 라벨. 5.2억 / 0.8억.
function eokLabel(manwon) {
  return (manwon / 10000).toFixed(1) + "억";
}

export default function TrendChart({ series, areaLabel }) {
  const pts = series.filter((s) => s.avg != null);
  if (pts.length < 2) {
    return (
      <div style={hintText}>{areaLabel ? `${areaLabel} ` : ""}추세를 그릴 거래가 부족합니다.</div>
    );
  }
  const W = 280, H = 116, AX = 44, PADX = 8, PADTOP = 8, PADBOT = 18;
  const plotW = W - AX - PADX;
  const plotH = H - PADTOP - PADBOT;
  const vals = pts.map((p) => p.avg);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const n = series.length;
  const dense = n > 16; // 3년(36개월) 등 점이 많으면 마커 숨기고 축 라벨에 중간점 추가
  const x = (i) => AX + (i * plotW) / (n - 1);
  const y = (v) => PADTOP + (1 - (v - min) / span) * plotH;
  const line = pts.map((p) => `${x(series.indexOf(p))},${y(p.avg)}`).join(" ");
  const first = pts[0];
  const last = pts[pts.length - 1];
  const mid = pts[Math.floor(pts.length / 2)];
  const up = last.avg >= first.avg;
  const stroke = up ? C.red : C.blue;
  const TICKS = 4;
  const tickVals = Array.from({ length: TICKS + 1 }, (_, k) => min + (span * k) / TICKS);
  return (
    <div style={{ marginTop: 6 }}>
      <svg width={W} height={H} style={{ display: "block" }}>
        {tickVals.map((tv, k) => (
          <g key={k}>
            <line x1={AX} y1={y(tv)} x2={W - PADX} y2={y(tv)} stroke="#eef2f7" strokeWidth="1" />
            <text x={AX - 5} y={y(tv) + 3} textAnchor="end" fontSize="9" fill={C.muted}>
              {eokLabel(tv)}
            </text>
          </g>
        ))}
        <polyline points={line} fill="none" stroke={stroke} strokeWidth="2" />
        {!dense && pts.map((p) => (
          <circle key={p.ymd} cx={x(series.indexOf(p))} cy={y(p.avg)} r="2.5" fill={stroke} />
        ))}
      </svg>
      <div
        style={{
          display: "flex", justifyContent: "space-between",
          fontSize: 10, color: C.muted, marginTop: 2, paddingLeft: AX - PADX,
        }}
      >
        <span>{first.ymd.slice(2, 4)}.{first.ymd.slice(4)}</span>
        {dense && <span>{mid.ymd.slice(2, 4)}.{mid.ymd.slice(4)}</span>}
        <span>{last.ymd.slice(2, 4)}.{last.ymd.slice(4)}</span>
      </div>
    </div>
  );
}
