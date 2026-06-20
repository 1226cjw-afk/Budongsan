"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { REGIONS, ALL_REGIONS, regionName } from "../lib/regions";

// 카카오맵 + 국토부 실거래가. 지도 이동 시 중심 지역을 자동 인식해 그 시군구 데이터를 로드하고,
// 단지 클릭 시 우측 패널에 평형별 가격 + 월별 시세 추세 그래프 + 즐겨찾기를 보여준다.

const VALID_CODES = new Set(ALL_REGIONS.map((r) => r.code));
const DEFAULT_CODE = "41173"; // 안양시 동안구
const DEFAULT_CENTER = { lat: 37.3897, lng: 126.9536 }; // 안양 평촌 일대
const MONTHS = 3; // 지도 마커: 최근 3개월 병합

const AREA_FILTERS = [
  { value: "all", label: "전체 면적", min: 0, max: Infinity },
  { value: "s", label: "~60㎡ (~18평)", min: 0, max: 60 },
  { value: "m", label: "60~85㎡ (18~26평)", min: 60, max: 85 },
  { value: "l", label: "85~135㎡ (26~41평)", min: 85, max: 135 },
  { value: "xl", label: "135㎡~ (41평~)", min: 135, max: Infinity },
];

const PRICE_FILTERS = [
  { value: "all", label: "전체 가격", min: 0, max: Infinity },
  { value: "p1", label: "~3억", min: 0, max: 30000 },
  { value: "p2", label: "3~6억", min: 30000, max: 60000 },
  { value: "p3", label: "6~9억", min: 60000, max: 90000 },
  { value: "p4", label: "9~12억", min: 90000, max: 120000 },
];

const PYEONG = 3.3058;

function formatManwon(manwon) {
  const v = Math.round(manwon);
  const eok = Math.floor(v / 10000);
  const rest = v % 10000;
  if (eok && rest) return `${eok}억 ${rest.toLocaleString()}`;
  if (eok) return `${eok}억`;
  return rest.toLocaleString();
}

function shortDate(ymd) {
  return ymd ? ymd.slice(2).replace(/-/g, ".") : "";
}

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
        recentAmount: s.recentAmount,
        recentDate: s.recentDate,
      };
    });
}

const favKey = (lawdCd, umdNm, aptNm) => `${lawdCd}|${umdNm}|${aptNm}`;

// 월별 시세 추세 라인차트(SVG). series: [{ymd, avg, count}] 과거→현재.
function TrendChart({ series }) {
  const pts = series.filter((s) => s.avg != null);
  if (pts.length < 2) {
    return (
      <div style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0" }}>
        추세를 그릴 거래가 부족합니다.
      </div>
    );
  }
  const W = 264;
  const H = 96;
  const PAD = 6;
  const vals = pts.map((p) => p.avg);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const n = series.length;
  const x = (i) => PAD + (i * (W - 2 * PAD)) / (n - 1);
  const y = (v) => H - PAD - ((v - min) / span) * (H - 2 * PAD);
  const line = pts
    .map((p) => `${x(series.indexOf(p))},${y(p.avg)}`)
    .join(" ");
  const first = pts[0];
  const last = pts[pts.length - 1];
  const up = last.avg >= first.avg;
  return (
    <div>
      <svg width={W} height={H} style={{ display: "block" }}>
        <polyline
          points={line}
          fill="none"
          stroke={up ? "#dc2626" : "#2563eb"}
          strokeWidth="2"
        />
        {pts.map((p) => (
          <circle
            key={p.ymd}
            cx={x(series.indexOf(p))}
            cy={y(p.avg)}
            r="2.5"
            fill={up ? "#dc2626" : "#2563eb"}
          />
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9ca3af" }}>
        <span>{first.ymd.slice(2, 4)}.{first.ymd.slice(4)}</span>
        <span>최고 {formatManwon(max)} · 최저 {formatManwon(min)}</span>
        <span>{last.ymd.slice(2, 4)}.{last.ymd.slice(4)}</span>
      </div>
    </div>
  );
}

export default function KakaoMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const geocoderRef = useRef(null);
  const overlaysRef = useRef([]);
  const dataRef = useRef(null);
  const lawdCdRef = useRef(DEFAULT_CODE); // idle 핸들러가 최신 지역 코드 참조
  const fitRef = useRef(true); // 다음 렌더에서 지도 영역 자동 맞춤 여부
  const favSetRef = useRef(new Set());

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("지도 로딩 중…");
  const [lawdCd, setLawdCd] = useState(DEFAULT_CODE);
  const [area, setArea] = useState("all");
  const [price, setPrice] = useState("all");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [trend, setTrend] = useState({ loading: false, series: null });
  const [favorites, setFavorites] = useState([]);
  const [showFavs, setShowFavs] = useState(false);

  const regionLabel = useMemo(() => regionName(lawdCd), [lawdCd]);
  const favSet = useMemo(
    () => new Set(favorites.map((f) => favKey(f.lawd_cd, f.umd_nm, f.apt_nm))),
    [favorites]
  );
  useEffect(() => {
    favSetRef.current = favSet;
  }, [favSet]);
  useEffect(() => {
    lawdCdRef.current = lawdCd;
  }, [lawdCd]);

  const detail = useMemo(() => {
    if (!selected) return null;
    const ts = selected.trades || [];
    return { overall: summarize(ts), buildYear: ts[0]?.buildYear, groups: groupByPyeong(ts) };
  }, [selected]);

  const isSelectedFav = selected
    ? favSet.has(favKey(lawdCd, selected.umdNm, selected.aptNm))
    : false;

  // 지도 초기화 (1회) — services 라이브러리로 좌표→지역 변환.
  useEffect(() => {
    const KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    const SCRIPT_ID = "kakao-map-sdk";

    function initMap() {
      window.kakao.maps.load(() => {
        const kakao = window.kakao;
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          level: 5,
        });
        mapRef.current = map;
        geocoderRef.current = new kakao.maps.services.Geocoder();

        // 지도 이동이 멈추면 중심 좌표의 시군구를 인식해 그 지역으로 전환.
        kakao.maps.event.addListener(map, "idle", () => {
          const c = map.getCenter();
          geocoderRef.current.coord2RegionCode(c.getLng(), c.getLat(), (res, st) => {
            if (st !== kakao.maps.services.Status.OK) return;
            const r = res.find((x) => x.region_type === "B") || res[0];
            const code = r.code.slice(0, 5);
            if (VALID_CODES.has(code) && code !== lawdCdRef.current) {
              fitRef.current = false; // 팬으로 인한 전환 → 자동 맞춤 안 함
              setLawdCd(code);
            }
          });
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
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&autoload=false&libraries=services`;
    script.addEventListener("load", initMap);
    document.head.appendChild(script);
    return () => script.removeEventListener("load", initMap);
  }, []);

  useEffect(() => {
    loadFavorites();
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadTrades(lawdCd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lawdCd]);

  useEffect(() => {
    if (!ready || !dataRef.current) return;
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, price, favorites]);

  // 단지 선택 시 월별 추세 로드.
  useEffect(() => {
    if (!selected) {
      setTrend({ loading: false, series: null });
      return;
    }
    let alive = true;
    setTrend({ loading: true, series: null });
    fetch(
      `/api/trend?lawdCd=${lawdCd}&umdNm=${encodeURIComponent(selected.umdNm)}&aptNm=${encodeURIComponent(selected.aptNm)}&months=12`
    )
      .then((r) => r.json())
      .then((d) => {
        if (alive) setTrend({ loading: false, series: d.series || [] });
      })
      .catch(() => alive && setTrend({ loading: false, series: [] }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function loadFavorites() {
    try {
      const d = await fetch("/api/favorites").then((r) => r.json());
      if (d.favorites) setFavorites(d.favorites);
    } catch {
      /* 무시 */
    }
  }

  async function toggleFavorite() {
    if (!selected) return;
    const fav = isSelectedFav;
    const body = {
      lawdCd,
      umdNm: selected.umdNm,
      aptNm: selected.aptNm,
      lat: selected.lat,
      lng: selected.lng,
    };
    if (fav) {
      await fetch(
        `/api/favorites?lawdCd=${lawdCd}&umdNm=${encodeURIComponent(selected.umdNm)}&aptNm=${encodeURIComponent(selected.aptNm)}`,
        { method: "DELETE" }
      );
    } else {
      await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    loadFavorites();
  }

  async function loadTrades(code) {
    setLoading(true);
    setSelected(null);
    setStatus(`${regionName(code)} 최근 ${MONTHS}개월 불러오는 중…`);
    try {
      const ymd = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}`;
      const res = await fetch(`/api/trades?lawdCd=${code}&dealYmd=${ymd}&months=${MONTHS}`);
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

  function renderMarkers() {
    const data = dataRef.current;
    if (!data) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    const aB = AREA_FILTERS.find((a) => a.value === area) ?? AREA_FILTERS[0];
    const pB = PRICE_FILTERS.find((p) => p.value === price) ?? PRICE_FILTERS[0];
    const favs = favSetRef.current;

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
            t.dealAmount >= pB.min &&
            t.dealAmount < pB.max &&
            t.area >= aB.min &&
            t.area < aB.max
        );
        const stat = summarize(hits);
        if (!stat) return;

        const pos = new kakao.maps.LatLng(c.lat, c.lng);
        bounds.extend(pos);
        shownComplexes += 1;
        shownTrades += stat.count;

        const isFav = favs.has(favKey(data.lawdCd, c.umdNm, c.aptNm));
        const el = document.createElement("div");
        el.className = "trade-pin" + (isFav ? " trade-pin--fav" : "");
        el.innerHTML = `<b>${isFav ? "★ " : ""}평균 ${formatManwon(stat.avg)}</b><span>${c.aptNm}</span>`;

        const overlay = new kakao.maps.CustomOverlay({ position: pos, content: el, yAnchor: 1.2 });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
        el.addEventListener("click", () => setSelected(c));
      });

    if (fitRef.current && shownComplexes) {
      map.setBounds(bounds);
      fitRef.current = false;
    }

    const tags = [area === "all" ? null : aB.label, price === "all" ? null : pB.label]
      .filter(Boolean)
      .join(" · ");
    setStatus(
      shownComplexes
        ? `${regionName(data.lawdCd)} · 최근 ${MONTHS}개월${tags ? " · " + tags : ""} · 거래 ${shownTrades}건 / 단지 ${shownComplexes}곳`
        : `${regionName(data.lawdCd)} · 최근 ${MONTHS}개월${tags ? " · " + tags : ""} · 조건에 맞는 거래 없음`
    );
  }

  function selectRegion(code) {
    fitRef.current = true;
    setLawdCd(code);
  }

  function gotoFavorite(f) {
    setShowFavs(false);
    fitRef.current = true;
    if (f.lat != null && mapRef.current) {
      mapRef.current.panTo(new window.kakao.maps.LatLng(f.lat, f.lng));
    }
    setLawdCd(f.lawd_cd);
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* 좌측 상단 컨트롤 */}
      <div style={controlPanel}>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={lawdCd}
            onChange={(e) => selectRegion(e.target.value)}
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
          <button
            onClick={() => setShowFavs((v) => !v)}
            style={{ ...selectStyle, flex: "0 0 auto", fontWeight: 600 }}
          >
            ★ {favorites.length}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={area} onChange={(e) => setArea(e.target.value)} disabled={loading} style={selectStyle}>
            {AREA_FILTERS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          <select value={price} onChange={(e) => setPrice(e.target.value)} disabled={loading} style={selectStyle}>
            {PRICE_FILTERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div style={{ fontWeight: 600, color: loading ? "#6b7280" : "#111827" }}>{status}</div>
        <div style={{ fontSize: 11, color: "#9ca3af" }}>지도를 움직이면 해당 지역으로 전환됩니다</div>

        {showFavs && (
          <div style={{ marginTop: 4, borderTop: "1px solid #eee", paddingTop: 6, maxHeight: 200, overflowY: "auto" }}>
            {favorites.length === 0 ? (
              <div style={{ fontSize: 12, color: "#9ca3af" }}>즐겨찾기가 없습니다</div>
            ) : (
              favorites.map((f) => (
                <div
                  key={f.id}
                  onClick={() => gotoFavorite(f)}
                  style={{ fontSize: 12, padding: "4px 2px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
                >
                  ★ {f.apt_nm} <span style={{ color: "#9ca3af" }}>({regionName(f.lawd_cd)} {f.umd_nm})</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 우측 세부정보 패널 */}
      {selected && detail && (
        <div style={detailPanel}>
          <button onClick={() => setSelected(null)} style={closeBtn} aria-label="닫기">×</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.aptNm}</div>
            <button onClick={toggleFavorite} style={starBtn} title="즐겨찾기">
              {isSelectedFav ? "★" : "☆"}
            </button>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {regionLabel} {selected.umdNm}
            {detail.buildYear ? ` · ${detail.buildYear}년 준공` : ""}
          </div>

          {detail.overall && (
            <div style={summaryBox}>
              최근 {MONTHS}개월 거래 <b>{detail.overall.count}건</b><br />
              평균 시세 <b>{formatManwon(detail.overall.avg)}</b><br />
              최근 거래 <b style={{ color: "#2563eb" }}>{formatManwon(detail.overall.recentAmount)}</b>{" "}
              <span style={{ color: "#9ca3af" }}>({shortDate(detail.overall.recentDate)})</span>
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600 }}>월별 시세 추세 (최근 12개월)</div>
          {trend.loading ? (
            <div style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0" }}>불러오는 중…</div>
          ) : trend.series ? (
            <TrendChart series={trend.series} />
          ) : null}

          <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600 }}>평형별 가격</div>
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
                  <td style={{ textAlign: "right", color: "#2563eb" }}>{formatManwon(g.recentAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
        .trade-pin--fav { background: #f59e0b; }
        .trade-pin--fav:hover { background: #d97706; }
        .trade-pin b { font-size: 12px; }
        .trade-pin span { font-size: 9px; opacity: 0.85; max-width: 90px;
          overflow: hidden; text-overflow: ellipsis; }
        .trade-pin:hover { background: #1d4ed8; }
      `}</style>
    </div>
  );
}

const controlPanel = {
  position: "absolute", top: 12, left: 12, zIndex: 10,
  background: "rgba(255,255,255,0.96)", padding: "10px 12px",
  borderRadius: 10, boxShadow: "0 1px 6px rgba(0,0,0,0.2)",
  fontSize: 13, display: "flex", flexDirection: "column", gap: 8, width: 280,
};
const detailPanel = {
  position: "absolute", top: 12, right: 12, bottom: 12, zIndex: 10, width: 300,
  overflowY: "auto", background: "#fff", padding: "16px 18px",
  borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
};
const summaryBox = {
  marginTop: 10, padding: "8px 10px", background: "#f3f4f6",
  borderRadius: 8, fontSize: 13,
};
const closeBtn = {
  position: "absolute", top: 10, right: 12, border: "none", background: "none",
  fontSize: 22, lineHeight: 1, cursor: "pointer", color: "#9ca3af",
};
const starBtn = {
  border: "none", background: "none", fontSize: 20, lineHeight: 1,
  cursor: "pointer", color: "#f59e0b", padding: 0,
};
const selectStyle = {
  flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db",
  fontSize: 13, background: "#fff", cursor: "pointer",
};
