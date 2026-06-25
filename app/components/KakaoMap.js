"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { REGIONS, ALL_REGIONS, regionName } from "../lib/regions";
import { calcMaxLoan, isRegulated } from "../lib/loanPolicy";

// 카카오맵 + 국토부 실거래가. 지도 이동 시 중심 지역을 자동 인식해 그 시군구 데이터를 로드하고,
// 단지 클릭(또는 지도 빈 곳 클릭→가까운 단지) 시 우측 패널에 평형별 시세·대출 분석을 보여준다.

const VALID_CODES = new Set(ALL_REGIONS.map((r) => r.code));
const DEFAULT_CODE = "41173"; // 안양시 동안구
const DEFAULT_CENTER = { lat: 37.3897, lng: 126.9536 }; // 안양 평촌 일대
const MONTHS = 3; // 지도 마커: 최근 3개월 병합
const NEAR_CLICK_M = 200; // 지도 빈 곳 클릭 시 이 거리(m) 안의 가장 가까운 단지 선택

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

// 대출 계산용 내 자금 프로필. 단위: 만원(보유자산/연소득/기존상환액), % (금리), 년(만기).
const PROFILE_KEY = "re_loan_profile";
const DEFAULT_PROFILE = {
  assets: "",        // 보유자산
  income: "",        // 연소득
  existingDebt: "",  // 기존 대출 연 원리금상환액
  householdType: "무주택", // 무주택 | 1주택 | 다주택
  isFirstTime: false,      // 생애최초 구입
  rate: "4",         // 실제 대출금리(%)
  termYears: "30",   // 만기(년)
};

// 색 팔레트 (인라인 스타일 공통).
const C = {
  text: "#0f172a", sub: "#64748b", muted: "#94a3b8",
  border: "#e2e8f0", divider: "#f1f5f9",
  blue: "#2563eb", blueSoft: "#eff6ff",
  green: "#059669", red: "#dc2626", amber: "#f59e0b",
};

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

// 갱신 시각(ISO) → "방금 / N분 전 / N시간 전 / N일 전".
function formatAgo(iso) {
  if (!iso) return null;
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "방금";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

function distMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
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

// Y축 가격 눈금용 축약 라벨. 5.2억 / 0.8억.
function eokLabel(manwon) {
  return (manwon / 10000).toFixed(1) + "억";
}

// 월별 시세 추세 라인차트(SVG) + 좌측 Y축 가격 눈금. series: [{ymd, avg, count}] 과거→현재.
function TrendChart({ series, areaLabel }) {
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
  const x = (i) => AX + (i * plotW) / (n - 1);
  const y = (v) => PADTOP + (1 - (v - min) / span) * plotH;
  const line = pts.map((p) => `${x(series.indexOf(p))},${y(p.avg)}`).join(" ");
  const first = pts[0];
  const last = pts[pts.length - 1];
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
        {pts.map((p) => (
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
        <span>{last.ymd.slice(2, 4)}.{last.ymd.slice(4)}</span>
      </div>
    </div>
  );
}

// LTV/DSR 계산식 도움말 모달.
function HelpModal({ onClose }) {
  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={closeBtn} aria-label="닫기">×</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, paddingRight: 20 }}>
          대출 한도는 이렇게 계산해요
        </div>

        <div style={helpBlock}>
          <div style={helpHead}>LTV · 담보인정비율</div>
          <div style={helpBody}>
            집값 대비 빌릴 수 있는 비율이에요.<br />
            • 규제지역 <b>40%</b> (생애최초 70%) · 비규제 <b>70%</b><br />
            • 집값 한도 상한: 15억↓ <b>6억</b> / 15~25억 <b>4억</b> / 25억↑ <b>2억</b><br />
            <span style={{ color: C.sub }}>LTV 한도 = min(집값 × 비율, 한도 상한)</span>
          </div>
        </div>

        <div style={helpBlock}>
          <div style={helpHead}>DSR · 총부채원리금상환비율</div>
          <div style={helpBody}>
            연소득 대비 1년 원리금 상환액이 <b>40%</b>를 넘지 않게 제한해요.<br />
            • 심사 땐 <b>스트레스 금리</b>(규제지역 +3.0%p)를 더해 더 깐깐하게 계산<br />
            <span style={{ color: C.sub }}>DSR 한도 ≈ (연소득 × 40% − 기존 상환액) ÷ 1만원당 연상환액</span>
          </div>
        </div>

        <div style={helpBlock}>
          <div style={helpHead}>최종 한도</div>
          <div style={helpBody}>
            <b>LTV·DSR 중 더 작은 값</b>이 실제 대출 가능액이에요.<br />
            필요 자기자금 = 집값 − 대출 가능액.
          </div>
        </div>

        <div style={{ fontSize: 11, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
          근거: 10.15 대책(2025-10-16 시행) + 스트레스 DSR 3단계. 실제 한도는 은행·신용·DTI 등에
          따라 달라질 수 있으며, 참고용 추정치예요.
        </div>
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
  const [lastUpdated, setLastUpdated] = useState(null); // 캐시 갱신 시각(ISO)
  const [selected, setSelected] = useState(null);
  const [trend, setTrend] = useState({ loading: false, series: null });
  const [trendArea, setTrendArea] = useState(null); // null=전체, 정수 m2=특정 평형
  const [info, setInfo] = useState({ loading: false, data: null }); // 세대수 등 부가정보
  const [favorites, setFavorites] = useState([]);
  const [showFavs, setShowFavs] = useState(false);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [showProfile, setShowProfile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [priceBasis, setPriceBasis] = useState("recent"); // recent | avg
  const [isMobile, setIsMobile] = useState(false); // 좁은 화면 → 패널을 시트/상단바로

  // 화면 폭 추적(모바일 레이아웃 전환). 폰에서 세부패널이 지도를 가리지 않도록.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

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

  // 대출 계산 입력 — 평형별로 가격만 바꿔 재사용.
  const incomeNum = Number(profile.income);
  const hasProfile = incomeNum > 0; // 연소득 없으면 DSR 계산 불가
  const assets = Number(profile.assets) || 0;
  const regulated = isRegulated(lawdCd);

  function loanForPrice(price) {
    if (!hasProfile || !price) return null;
    return calcMaxLoan({
      price,
      lawdCd,
      householdType: profile.householdType,
      isFirstTime: profile.isFirstTime,
      annualIncome: incomeNum,
      existingAnnualDebt: Number(profile.existingDebt) || 0,
      rate: (Number(profile.rate) || 0) / 100,
      termYears: Number(profile.termYears) || 30,
    });
  }

  // 지도 초기화 (1회) — services 라이브러리로 좌표→지역 변환 + 빈 곳 클릭→가까운 단지.
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

        // 지도 빈 곳 클릭 → 클릭 지점에서 가장 가까운 단지(NEAR_CLICK_M 이내) 선택.
        kakao.maps.event.addListener(map, "click", (e) => {
          const data = dataRef.current;
          if (!data) return;
          const lat = e.latLng.getLat();
          const lng = e.latLng.getLng();
          let best = null;
          let bestD = Infinity;
          for (const c of data.complexes) {
            if (c.lat == null) continue;
            const d = distMeters(lat, lng, c.lat, c.lng);
            if (d < bestD) {
              bestD = d;
              best = c;
            }
          }
          if (best && bestD <= NEAR_CLICK_M) setSelected(best);
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

  // 내 자금 프로필 복원(로컬 저장).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved) setProfile((p) => ({ ...p, ...JSON.parse(saved) }));
    } catch {
      /* 무시 */
    }
  }, []);

  function updateProfile(patch) {
    setProfile((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      } catch {
        /* 무시 */
      }
      return next;
    });
  }

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

  // 단지 바뀌면 추세 평형 선택 초기화.
  useEffect(() => {
    setTrendArea(null);
  }, [selected]);

  // 단지 선택(또는 평형 선택 변경) 시 월별 추세 로드. trendArea != null이면 그 평형만.
  useEffect(() => {
    if (!selected) {
      setTrend({ loading: false, series: null });
      return;
    }
    let alive = true;
    setTrend({ loading: true, series: null });
    const areaParam = trendArea != null ? `&area=${trendArea}` : "";
    fetch(
      `/api/trend?lawdCd=${lawdCd}&umdNm=${encodeURIComponent(selected.umdNm)}&aptNm=${encodeURIComponent(selected.aptNm)}&months=12${areaParam}`
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
  }, [selected, trendArea]);

  // 단지 선택 시 세대수 등 부가정보 로드(국토부 공동주택 API).
  useEffect(() => {
    if (!selected) {
      setInfo({ loading: false, data: null });
      return;
    }
    let alive = true;
    setInfo({ loading: true, data: null });
    fetch(
      `/api/complex-info?lawdCd=${lawdCd}&umdNm=${encodeURIComponent(selected.umdNm)}&aptNm=${encodeURIComponent(selected.aptNm)}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (alive) setInfo({ loading: false, data: d });
      })
      .catch(() => alive && setInfo({ loading: false, data: null }));
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

  async function loadTrades(code, { refresh = false } = {}) {
    setLoading(true);
    setSelected(null);
    setStatus(`${regionName(code)} 최근 ${MONTHS}개월 ${refresh ? "갱신" : "불러오는"} 중…`);
    try {
      const ymd = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}`;
      const res = await fetch(
        `/api/trades?lawdCd=${code}&dealYmd=${ymd}&months=${MONTHS}${refresh ? "&refresh=1" : ""}`
      );
      const data = await res.json();
      if (data.error) {
        setStatus(`오류: ${data.error}`);
        return;
      }
      dataRef.current = data;
      setLastUpdated(data.fetchedAt ?? null);
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

  // 모바일: 컨트롤은 상단 전체폭 바, 세부패널은 하단 시트(지도 상단부가 보이도록).
  const controlPanelStyle = isMobile
    ? { ...controlPanel, left: 8, right: 8, top: 8, width: "auto", padding: 11, gap: 8 }
    : controlPanel;
  const detailPanelStyle = isMobile
    ? {
        ...detailPanel,
        top: "auto", left: 0, right: 0, bottom: 0, width: "auto",
        maxHeight: "60vh", borderRadius: "16px 16px 0 0",
        padding: "16px 16px calc(18px + env(safe-area-inset-bottom))",
        boxShadow: "0 -6px 24px rgba(15,23,42,0.18)",
      }
    : detailPanel;

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* 좌측 상단 컨트롤 (모바일: 상단 전체폭 바) */}
      <div style={controlPanelStyle}>
        <div style={panelTitle}>🏠 실거래 · 대출 비교</div>

        <select
          value={lawdCd}
          onChange={(e) => selectRegion(e.target.value)}
          disabled={loading}
          style={selectStyle}
        >
          {REGIONS.map((g) => (
            <optgroup key={g.sido} label={g.sido}>
              {g.items.map((it) => (
                <option key={it.code} value={it.code}>{it.name}</option>
              ))}
            </optgroup>
          ))}
        </select>

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

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => { setShowFavs((v) => !v); setShowProfile(false); }}
            style={{ ...pillBtn, ...(showFavs ? pillBtnOn : null) }}
          >
            ★ 즐겨찾기 {favorites.length}
          </button>
          <button
            onClick={() => { setShowProfile((v) => !v); setShowFavs(false); }}
            style={{ ...pillBtn, ...(showProfile ? pillBtnOn : null) }}
          >
            💰 내 자금{hasProfile ? " ✓" : ""}
          </button>
        </div>

        <div style={statusText}>{status}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={hintLine}>
            {lastUpdated ? `🕒 갱신 ${formatAgo(lastUpdated)}` : "지도 이동 → 지역 전환"}
          </span>
          <button
            onClick={() => loadTrades(lawdCd, { refresh: true })}
            disabled={loading}
            style={refreshBtn}
            title="실거래가 새로 갱신"
          >
            🔄 갱신
          </button>
        </div>
        {!isMobile && (
          <div style={hintLine}>지도 이동 → 지역 전환 · 빈 곳 클릭 → 가까운 단지</div>
        )}

        {showProfile && (
          <div style={drawer}>
            <div style={drawerHead}>내 자금 설정 <span style={{ color: C.muted, fontWeight: 400 }}>(단위: 만원)</span></div>
            <label style={fieldRow}>
              <span style={fieldLabel}>보유자산</span>
              <input type="number" value={profile.assets} onChange={(e) => updateProfile({ assets: e.target.value })} placeholder="예: 50000" style={fieldInput} />
            </label>
            <label style={fieldRow}>
              <span style={fieldLabel}>연소득</span>
              <input type="number" value={profile.income} onChange={(e) => updateProfile({ income: e.target.value })} placeholder="예: 7000" style={fieldInput} />
            </label>
            <label style={fieldRow}>
              <span style={fieldLabel}>기존대출 연상환</span>
              <input type="number" value={profile.existingDebt} onChange={(e) => updateProfile({ existingDebt: e.target.value })} placeholder="0" style={fieldInput} />
            </label>
            <label style={fieldRow}>
              <span style={fieldLabel}>가구유형</span>
              <select value={profile.householdType} onChange={(e) => updateProfile({ householdType: e.target.value })} style={fieldInput}>
                <option value="무주택">무주택</option>
                <option value="1주택">1주택</option>
                <option value="다주택">다주택</option>
              </select>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ ...fieldRow, flex: 1 }}>
                <span style={fieldLabel}>금리%</span>
                <input type="number" step="0.1" value={profile.rate} onChange={(e) => updateProfile({ rate: e.target.value })} style={{ ...fieldInput, width: 64 }} />
              </label>
              <label style={{ ...fieldRow, flex: 1 }}>
                <span style={fieldLabel}>만기년</span>
                <input type="number" value={profile.termYears} onChange={(e) => updateProfile({ termYears: e.target.value })} style={{ ...fieldInput, width: 64 }} />
              </label>
            </div>
            <label style={{ ...fieldRow, cursor: "pointer" }}>
              <span style={fieldLabel}>생애최초 구입</span>
              <input type="checkbox" checked={profile.isFirstTime} onChange={(e) => updateProfile({ isFirstTime: e.target.checked })} />
            </label>
            <div style={hintLine}>단지를 클릭하면 평형별 대출 가능액이 계산됩니다</div>
          </div>
        )}

        {showFavs && (
          <div style={{ ...drawer, maxHeight: 220, overflowY: "auto" }}>
            {favorites.length === 0 ? (
              <div style={hintText}>즐겨찾기가 없습니다</div>
            ) : (
              favorites.map((f) => (
                <div key={f.id} onClick={() => gotoFavorite(f)} style={favRow}>
                  <span style={{ color: C.amber }}>★</span> {f.apt_nm}
                  <span style={{ color: C.muted }}> · {regionName(f.lawd_cd)} {f.umd_nm}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 우측 세부정보 패널 (모바일: 하단 시트) */}
      {selected && detail && (
        <div style={detailPanelStyle}>
          <button onClick={() => setSelected(null)} style={closeBtn} aria-label="닫기">×</button>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingRight: 24 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text, lineHeight: 1.25 }}>{selected.aptNm}</div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
                {regionLabel} {selected.umdNm}
                {detail.buildYear ? ` · ${detail.buildYear}년 준공` : ""}
                {info.data?.households ? ` · ${info.data.households.toLocaleString()}세대` : ""}
                {info.data?.dongCnt ? ` · ${info.data.dongCnt}개동` : ""}
              </div>
              <a
                href={`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(`${regionLabel} ${selected.aptNm}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={newsLink}
              >
                📰 관련 뉴스 검색
              </a>
            </div>
            <button onClick={toggleFavorite} style={starBtn} title="즐겨찾기">
              {isSelectedFav ? "★" : "☆"}
            </button>
          </div>

          {detail.overall && (
            <div style={summaryCard}>
              <div style={summaryItem}>
                <span style={summaryLabel}>최근 {MONTHS}개월</span>
                <span style={summaryVal}>{detail.overall.count}건</span>
              </div>
              <div style={summaryDiv} />
              <div style={summaryItem}>
                <span style={summaryLabel}>평균 시세</span>
                <span style={summaryVal}>{formatManwon(detail.overall.avg)}</span>
              </div>
              <div style={summaryDiv} />
              <div style={summaryItem}>
                <span style={summaryLabel}>최근 거래</span>
                <span style={{ ...summaryVal, color: C.blue }}>{formatManwon(detail.overall.recentAmount)}</span>
                <span style={{ fontSize: 10, color: C.muted }}>{shortDate(detail.overall.recentDate)}</span>
              </div>
            </div>
          )}

          <div style={sectionLabel}>시세 추세 <span style={{ color: C.muted, fontWeight: 400 }}>· 최근 12개월</span></div>
          <div style={chipRow}>
            <button onClick={() => setTrendArea(null)} style={{ ...chip, ...(trendArea == null ? chipOn : null) }}>
              전체
            </button>
            {detail.groups.map((g) => (
              <button
                key={g.m2}
                onClick={() => setTrendArea(g.m2)}
                style={{ ...chip, ...(trendArea === g.m2 ? chipOn : null) }}
              >
                {g.pyeong}평
              </button>
            ))}
          </div>
          {trend.loading ? (
            <div style={hintText}>불러오는 중…</div>
          ) : trend.series ? (
            <TrendChart series={trend.series} areaLabel={trendArea != null ? `${trendArea}㎡` : null} />
          ) : null}

          {/* 평형별 시세 · 대출 */}
          <div style={{ ...sectionLabel, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              평형별 시세·대출
              <span style={regulated ? regBadge : nonRegBadge}>{regulated ? "규제지역" : "비규제"}</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={basisToggle}>
                {[["recent", "최근"], ["avg", "평균"]].map(([v, l]) => (
                  <button key={v} onClick={() => setPriceBasis(v)} style={{ ...basisBtn, ...(priceBasis === v ? basisBtnOn : null) }}>
                    {l}
                  </button>
                ))}
              </span>
              <button onClick={() => setShowHelp(true)} style={helpBtn} title="LTV·DSR 계산 설명">?</button>
            </span>
          </div>

          {!hasProfile && (
            <div style={noticeBox}>
              <button onClick={() => { setShowProfile(true); setShowFavs(false); }} style={linkBtn}>💰 내 자금 설정</button>
              {" "}하면 평형별 대출 가능액이 함께 표시됩니다.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {detail.groups.map((g) => {
              const gp = priceBasis === "recent" ? g.recentAmount : g.avg;
              const ln = loanForPrice(gp);
              const gap = ln ? assets - ln.requiredCash : null;
              return (
                <div key={g.m2} style={pyeongCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>
                      {g.m2}㎡ <span style={{ color: C.sub, fontWeight: 500 }}>· {g.pyeong}평</span>
                    </span>
                    <span style={{ fontSize: 11, color: C.muted }}>{g.count}건</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
                    평균 <b style={{ color: C.text }}>{formatManwon(g.avg)}</b>
                    {" · "}최근 <b style={{ color: C.blue }}>{formatManwon(g.recentAmount)}</b>
                  </div>

                  {ln && (
                    ln.maxLoan <= 0 ? (
                      <div style={{ ...loanRow, color: C.red, fontWeight: 600, fontSize: 12 }}>
                        {regulated && profile.householdType === "다주택"
                          ? "규제 다주택 — 대출 불가"
                          : "대출 불가 (DSR 한도 초과)"}
                      </div>
                    ) : (
                      <div style={loanRow}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.sub }}>
                          <span>
                            대출 <b style={{ color: C.text }}>{formatManwon(ln.maxLoan)}</b>
                            <span style={bindingTag}>{ln.binding}</span>
                          </span>
                          <span>필요자금 <b style={{ color: C.text }}>{formatManwon(ln.requiredCash)}</b></span>
                        </div>
                        {assets > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, color: gap >= 0 ? C.green : C.red }}>
                            {gap >= 0
                              ? `✓ 매수 가능 · 여유 ${formatManwon(gap)}`
                              : `✗ 자금 부족 ${formatManwon(-gap)}`}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      <style>{`
        .trade-pin {
          display: flex; flex-direction: column; align-items: center;
          background: #2563eb; color: #fff; padding: 4px 9px;
          border-radius: 13px; font-size: 11px; white-space: nowrap;
          box-shadow: 0 2px 6px rgba(15,23,42,0.25); cursor: pointer;
          transform: translateX(-50%); transition: background 0.12s;
        }
        .trade-pin--fav { background: #f59e0b; }
        .trade-pin--fav:hover { background: #d97706; }
        .trade-pin b { font-size: 12px; font-weight: 700; }
        .trade-pin span { font-size: 9px; opacity: 0.85; max-width: 92px;
          overflow: hidden; text-overflow: ellipsis; }
        .trade-pin:hover { background: #1d4ed8; }
      `}</style>
    </div>
  );
}

const PANEL_SHADOW = "0 6px 24px rgba(15,23,42,0.14)";

const controlPanel = {
  position: "absolute", top: 14, left: 14, zIndex: 10,
  background: "rgba(255,255,255,0.98)", padding: 14,
  borderRadius: 14, boxShadow: PANEL_SHADOW, border: `1px solid ${C.border}`,
  fontSize: 13, display: "flex", flexDirection: "column", gap: 9, width: 300,
};
const panelTitle = { fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" };
const detailPanel = {
  position: "absolute", top: 14, right: 14, bottom: 14, zIndex: 10, width: 320,
  overflowY: "auto", background: "#fff", padding: "18px 20px",
  borderRadius: 16, boxShadow: PANEL_SHADOW, border: `1px solid ${C.border}`,
};
const selectStyle = {
  flex: 1, width: "100%", padding: "8px 10px", borderRadius: 8,
  border: `1px solid ${C.border}`, fontSize: 13, background: "#fff",
  color: C.text, cursor: "pointer",
};
const pillBtn = {
  flex: 1, padding: "8px 6px", borderRadius: 8,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.sub, fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const pillBtnOn = { background: C.blueSoft, borderColor: "#bfdbfe", color: C.blue };
const statusText = { fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.4 };
const refreshBtn = {
  flex: "0 0 auto", padding: "3px 8px", borderRadius: 7, border: `1px solid ${C.border}`,
  background: "#fff", color: C.sub, fontSize: 11, fontWeight: 600, cursor: "pointer",
};
const hintLine = { fontSize: 11, color: C.muted };
const hintText = { fontSize: 12, color: C.muted, padding: "8px 0" };

const drawer = {
  marginTop: 2, borderTop: `1px solid ${C.divider}`, paddingTop: 10,
  display: "flex", flexDirection: "column", gap: 7, fontSize: 12,
};
const drawerHead = { fontSize: 12, fontWeight: 700, color: C.text };
const fieldRow = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
const fieldLabel = { color: C.sub, fontSize: 12 };
const fieldInput = {
  width: 116, padding: "6px 8px", borderRadius: 7, border: `1px solid ${C.border}`,
  fontSize: 12, background: "#fff", color: C.text,
};
const favRow = {
  fontSize: 12, color: C.text, padding: "6px 2px", cursor: "pointer",
  borderBottom: `1px solid ${C.divider}`, whiteSpace: "nowrap",
  overflow: "hidden", textOverflow: "ellipsis",
};

const closeBtn = {
  position: "absolute", top: 12, right: 14, border: "none", background: "none",
  fontSize: 22, lineHeight: 1, cursor: "pointer", color: C.muted, zIndex: 1,
};
const starBtn = {
  border: "none", background: "none", fontSize: 22, lineHeight: 1,
  cursor: "pointer", color: C.amber, padding: 0,
};

const summaryCard = {
  marginTop: 14, padding: "12px 8px", background: C.divider,
  borderRadius: 10, display: "flex", alignItems: "stretch",
};
const summaryItem = {
  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, textAlign: "center",
};
const summaryDiv = { width: 1, background: C.border, margin: "2px 0" };
const summaryLabel = { fontSize: 10, color: C.muted };
const summaryVal = { fontSize: 14, fontWeight: 700, color: C.text };

const sectionLabel = { marginTop: 18, fontSize: 12, fontWeight: 700, color: C.text };
const newsLink = {
  display: "inline-block", marginTop: 7, fontSize: 12, fontWeight: 600,
  color: C.blue, textDecoration: "none",
};
const chipRow = { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 };
const chip = {
  padding: "3px 9px", borderRadius: 12,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.sub, fontSize: 11, fontWeight: 600, cursor: "pointer",
};
const chipOn = { background: C.blue, color: "#fff", borderColor: C.blue };

const noticeBox = {
  marginTop: 8, padding: "10px 12px", background: C.blueSoft,
  border: `1px solid #dbeafe`, borderRadius: 10, fontSize: 12, color: C.sub, lineHeight: 1.5,
};
const pyeongCard = {
  padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 10, background: "#fff",
};
const loanRow = { marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}` };

const basisToggle = {
  display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 7, overflow: "hidden",
};
const basisBtn = {
  border: "none", background: "#fff", color: C.sub, fontSize: 11,
  padding: "3px 9px", cursor: "pointer", fontWeight: 600,
};
const basisBtnOn = { background: C.blue, color: "#fff" };
const helpBtn = {
  width: 22, height: 22, borderRadius: "50%", border: `1px solid ${C.border}`,
  background: "#fff", color: C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer",
  lineHeight: 1, padding: 0,
};
const bindingTag = {
  marginLeft: 5, fontSize: 9, color: C.sub, background: "#e2e8f0",
  borderRadius: 4, padding: "1px 5px", verticalAlign: "middle", fontWeight: 600,
};
const regBadge = {
  fontSize: 10, color: "#b91c1c", background: "#fee2e2", borderRadius: 5, padding: "2px 7px", fontWeight: 600,
};
const nonRegBadge = {
  fontSize: 10, color: "#15803d", background: "#dcfce7", borderRadius: 5, padding: "2px 7px", fontWeight: 600,
};
const linkBtn = {
  border: "none", background: "none", color: C.blue, fontWeight: 700,
  cursor: "pointer", padding: 0, fontSize: 12,
};

const modalOverlay = {
  position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};
const modalCard = {
  position: "relative", width: "100%", maxWidth: 380, maxHeight: "85vh", overflowY: "auto",
  background: "#fff", borderRadius: 16, padding: "20px 22px", boxShadow: "0 12px 40px rgba(15,23,42,0.3)",
};
const helpBlock = { marginTop: 14 };
const helpHead = { fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 4 };
const helpBody = { fontSize: 12.5, color: C.text, lineHeight: 1.7 };
