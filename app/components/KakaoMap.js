"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// 카카오맵 JS SDK를 동적으로 로드해 지도를 렌더링하고,
// /api/trades 에서 받은 실거래가 단지를 마커로 표시하는 클라이언트 컴포넌트.
// SDK는 카카오 디벨로퍼스에 등록한 사이트 도메인(http://localhost:3000)에서만 동작.

// 지역(LAWD_CD = 법정동 시군구 5자리, 행정표준코드) — 서울 25구 + 경기 시군구.
// ⚠️ 경기 코드는 행정표준코드 기준으로 넣었으나 검증 권장(특히 일반구 개편 지역).
const REGIONS = [
  {
    sido: "서울",
    items: [
      { code: "11110", name: "종로구" },
      { code: "11140", name: "중구" },
      { code: "11170", name: "용산구" },
      { code: "11200", name: "성동구" },
      { code: "11215", name: "광진구" },
      { code: "11230", name: "동대문구" },
      { code: "11260", name: "중랑구" },
      { code: "11290", name: "성북구" },
      { code: "11305", name: "강북구" },
      { code: "11320", name: "도봉구" },
      { code: "11350", name: "노원구" },
      { code: "11380", name: "은평구" },
      { code: "11410", name: "서대문구" },
      { code: "11440", name: "마포구" },
      { code: "11470", name: "양천구" },
      { code: "11500", name: "강서구" },
      { code: "11530", name: "구로구" },
      { code: "11545", name: "금천구" },
      { code: "11560", name: "영등포구" },
      { code: "11590", name: "동작구" },
      { code: "11620", name: "관악구" },
      { code: "11650", name: "서초구" },
      { code: "11680", name: "강남구" },
      { code: "11710", name: "송파구" },
      { code: "11740", name: "강동구" },
    ],
  },
  {
    sido: "경기",
    items: [
      { code: "41111", name: "수원시 장안구" },
      { code: "41113", name: "수원시 권선구" },
      { code: "41115", name: "수원시 팔달구" },
      { code: "41117", name: "수원시 영통구" },
      { code: "41131", name: "성남시 수정구" },
      { code: "41133", name: "성남시 중원구" },
      { code: "41135", name: "성남시 분당구" },
      { code: "41150", name: "의정부시" },
      { code: "41171", name: "안양시 만안구" },
      { code: "41173", name: "안양시 동안구" },
      { code: "41190", name: "부천시" },
      { code: "41210", name: "광명시" },
      { code: "41220", name: "평택시" },
      { code: "41250", name: "동두천시" },
      { code: "41271", name: "안산시 상록구" },
      { code: "41273", name: "안산시 단원구" },
      { code: "41281", name: "고양시 덕양구" },
      { code: "41285", name: "고양시 일산동구" },
      { code: "41287", name: "고양시 일산서구" },
      { code: "41290", name: "과천시" },
      { code: "41310", name: "구리시" },
      { code: "41360", name: "남양주시" },
      { code: "41370", name: "오산시" },
      { code: "41390", name: "시흥시" },
      { code: "41410", name: "군포시" },
      { code: "41430", name: "의왕시" },
      { code: "41450", name: "하남시" },
      { code: "41461", name: "용인시 처인구" },
      { code: "41463", name: "용인시 기흥구" },
      { code: "41465", name: "용인시 수지구" },
      { code: "41480", name: "파주시" },
      { code: "41500", name: "이천시" },
      { code: "41550", name: "안성시" },
      { code: "41570", name: "김포시" },
      { code: "41590", name: "화성시" },
      { code: "41610", name: "광주시" },
      { code: "41630", name: "양주시" },
      { code: "41650", name: "포천시" },
      { code: "41670", name: "여주시" },
      { code: "41800", name: "연천군" },
      { code: "41820", name: "가평군" },
      { code: "41830", name: "양평군" },
    ],
  },
];

const ALL_REGIONS = REGIONS.flatMap((g) => g.items);

// 전용면적(㎡) 구간. 거래 excluUseAr 기준 [min, max).
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

// 거래 배열 통계: 건수/평균/최근(날짜 최댓값) 거래.
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
  const dataRef = useRef(null); // 마지막 /api/trades 응답 (필터는 재요청 없이 재렌더)
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("지도 로딩 중…");
  const [lawdCd, setLawdCd] = useState("11680"); // 기본: 강남구
  const [dealYmd, setDealYmd] = useState(() => recentMonths(1)[0].value);
  const [area, setArea] = useState("all");
  const [price, setPrice] = useState("all");
  const [loading, setLoading] = useState(false);

  const months = useMemo(() => recentMonths(13), []);
  const regionName = useMemo(
    () => ALL_REGIONS.find((g) => g.code === lawdCd)?.name ?? lawdCd,
    [lawdCd]
  );

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

  // 지도 준비 또는 지역/연월 변경 시 실거래가 재로드.
  useEffect(() => {
    if (!ready) return;
    loadTrades(lawdCd, dealYmd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lawdCd, dealYmd]);

  // 면적/가격 필터만 바뀌면 재요청 없이 마커만 다시 그린다.
  useEffect(() => {
    if (!ready || !dataRef.current) return;
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, price]);

  async function loadTrades(code, ymd) {
    setLoading(true);
    setStatus(`${regionName} ${ymd.slice(0, 4)}.${ymd.slice(4)} 실거래가 불러오는 중…`);
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

  // dataRef + 면적/가격 필터로 마커를 다시 그린다.
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
        // 가격 구간으로 먼저 거른다 (면적별 표는 이 안에서 다시 면적으로 나눔).
        const priced = (c.trades || []).filter(
          (t) => t.dealAmount >= pBucket.min && t.dealAmount < pBucket.max
        );
        // 마커가 대표하는 거래 = 가격 + 선택 면적 구간.
        const hits = priced.filter(
          (t) => t.area >= aBucket.min && t.area < aBucket.max
        );
        const stat = summarize(hits);
        if (!stat) return; // 조건에 맞는 거래 없는 단지는 숨김

        const pos = new kakao.maps.LatLng(c.lat, c.lng);
        bounds.extend(pos);
        shownComplexes += 1;
        shownTrades += stat.count;

        // 마커: 평균 시세 + 단지명
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

        // 인포윈도우: 요약 + (면적 전체일 때) 평수별 평균/최근 표
        const iw = new kakao.maps.InfoWindow({
          content: buildInfo(c, priced, hits, stat, aBucket),
        });
        el.addEventListener("click", () => {
          iw.open(map, new kakao.maps.Marker({ position: pos, map }));
        });
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
        ? `${regionName} ${ymd.slice(0, 4)}.${ymd.slice(4)}${tagTxt} · 거래 ${shownTrades}건 / 단지 ${shownComplexes}곳`
        : `${regionName} ${ymd.slice(0, 4)}.${ymd.slice(4)}${tagTxt} · 조건에 맞는 거래 없음`
    );
  }

  // 인포윈도우 HTML. priced=가격구간 거래, hits=가격+면적 거래, stat=hits 요약.
  function buildInfo(c, priced, hits, stat, aBucket) {
    let rows = "";
    // 면적 전체 선택 시 평수별 평균/최근을 표로 보여준다.
    if (area === "all") {
      for (const b of AREA_FILTERS) {
        if (b.value === "all") continue;
        const part = priced.filter((t) => t.area >= b.min && t.area < b.max);
        const s = summarize(part);
        if (!s) continue;
        rows += `<tr>
          <td style="padding:2px 6px 2px 0">${b.label.split(" ")[0]}</td>
          <td style="padding:2px 6px;text-align:right">${s.count}건</td>
          <td style="padding:2px 6px;text-align:right">평균 ${formatManwon(s.avg)}</td>
          <td style="padding:2px 0 2px 6px;text-align:right;color:#2563eb">최근 ${formatManwon(s.recentAmount)}</td>
        </tr>`;
      }
    }
    const table = rows
      ? `<table style="margin-top:6px;border-top:1px solid #eee;padding-top:4px;font-size:11px;border-collapse:collapse">
          <tbody>${rows}</tbody></table>`
      : "";
    return `<div style="padding:9px 11px;font-size:12px;line-height:1.55;min-width:200px">
      <b>${c.aptNm}</b> <span style="color:#888">(${c.umdNm})</span><br/>
      거래 ${stat.count}건${area === "all" ? "" : ` · ${aBucket.label.split(" ")[0]}`}<br/>
      평균 시세 <b>${formatManwon(stat.avg)}</b><br/>
      최근 거래 <b style="color:#2563eb">${formatManwon(stat.recentAmount)}</b> <span style="color:#888">(${shortDate(stat.recentDate)})</span>
      ${table}
    </div>`;
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* 좌측 상단 컨트롤 패널 */}
      <div
        style={{
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
        }}
      >
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

const selectStyle = {
  flex: 1,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 13,
  background: "#fff",
  cursor: "pointer",
};
