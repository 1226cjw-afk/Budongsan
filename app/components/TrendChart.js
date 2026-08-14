// 월별 시세 추세 라인차트(SVG) + 좌측 Y축 가격 눈금.
// series: [{ymd, value, avg, count}] 과거→현재. 그리는 값은 **중앙값(value)** —
// 한 평형의 월 거래가 1~3건이라 평균은 특수거래 하나에 크게 흔들린다(/api/trend 주석 참조).

import { C } from "../lib/palette";
import { hintText } from "./mapStyles";

// Y축 가격 눈금용 축약 라벨. 5.2억 / 0.8억.
function eokLabel(manwon) {
  return (manwon / 10000).toFixed(1) + "억";
}

export default function TrendChart({ series, areaLabel }) {
  const pts = series.filter((s) => s.value != null);
  if (pts.length < 2) {
    return (
      <div style={hintText}>{areaLabel ? `${areaLabel} ` : ""}추세를 그릴 거래가 부족합니다.</div>
    );
  }
  const W = 280, H = 116, AX = 44, PADX = 8, PADTOP = 8, PADBOT = 18;
  const plotW = W - AX - PADX;
  const plotH = H - PADTOP - PADBOT;
  const vals = pts.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const n = series.length;
  const dense = n > 16; // 3년(36개월) 등 점이 많으면 마커 숨기고 축 라벨에 중간점 추가
  const x = (i) => AX + (i * plotW) / (n - 1);
  const y = (v) => PADTOP + (1 - (v - min) / span) * plotH;
  const idxOf = new Map(series.map((s, i) => [s, i])); // 점 위치는 전체 series 인덱스 기준(결측월=가로 점프). indexOf O(n²) 회피.
  // ⚠️ 선과 점은 **반드시 같은 접근자**를 통과시킬 것. 2026-07-29에 추세를 중앙값으로 바꾸면서
  //    pts 필터·Y축 범위·점·상승판정은 value로 옮겼는데 **폴리라인만 p.avg로 남아 있었다**
  //    (2026-08-14 발견). 그래서 선은 평균, 눈금·점·색은 중앙값을 그리고 있었다 — 중앙값 전환이
  //    노린 "특수거래 하나에 추세선이 끌려가는 것"이 정작 선에서만 그대로 살아 있었다.
  //    게다가 Y축 범위(min/max)를 중앙값으로만 잡으니 평균이 그 밖으로 나가는 달엔 선이
  //    SVG 밖으로 잘렸다. 두 곳에 값을 따로 적으면 또 갈라진다 → 접근자 하나로 묶는다.
  const px = (p) => x(idxOf.get(p));
  const py = (p) => y(p.value);
  const line = pts.map((p) => `${px(p)},${py(p)}`).join(" ");
  const first = pts[0];
  const last = pts[pts.length - 1];
  const mid = pts[Math.floor(pts.length / 2)];
  const up = last.value >= first.value;
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
          <circle key={p.ymd} cx={px(p)} cy={py(p)} r="2.5" fill={stroke} />
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
      <div style={{ ...hintText, marginTop: 2 }}>
        월별 <b>중앙값</b> · 거래 {pts.reduce((s, p) => s + p.count, 0)}건 (해제·직거래 제외)
      </div>
    </div>
  );
}
