"use client";

import { useEffect, useRef, useState } from "react";

// 카카오맵 JS SDK를 동적으로 로드해 지도를 렌더링하고,
// /api/trades 에서 받은 실거래가 단지를 마커로 표시하는 클라이언트 컴포넌트.
// SDK는 카카오 디벨로퍼스에 등록한 사이트 도메인(http://localhost:3000)에서만 동작.

// 만원 단위 → "12억 3,400" 형태 한글 금액.
function formatManwon(manwon) {
  const eok = Math.floor(manwon / 10000);
  const rest = manwon % 10000;
  if (eok && rest) return `${eok}억 ${rest.toLocaleString()}`;
  if (eok) return `${eok}억`;
  return rest.toLocaleString();
}

export default function KakaoMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);
  const [status, setStatus] = useState("지도 로딩 중…");

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
        loadTrades("11680", "202605"); // MVP: 강남구 / 2026-05
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

  // 실거래가 단지를 받아 마커(커스텀 오버레이)로 표시.
  async function loadTrades(lawdCd, dealYmd) {
    setStatus("실거래가 불러오는 중…");
    try {
      const res = await fetch(`/api/trades?lawdCd=${lawdCd}&dealYmd=${dealYmd}`);
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

      data.complexes
        .filter((c) => c.lat != null)
        .forEach((c) => {
          const pos = new kakao.maps.LatLng(c.lat, c.lng);

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

      setStatus(
        `강남구 ${dealYmd.slice(0, 4)}.${dealYmd.slice(4)} · 거래 ${data.total}건 / 단지 ${data.geocoded}곳`
      );
    } catch (e) {
      setStatus(`불러오기 실패: ${e.message}`);
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 10,
          background: "rgba(255,255,255,0.95)",
          padding: "8px 12px",
          borderRadius: 8,
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {status}
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
