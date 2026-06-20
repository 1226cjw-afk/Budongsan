"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { REGIONS, regionName } from "../lib/regions";

// 카카오맵 JS SDK를 동적으로 로드해 지도를 렌더링하고,
// /api/trades 에서 받은 실거래가 단지를 마커로 표시하는 클라이언트 컴포넌트.
// SDK는 카카오 디벨로퍼스에 등록한 사이트 도메인(http://localhost:3000)에서만 동작.

// 전용면적(㎡) 구간 필터. 거래 excluUseAr 기준 [min, max).
const AREA_FILTERS = [
  { value: "all", label: "전체 면적", min: 0, max: Infinity },
  { value: "s", label: "~60㎡ (~18평)", min: 0, max: 60 },
  { value: "m", label: "60~85㎡ (18~26평)", min: 60, max: 85 },
  { value: "l", label: "85~135㎡ (26~41평)", min: 85, max: 135 },
  { value: "xl", label: "135㎡~ (41평~)", min: 135, max: Infinity },
];

// 거래가(만원) 구간. 12억 이상은 수집 단계에서 제외되므로 ~12억까지.
const PRICE_FILTERS = [
  { value: "all", label: "전체 가격", min: 0, max: Infinity },
  { value: "p1", label: "~3억", min: 0, max: 30000 },
  { value: "p2", label: "3~6억", min: 30000, max: 60000 },
  { value: "p3", label: "6~9억", min: 60000, max: 90000 },
  { value: "p4", label: "9~12억", min: 90000, max: 120000 },
];

const PYEONG = 3.3058; // 1평 = 3.3058㎡

// 만원 단위 → "12억 3,400" 형태 한글 금액.
function formatManwon(manwon) {
  const v = Math.round(manwon);
  const eok = Math.floor(v / 10000);
  const rest = v % 10000;
  if (eok && rest) return `${eok}억 ${rest.toLocaleString()}`;
  if (eok) return `${eok}억`;
  return rest.toLocaleString();
}

// "2026-05-12" → "26.05.12"
function shortDate(ymd) {
  return ymd ? ymd.slice(2).replace(/-/g, ".") : "";
}

// 거래 배열 통계: 건수/평균/최근(날짜 최댓값).
function summarize(trades) {
  if (!trades.length) return null;
  const sum = trades.reduce((s, t) => s + t.dealAmount, 0);
  const recent = trades.reduce((a, b) => (a.dealYmd >= b.dealYmd ? a : b));
  return {
    count: trades.length,
    avg: sum / trades.length,
    recentAmount: recent.dealAmount,
    recentDate: recent.dealYmd,
  };
}

// 단지 거래를 전용면적(정수 ㎡)별로 묶어 평형별 가격 통계 반환.
function groupByPyeong(trades) {
  const m = new Map();
  for (const t of trades) {
    const key = Math.round(t.area);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(t);
  }
  return [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([m2, arr]) => {
      const s = summarize(arr);
      return {
        m2,
        pyeong: Math.round(m2 / PYEONG),
        count: s.count,
        avg: s.avg,
        min: Math.min(...arr.map((t) => t.dealAmount)),
        max: Math.max(...arr.map((t) => t.dealAmount)),
        recentAmount: s.recentAmount,
        recentDate: s.recentDate,
      };
    });
}

// 기준일(오늘)부터 과거로 N개월치 거래연월 옵션. value=YYYYMM, label="YYYY.MM".
function recentMonths(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    out.push({
      value: `${y}${String(m).padStart(2, "0")}`,
      label: `${y}.${String(m).padStart(2, "0")}`,
    });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default function KakaoMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);
  const dataRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("지도 로딩 중…");
  const [lawdCd, setLawdCd] = useState("11680");
  const [dealYmd, setDealYmd] = useState(() => recentMonths(1)[0].value);
  const [area, setArea] = useState("all");
  const [price, setPrice] = useState("all");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null); // 세부정보 패널 대상 단지

  const months = useMemo(() => recentMonths(13), []);
  const regionLabel = useMemo(() => regionName(lawdCd), [lawdCd]);

  // 세부정보 패널용 평형별 통계 (선택 단지의 전체 거래 기준).
  const detail = useMemo(() => {
    if (!selected) return null;
    const ts = selected.trades || [];
    return {
      overall: summarize(ts),
      buildYear: ts[0]?.buildYear,
      groups: groupByPyeong(ts),
    };
  }, [selected]);

  // 지도 초기화 (1회)
  useEffect(() => {
    const KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    const SCRIPT_ID = "kakao-map-sdk";

    function initMap() {
      window.kakao.maps.load(() => {
        const center = new window.kakao.maps.LatLng(37.5172, 127.0473);
        mapRef.current = new window.kakao.maps.Map(containerRef.current, {
          center,
          level: 6,
        });
        setReady(true);
      });
    }

    if (window.kakao && window.kakao.maps) {
      initMap();
      return;
    }
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", initMap);
      return () => existing.removeEventListener("load", initMap);
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&autoload=false`;
    script.addEventListener("load", initMap);
    document.head.appendChild(script);
    return () => script.removeEventListener("load", initMap);
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadTrades(lawdCd, dealYmd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lawdCd, dealYmd]);

  useEffect(() => {
    if (!ready || !dataRef.current) return;
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, price]);

  async function loadTrades(code, ymd) {
    setLoading(true);
    setSelected(null);
    setStatus(`${regionLabel} ${ymd.slice(0, 4)}.${ymd.slice(4)} 실거래가 불러오는 중…`);
    try {
      const res = await fetch(`/api/trades?lawdCd=${code}&dealYmd=${ymd}`);
      const data = await res.json();
      if (data.error) {
        setStatus(`오류: ${data.error}`);
        return;
      }
      dataRef.current = data;
      renderMarkers();
    } catch (e) {
      setStatus(`불러오기 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  // dataRef + 면적/가격 필터로 마커를 다시 그린다. 마커 클릭 → 세부정보 패널.
  function renderMarkers() {
    const data = dataRef.current;
    if (!data) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    const aBucket = AREA_FILTERS.find((a) => a.value === area) ?? AREA_FILTERS[0];
    const pBucket = PRICE_FILTERS.find((p) => p.value === price) ?? PRICE_FILTERS[0];

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const bounds = new kakao.maps.LatLngBounds();
    let shownComplexes = 0;
    let shownTrades = 0;

    data.complexes
      .filter((c) => c.lat != null)
      .forEach((c) => {
        const hits = (c.trades || []).filter(
          (t) =>
            t.dealAmount >= pBucket.min &&
            t.dealAmount < pBucket.max &&
            t.area >= aBucket.min &&
            t.area < aBucket.max
        );
        const stat = summarize(hits);
        if (!stat) return;

        const pos = new kakao.maps.LatLng(c.lat, c.lng);
        bounds.extend(pos);
        shownComplexes += 1;
        shownTrades += stat.count;

        const el = document.createElement("div");
        el.className = "trade-pin";
        el.innerHTML = `<b>평균 ${formatManwon(stat.avg)}</b><span>${c.aptNm}</span>`;

        const overlay = new kakao.maps.CustomOverlay({
          position: pos,
          content: el,
          yAnchor: 1.2,
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);

        el.addEventListener("click", () => setSelected(c));
      });

    if (shownComplexes) map.setBounds(bounds);

    const ymd = data.dealYmd;
    const tags = [
      area === "all" ? null : aBucket.label,
      price === "all" ? null : pBucket.label,
    ]
      .filter(Boolean)
      .join(" · ");
    const tagTxt = tags ? ` · ${tags}` : "";
    setStatus(
      shownComplexes
        ? `${regionLabel} ${ymd.slice(0, 4)}.${ymd.slice(4)}${tagTxt} · 거래 ${shownTrades}건 / 단지 ${shownComplexes}곳`
        : `${regionLabel} ${ymd.slice(0, 4)}.${ymd.slice(4)}${tagTxt} · 조건에 맞는 거래 없음`
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* 좌측 상단 컨트롤 패널 */}
      <div style={controlPanel}>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={lawdCd}
            onChange={(e) => setLawdCd(e.target.value)}
            disabled={loading}
            style={selectStyle}
          >
            {REGIONS.map((g) => (
              <optgroup key={g.sido} label={g.sido}>
                {g.items.map((it) => (
                  <option key={it.code} value={it.code}>
                    {it.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            value={dealYmd}
            onChange={(e) => setDealYmd(e.target.value)}
            disabled={loading}
            style={selectStyle}
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            disabled={loading}
            style={selectStyle}
          >
            {AREA_FILTERS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <select
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={loading}
            style={selectStyle}
          >
            {PRICE_FILTERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ fontWeight: 600, color: loading ? "#6b7280" : "#111827" }}>
          {status}
        </div>
      </div>

      {/* 우측 세부정보 패널 */}
      {selected && detail && (
        <div style={detailPanel}>
          <button onClick={() => setSelected(null)} style={closeBtn} aria-label="닫기">
            ×
          </button>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.aptNm}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {regionLabel} {selected.umdNm}
            {detail.buildYear ? ` · ${detail.buildYear}년 준공` : ""}
          </div>

          {detail.overall && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 10px",
                background: "#f3f4f6",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              이 달 거래 <b>{detail.overall.count}건</b>
              <br />
              평균 시세 <b>{formatManwon(detail.overall.avg)}</b>
              <br />
              최근 거래{" "}
              <b style={{ color: "#2563eb" }}>
                {formatManwon(detail.overall.recentAmount)}
              </b>{" "}
              <span style={{ color: "#9ca3af" }}>
                ({shortDate(detail.overall.recentDate)})
              </span>
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600 }}>
            평형별 가격
          </div>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginTop: 4 }}>
            <thead>
              <tr style={{ color: "#6b7280", textAlign: "right" }}>
                <th style={{ textAlign: "left", padding: "4px 0" }}>평형</th>
                <th>건</th>
                <th>평균</th>
                <th>최근</th>
              </tr>
            </thead>
            <tbody>
              {detail.groups.map((g) => (
                <tr key={g.m2} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ textAlign: "left", padding: "4px 0" }}>
                    {g.m2}㎡ <span style={{ color: "#9ca3af" }}>({g.pyeong}평)</span>
                  </td>
                  <td style={{ textAlign: "right" }}>{g.count}</td>
                  <td style={{ textAlign: "right" }}>{formatManwon(g.avg)}</td>
                  <td style={{ textAlign: "right", color: "#2563eb" }}>
                    {formatManwon(g.recentAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 6, fontSize: 11, color: "#9ca3af" }}>
            ㎡=전용면적 · 평형별 최저~최고는 향후 추가
          </div>
        </div>
      )}

      <style>{`
        .trade-pin {
          display: flex; flex-direction: column; align-items: center;
          background: #2563eb; color: #fff; padding: 4px 8px;
          border-radius: 14px; font-size: 11px; white-space: nowrap;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3); cursor: pointer;
          transform: translateX(-50%);
        }
        .trade-pin b { font-size: 12px; }
        .trade-pin span { font-size: 9px; opacity: 0.85; max-width: 90px;
          overflow: hidden; text-overflow: ellipsis; }
        .trade-pin:hover { background: #1d4ed8; }
      `}</style>
    </div>
  );
}

const controlPanel = {
  position: "absolute",
  top: 12,
  left: 12,
  zIndex: 10,
  background: "rgba(255,255,255,0.96)",
  padding: "10px 12px",
  borderRadius: 10,
  boxShadow: "0 1px 6px rgba(0,0,0,0.2)",
  fontSize: 13,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minWidth: 270,
};

const detailPanel = {
  position: "absolute",
  top: 12,
  right: 12,
  bottom: 12,
  zIndex: 10,
  width: 300,
  overflowY: "auto",
  background: "#fff",
  padding: "16px 18px",
  borderRadius: 12,
  boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
};

const closeBtn = {
  position: "absolute",
  top: 10,
  right: 12,
  border: "none",
  background: "none",
  fontSize: 22,
  lineHeight: 1,
  cursor: "pointer",
  color: "#9ca3af",
};

const selectStyle = {
  flex: 1,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 13,
  background: "#fff",
  cursor: "pointer",
};
