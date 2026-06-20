"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// 카카오맵 JS SDK를 동적으로 로드해 지도를 렌더링하고,
// /api/trades 에서 받은 실거래가 단지를 마커로 표시하는 클라이언트 컴포넌트.
// SDK는 카카오 디벨로퍼스에 등록한 사이트 도메인(http://localhost:3000)에서만 동작.

// 서울 25개 자치구 — LAWD_CD(법정동 시군구 5자리, 행정표준코드).
// 국토부 실거래가 API의 LAWD_CD 파라미터에 그대로 사용한다.
const SEOUL_GU = [
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
];

// 만원 단위 → "12억 3,400" 형태 한글 금액.
function formatManwon(manwon) {
  const eok = Math.floor(manwon / 10000);
  const rest = manwon % 10000;
  if (eok && rest) return `${eok}억 ${rest.toLocaleString()}`;
  if (eok) return `${eok}억`;
  return rest.toLocaleString();
}

// 기준일(오늘)부터 과거로 N개월치 거래연월 옵션 생성. value=YYYYMM, label="YYYY.MM".
function recentMonths(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1; // 1~12
    const ym = `${y}${String(m).padStart(2, "0")}`;
    out.push({ value: ym, label: `${y}.${String(m).padStart(2, "0")}` });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default function KakaoMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);
  const [ready, setReady] = useState(false); // 지도 SDK 준비됨
  const [status, setStatus] = useState("지도 로딩 중…");
  const [lawdCd, setLawdCd] = useState("11680"); // 기본: 강남구
  const [dealYmd, setDealYmd] = useState(() => recentMonths(1)[0].value); // 기본: 이번 달
  const [loading, setLoading] = useState(false);

  const months = useMemo(() => recentMonths(13), []);
  const guName = useMemo(
    () => SEOUL_GU.find((g) => g.code === lawdCd)?.name ?? lawdCd,
    [lawdCd]
  );

  // 지도 초기화 (1회)
  useEffect(() => {
    const KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    const SCRIPT_ID = "kakao-map-sdk";

    function initMap() {
      window.kakao.maps.load(() => {
        const center = new window.kakao.maps.LatLng(37.5172, 127.0473); // 강남구 일대
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

  // 지도 준비 완료 또는 지역/연월 변경 시 실거래가 다시 로드.
  useEffect(() => {
    if (!ready) return;
    loadTrades(lawdCd, dealYmd, guName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lawdCd, dealYmd]);

  // 실거래가 단지를 받아 마커(커스텀 오버레이)로 표시.
  async function loadTrades(code, ymd, name) {
    setLoading(true);
    setStatus(`${name} ${ymd.slice(0, 4)}.${ymd.slice(4)} 실거래가 불러오는 중…`);
    try {
      const res = await fetch(`/api/trades?lawdCd=${code}&dealYmd=${ymd}`);
      const data = await res.json();
      if (data.error) {
        setStatus(`오류: ${data.error}`);
        return;
      }

      const kakao = window.kakao;
      const map = mapRef.current;

      // 기존 오버레이 제거
      overlaysRef.current.forEach((o) => o.setMap(null));
      overlaysRef.current = [];

      const geocoded = data.complexes.filter((c) => c.lat != null);
      const bounds = new kakao.maps.LatLngBounds();

      geocoded.forEach((c) => {
        const pos = new kakao.maps.LatLng(c.lat, c.lng);
        bounds.extend(pos);

        // 가격표 형태 커스텀 오버레이 (최고가 기준)
        const el = document.createElement("div");
        el.className = "trade-pin";
        el.innerHTML = `<b>${formatManwon(c.maxAmount)}</b><span>${c.aptNm}</span>`;

        const overlay = new kakao.maps.CustomOverlay({
          position: pos,
          content: el,
          yAnchor: 1.2,
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);

        // 클릭 시 거래 요약 인포윈도우
        const iw = new kakao.maps.InfoWindow({
          content: `<div style="padding:8px 10px;font-size:12px;line-height:1.6;min-width:160px">
            <b>${c.aptNm}</b> (${c.umdNm})<br/>
            거래 ${c.count}건<br/>
            최고 ${formatManwon(c.maxAmount)} · 최저 ${formatManwon(c.minAmount)}
          </div>`,
        });
        el.addEventListener("click", () => {
          iw.open(map, new kakao.maps.Marker({ position: pos, map }));
        });
      });

      // 로드된 단지들에 맞춰 지도 영역 자동 이동
      if (geocoded.length) map.setBounds(bounds);

      setStatus(
        `${name} ${ymd.slice(0, 4)}.${ymd.slice(4)} · 거래 ${data.total}건 / 단지 ${data.geocoded}곳`
      );
    } catch (e) {
      setStatus(`불러오기 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* 좌측 상단 컨트롤 패널: 지역 + 거래연월 선택 */}
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
          minWidth: 240,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={lawdCd}
            onChange={(e) => setLawdCd(e.target.value)}
            disabled={loading}
            style={selectStyle}
          >
            {SEOUL_GU.map((g) => (
              <option key={g.code} value={g.code}>
                {g.name}
              </option>
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
