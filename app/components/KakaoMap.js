"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { REGIONS, ALL_REGIONS, regionName } from "../lib/regions";
import { calcMaxLoan, isRegulated } from "../lib/loanPolicy";
import { C } from "../lib/palette";
import { daysUntil, leaseLabel, formatManwon, shortDate, formatAgo } from "../lib/format";
import { favKey, distMeters, summarize, groupByPyeong, filterTrades } from "../lib/tradeStats";
import { naverLandUrl } from "../lib/naverLand";
import TrendChart from "./TrendChart";
import HelpModal from "./HelpModal";
import {
  controlPanel, panelTitle, newsTabLink, detailPanel, selectStyle, pillBtn, pillBtnOn,
  statusText, refreshBtn, hintLine, hintText, legendRow, legendItem, legendDot,
  drawer, drawerHead, fieldRow, fieldLabel, fieldInput,
  favRow, favEditBtn, favDdayLine, favEditBox, favSaveBtn,
  sortBar, sortSelect, onlyBuyLabel, listScroll, rowTop, rowName, rowPrice, rowSub, rowBadges,
  hotBadge, upBadge, downBadge, rebuildBadge, gapOkBadge, gapNoBadge, excessBadge, excessHotBadge,
  mobileListSheet, closeBtn, starBtn, sectionLabel, newsLink, naverLandLink,
  ownedBtn, ownedBtnOn, ownedBox, ownedClearBtn, noticeBox, pyeongCard, pyeongCardOn, loanRow,
  basisToggle, basisBtn, basisBtnOn, helpBtn, bindingTag, regBadge, nonRegBadge, linkBtn,
} from "./mapStyles";

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

// 리스트 패널: 배지·정렬 기준.
const HOT_PCT = 15; // 1년 상승률 이 값 이상이면 🔥 급등 배지(핀에도 표시)
const EXCESS_HOT_PCT = 10; // 지역 중앙값 대비 초과상승 이 값(%p) 이상이면 선반영 경고 톤
const REBUILD_AGE = 30; // 준공 후 이 연수 이상이면 🏗 재건축 연한 배지 (실제 추진현황 API는 없음 → 연한 기준)
const LIST_INFO_TOP = 30; // 세대수 lazy 조회 대상: 정렬 상위 N개 행
const SORT_OPTIONS = [
  { v: "yoy", label: "🔥 1년 상승률순" },
  { v: "count", label: "거래 많은순" },
  { v: "priceAsc", label: "가격 낮은순" },
  { v: "priceDesc", label: "가격 높은순" },
  { v: "old", label: "🏗 준공 오래된순" },
];
const SORT_GAP = { v: "gap", label: "✓ 자금 여유순" }; // 내 자금 설정 시에만 노출

// 대출 계산용 내 자금 프로필. 단위: 만원(보유자산/연소득/기존상환액), % (금리), 년(만기).
const PROFILE_KEY = "re_loan_profile";
const DEFAULT_PROFILE = {
  assets: "",        // 보유자산(여유 현금)
  income: "",        // 연소득
  existingDebt: "",  // 기존 대출 연 원리금상환액
  householdType: "무주택", // 무주택 | 1주택 | 다주택
  isFirstTime: false,      // 생애최초 구입
  rate: "4",         // 실제 대출금리(%)
  termYears: "40",   // 만기(년) — 주담대 최장 기본(은행/네이버 기본값)
  // 갈아타기(보유 주택 매도) — owned는 세부패널 평형 카드의 "보유" 토글로 지정.
  // 지정 시점의 기준가 스냅샷을 저장(재지정하면 최신가로 갱신). 실수령 = 기준가 − 대출잔액 − 보증금.
  owned: null,          // { lawdCd, umdNm, aptNm, area, priceRecent, priceAvg, capturedYmd }
  ownedLoanBalance: "", // 매도 시 상환할 대출 잔액(만원)
  ownedDeposit: "",     // 매도 시 반환할 임차 보증금 정산액(만원)
  ownedAcquiredYmd: "", // 취득일(잔금일) — 비과세(보유 2년) D-day 계산용
};

export default function KakaoMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const geocoderRef = useRef(null);
  const overlaysRef = useRef([]);
  const dataRef = useRef(null);
  const lawdCdRef = useRef(DEFAULT_CODE); // idle 핸들러가 최신 지역 코드 참조
  const fitRef = useRef(true); // 다음 렌더에서 지도 영역 자동 맞춤 여부
  const favSetRef = useRef(new Set());
  const favoritesRef = useRef([]); // 타지역 즐겨찾기 마커용 — 좌표 포함 전체 목록

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
  const [trendMonths, setTrendMonths] = useState(12); // 추세 기간: 12(1년) | 36(3년)
  const [info, setInfo] = useState({ loading: false, data: null }); // 세대수 등 부가정보
  const [favorites, setFavorites] = useState([]);
  const [showFavs, setShowFavs] = useState(false);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [showProfile, setShowProfile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [priceBasis, setPriceBasis] = useState("recent"); // recent | avg
  const [isMobile, setIsMobile] = useState(false); // 좁은 화면 → 패널을 시트/상단바로

  // 단지 리스트 패널 (네이버식) — tradesData는 dataRef와 같은 내용의 반응형 사본(리스트 파생용).
  const [tradesData, setTradesData] = useState(null);
  const [rank, setRank] = useState(new Map()); // `${umd}|${apt}` → {yoyPct, recentN, pastN}
  const [sortBy, setSortBy] = useState("yoy");
  const [onlyBuyable, setOnlyBuyable] = useState(false); // 구매가능 단지만 (자금 설정 시)
  const [showList, setShowList] = useState(false); // 모바일 목록 시트 (데스크톱은 항상 표시)
  const [householdMap, setHouseholdMap] = useState(new Map()); // favKey → 세대수|null (lazy)
  const infoInflightRef = useRef(new Set()); // 세대수 조회 중복 방지

  // 화면 폭 추적(모바일 레이아웃 전환). 폰에서 세부패널이 지도를 가리지 않도록.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const regionLabel = useMemo(() => regionName(lawdCd), [lawdCd]);
  const [favEdit, setFavEdit] = useState(null); // 즐겨찾기 D-day 인라인 편집 {id, leaseEnd, note, noteDate}
  const [favDdayErr, setFavDdayErr] = useState("");
  const favSet = useMemo(
    () => new Set(favorites.map((f) => favKey(f.lawd_cd, f.umd_nm, f.apt_nm))),
    [favorites]
  );
  useEffect(() => {
    favSetRef.current = favSet;
    favoritesRef.current = favorites;
  }, [favSet, favorites]);
  useEffect(() => {
    lawdCdRef.current = lawdCd;
  }, [lawdCd]);

  const detail = useMemo(() => {
    if (!selected) return null;
    const ts = selected.trades || [];
    return { overall: summarize(ts), buildYear: ts[0]?.buildYear, groups: groupByPyeong(ts) };
  }, [selected]);

  // 지역 1년 상승률 중앙값 — 선반영 게이지 기준선(단지 상승률 − 중앙값 = 지역 대비 초과상승 %p).
  const rankMedian = useMemo(() => {
    const vals = [...rank.values()].map((r) => r.yoyPct).filter((v) => v != null).sort((a, b) => a - b);
    return vals.length >= 5 ? vals[Math.floor(vals.length / 2)] : null; // 표본 적으면 비표시
  }, [rank]);

  const isSelectedFav = selected
    ? favSet.has(favKey(lawdCd, selected.umdNm, selected.aptNm))
    : false;

  // 대출 계산 입력 — 평형별로 가격만 바꿔 재사용.
  const incomeNum = Number(profile.income);
  const hasProfile = incomeNum > 0; // 연소득 없으면 DSR 계산 불가
  // 갈아타기: 보유 주택 지정 시 예상 매도 실수령(기준가 − 대출잔액 − 보증금)을 자기자금에 합산.
  // assets가 구매가능 색칠·자금 여유 정렬·평형 카드 비교 전부의 기준이라 여기 한 곳만 바꾸면 전파됨.
  const owned = profile.owned;
  const ownedSalePrice = owned
    ? (priceBasis === "recent" ? owned.priceRecent : owned.priceAvg) || owned.priceRecent || owned.priceAvg || 0
    : 0;
  const ownedNet = owned
    ? Math.max(0, ownedSalePrice - (Number(profile.ownedLoanBalance) || 0) - (Number(profile.ownedDeposit) || 0))
    : 0;
  const assets = (Number(profile.assets) || 0) + ownedNet;
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
      termYears: Number(profile.termYears) || 40,
    });
  }

  // 한 단지에서 대출 가능한 평형 중 최대 자금 여유(보유자산 − 필요자금, 만원). 전 평형 대출 불가면 null.
  // priceBasis(최근/평균) 기준가 사용. 마커 색칠(여유 ≥ 0 = 초록)과 리스트 여유 배지·정렬이 이 계산을 공유.
  function bestGap(hits) {
    let gap = null;
    for (const g of groupByPyeong(hits)) {
      const gp = priceBasis === "recent" ? g.recentAmount : g.avg;
      const ln = loanForPrice(gp);
      if (ln && ln.maxLoan > 0) {
        const d = assets - ln.requiredCash;
        if (gap == null || d > gap) gap = d;
      }
    }
    return gap;
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

  // 갈아타기: 세부패널 평형 카드에서 보유 주택 지정/해제. 같은 평형 재클릭 = 해제,
  // 이미 보유 지정된 상태에서 다시 지정 = 최신 기준가로 스냅샷 갱신.
  function isOwnedPyeong(g) {
    const o = profile.owned;
    return !!(o && selected && o.lawdCd === lawdCd && o.umdNm === selected.umdNm &&
      o.aptNm === selected.aptNm && o.area === g.m2);
  }
  function toggleOwned(g) {
    if (isOwnedPyeong(g)) return updateProfile({ owned: null });
    updateProfile({
      owned: {
        lawdCd,
        umdNm: selected.umdNm,
        aptNm: selected.aptNm,
        area: g.m2,
        priceRecent: g.recentAmount || 0,
        priceAvg: Math.round(g.avg) || 0,
        capturedYmd: new Date().toISOString().slice(0, 10),
      },
      // 보유 주택이 생기면 가구유형도 1주택으로 보정(처분조건부 — LTV 규칙은 무주택과 동일).
      ...(profile.householdType === "무주택" ? { householdType: "1주택" } : {}),
    });
  }

  useEffect(() => {
    if (!ready) return;
    loadTrades(lawdCd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lawdCd]);

  // 지역 전체 1년 상승률(/api/rank) — 리스트 정렬·🔥 배지용. 지도와 병렬로 비동기 로드.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setRank(new Map());
    fetch(`/api/rank?lawdCd=${lawdCd}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d.items) return;
        setRank(new Map(d.items.map((i) => [`${i.umdNm}|${i.aptNm}`, i])));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, lawdCd]);

  useEffect(() => {
    if (!ready || !dataRef.current) return;
    // 지역 전환 중(새 데이터 로딩 전) stale 렌더 방지 — 옛 지역으로 setBounds가 실행되면
    // fitRef가 소진돼 새 지역으로 지도가 안 움직이고, idle 핸들러가 지역을 되돌린다.
    if (dataRef.current.lawdCd !== lawdCd) return;
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, price, favorites, profile, priceBasis, rank]);

  // 단지 바뀌면 추세를 '가장 거래 많은 평형'으로 초기화. 추세는 평형별만 본다
  // (전체는 평형이 섞여 시세가 들쭉날쭉 → 추세 의미가 흐려짐).
  useEffect(() => {
    const groups = detail?.groups;
    setTrendArea(groups?.length ? groups.reduce((a, b) => (b.count > a.count ? b : a)).m2 : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      `/api/trend?lawdCd=${lawdCd}&umdNm=${encodeURIComponent(selected.umdNm)}&aptNm=${encodeURIComponent(selected.aptNm)}&months=${trendMonths}${areaParam}`
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
  }, [selected, trendArea, trendMonths]);

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

  // 즐겨찾기 D-day(임대차 만기·이벤트 메모) 저장. 0004 마이그레이션 미적용이면 서버가 409로 안내.
  async function saveFavDday() {
    if (!favEdit) return;
    setFavDdayErr("");
    const r = await fetch("/api/favorites", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: favEdit.id,
        leaseEnd: favEdit.leaseEnd,
        note: favEdit.note,
        noteDate: favEdit.noteDate,
      }),
    })
      .then((x) => x.json())
      .catch(() => ({ error: "저장 실패" }));
    if (r.error) return setFavDdayErr(r.error);
    setFavEdit(null);
    loadFavorites();
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
      setTradesData(data); // 리스트 패널 파생용 반응형 사본
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

    // 자금(보유자산)이 설정된 경우에만 구매가능 여부로 마커를 색칠한다.
    const affordMode = hasProfile && assets > 0;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    const bounds = new kakao.maps.LatLngBounds();
    let shownComplexes = 0;
    let shownTrades = 0;
    let buyableCount = 0;

    data.complexes
      .filter((c) => c.lat != null)
      .forEach((c) => {
        const hits = filterTrades(c.trades, aB, pB);
        const stat = summarize(hits);
        if (!stat) return;

        const pos = new kakao.maps.LatLng(c.lat, c.lng);
        bounds.extend(pos);
        shownComplexes += 1;
        shownTrades += stat.count;

        // 구매가능: 어떤 평형이든 보유자산으로 필요자금을 댈 수 있으면(최대 여유 ≥ 0) true.
        let buyable = null;
        if (affordMode) {
          const gap = bestGap(hits);
          buyable = gap != null && gap >= 0;
        }
        if (buyable) buyableCount += 1;

        const isFav = favs.has(favKey(data.lawdCd, c.umdNm, c.aptNm));
        const yoy = rank.get(`${c.umdNm}|${c.aptNm}`)?.yoyPct;
        const hot = yoy != null && yoy >= HOT_PCT; // 1년 급등 단지는 핀에도 🔥
        const el = document.createElement("div");
        let cls = "trade-pin";
        if (buyable === true) cls += " trade-pin--ok";
        else if (buyable === false) cls += " trade-pin--no";
        else if (isFav) cls += " trade-pin--fav"; // 색칠모드 아닐 때만 금색
        el.className = cls;
        el.innerHTML = `<b>${isFav ? "★ " : ""}${hot ? "🔥 " : ""}평균 ${formatManwon(stat.avg)}</b><span>${c.aptNm}</span>`;

        const overlay = new kakao.maps.CustomOverlay({ position: pos, content: el, yAnchor: 1.2 });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
        el.addEventListener("click", () => setSelected(c));
      });

    // 타지역 즐겨찾기: 현재 지역 밖의 즐겨찾기도 ★ 핀으로 함께 표시한다.
    // 그 지역 거래는 안 불러왔으므로 가격이 없음 → 지역명만 보여주고, 클릭하면 그 지역으로 이동.
    // (현재 지역 즐겨찾기는 위 단지 루프에서 이미 금색 가격 핀으로 그림 → 중복 제외.)
    favoritesRef.current.forEach((f) => {
      if (f.lat == null || f.lawd_cd === data.lawdCd) return;
      const pos = new kakao.maps.LatLng(f.lat, f.lng);
      const el = document.createElement("div");
      el.className = "trade-pin trade-pin--fav trade-pin--away";
      el.innerHTML = `<b>★ ${regionName(f.lawd_cd)}</b><span>${f.apt_nm}</span>`;
      const overlay = new kakao.maps.CustomOverlay({ position: pos, content: el, yAnchor: 1.2 });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
      el.addEventListener("click", () => gotoFavorite(f));
    });

    if (fitRef.current && shownComplexes) {
      map.setBounds(bounds);
      fitRef.current = false;
    }

    const tags = [area === "all" ? null : aB.label, price === "all" ? null : pB.label]
      .filter(Boolean)
      .join(" · ");
    const buyTag = affordMode && shownComplexes ? ` · 🟢 구매가능 ${buyableCount}/${shownComplexes}곳` : "";
    setStatus(
      shownComplexes
        ? `${regionName(data.lawdCd)} · 최근 ${MONTHS}개월${tags ? " · " + tags : ""} · 거래 ${shownTrades}건 / 단지 ${shownComplexes}곳${buyTag}`
        : `${regionName(data.lawdCd)} · 최근 ${MONTHS}개월${tags ? " · " + tags : ""} · 조건에 맞는 거래 없음`
    );
  }

  // 리스트 행 데이터 파생: 필터 적용 → 배지(상승률/재건축연한/자금여유) 계산 → 정렬.
  // affordMode에서 gap = 평형 중 가장 여유가 큰 값(대출가능 평형 기준), null = 전 평형 대출 불가.
  const affordMode = hasProfile && assets > 0;
  const listRows = useMemo(() => {
    if (!tradesData) return null;
    const aB = AREA_FILTERS.find((a) => a.value === area) ?? AREA_FILTERS[0];
    const pB = PRICE_FILTERS.find((p) => p.value === price) ?? PRICE_FILTERS[0];
    const thisYear = new Date().getFullYear();
    const rows = [];
    for (const c of tradesData.complexes) {
      const hits = filterTrades(c.trades, aB, pB);
      const stat = summarize(hits);
      if (!stat) continue;
      const gap = affordMode ? bestGap(hits) : null; // 마커 색칠과 같은 계산(bestGap) 공유
      const key = favKey(tradesData.lawdCd, c.umdNm, c.aptNm);
      const buildYear = Number(hits[0]?.buildYear) || null;
      rows.push({
        c,
        key,
        price: priceBasis === "recent" ? stat.recentAmount : stat.avg,
        count: stat.count,
        yoy: rank.get(`${c.umdNm}|${c.aptNm}`)?.yoyPct ?? null,
        buildYear,
        rebuild: buildYear != null && thisYear - buildYear >= REBUILD_AGE,
        gap,
        noLoan: affordMode && gap == null, // 다주택 규제 등으로 전 평형 대출 불가
        buyable: gap != null && gap >= 0,
        isFav: favSet.has(key),
        households: householdMap.get(key) ?? null,
      });
    }
    const filtered = affordMode && onlyBuyable ? rows.filter((r) => r.buyable) : rows;
    const cmp = {
      yoy: (a, b) => (b.yoy ?? -Infinity) - (a.yoy ?? -Infinity),
      count: (a, b) => b.count - a.count,
      priceAsc: (a, b) => a.price - b.price,
      priceDesc: (a, b) => b.price - a.price,
      old: (a, b) => (a.buildYear ?? 9999) - (b.buildYear ?? 9999),
      gap: (a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity),
    }[sortBy];
    return cmp ? filtered.sort(cmp) : filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradesData, area, price, priceBasis, rank, profile, sortBy, onlyBuyable, favSet, householdMap]);

  // 리스트 상위 N개 행의 세대수 lazy 조회(/api/complex-info POST 일괄 — 서버가 kapt_cache 조회).
  useEffect(() => {
    if (!listRows) return;
    const targets = listRows
      .slice(0, LIST_INFO_TOP)
      .filter((r) => !householdMap.has(r.key) && !infoInflightRef.current.has(r.key));
    if (!targets.length) return;
    targets.forEach((r) => infoInflightRef.current.add(r.key));
    let alive = true;
    (async () => {
      const res = await fetch("/api/complex-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lawdCd,
          items: targets.map((r) => ({ umdNm: r.c.umdNm, aptNm: r.c.aptNm })),
        }),
      })
        .then((x) => x.json())
        .catch(() => null);
      if (!alive) return;
      const infos = res?.infos || [];
      setHouseholdMap((prev) => {
        const m = new Map(prev);
        targets.forEach((r, j) => m.set(r.key, infos[j]?.households ?? null));
        return m;
      });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRows, lawdCd]);

  // 리스트 행 클릭 → 단지 선택 + 지도 이동(자동맞춤 없이 그 위치로).
  function selectComplex(c) {
    setSelected(c);
    if (isMobile) setShowList(false);
    if (c.lat != null && mapRef.current) {
      fitRef.current = false;
      mapRef.current.panTo(new window.kakao.maps.LatLng(c.lat, c.lng));
    }
  }

  function selectRegion(code) {
    fitRef.current = true;
    setLawdCd(code);
  }

  function gotoFavorite(f) {
    setShowFavs(false);
    // panTo(애니메이션)+fitRef(데이터 도착 후 setBounds)를 같이 걸면 경합 —
    // 캐시가 빠르면 setBounds 위로 panTo가 마저 진행돼 단지들이 화면 가장자리로 밀린다.
    // 좌표가 있으면 즉시 setCenter로 착지하고 자동맞춤은 끈다(레벨 5 = 초기 지도 배율).
    if (f.lat != null && mapRef.current) {
      fitRef.current = false;
      mapRef.current.setLevel(5);
      mapRef.current.setCenter(new window.kakao.maps.LatLng(f.lat, f.lng));
    } else {
      fitRef.current = true; // 좌표 없는 옛 즐겨찾기 → 지역 전체 맞춤 폴백
    }
    setLawdCd(f.lawd_cd);
  }

  // 내 자금이 꺼지면 자금 기반 정렬·필터도 초기화.
  useEffect(() => {
    if (!affordMode) {
      if (sortBy === "gap") setSortBy("yoy");
      if (onlyBuyable) setOnlyBuyable(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affordMode]);

  const sortOptions = affordMode ? [...SORT_OPTIONS, SORT_GAP] : SORT_OPTIONS;

  // 단지 리스트 (정렬 바 + 행 목록) — 데스크톱은 좌측 패널 하단, 모바일은 목록 시트에 공용.
  const listContent = (
    <>
      <div style={sortBar}>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={sortSelect}>
          {sortOptions.map((o) => (
            <option key={o.v} value={o.v}>{o.label}</option>
          ))}
        </select>
        {affordMode && (
          <label style={onlyBuyLabel}>
            <input
              type="checkbox"
              checked={onlyBuyable}
              onChange={(e) => setOnlyBuyable(e.target.checked)}
              style={{ margin: 0 }}
            />
            구매가능만
          </label>
        )}
        <span style={{ fontSize: 11, color: C.muted, marginLeft: "auto", whiteSpace: "nowrap" }}>
          {listRows ? `${listRows.length}곳` : ""}
        </span>
      </div>
      <div style={listScroll}>
        {!listRows ? (
          <div style={hintText}>불러오는 중…</div>
        ) : listRows.length === 0 ? (
          <div style={hintText}>조건에 맞는 단지가 없습니다</div>
        ) : (
          listRows.map((r, i) => {
            const isOn = selected && selected.umdNm === r.c.umdNm && selected.aptNm === r.c.aptNm;
            return (
              <div
                key={r.key}
                className={`cx-row${isOn ? " cx-row--on" : ""}`}
                onClick={() => selectComplex(r.c)}
                style={{ animationDelay: `${Math.min(i, 15) * 20}ms` }}
              >
                <div style={rowTop}>
                  <span style={rowName}>
                    {r.isFav && <span style={{ color: C.amber }}>★ </span>}
                    {r.c.aptNm}
                  </span>
                  <span style={rowPrice}>{formatManwon(r.price)}</span>
                </div>
                <div style={rowSub}>
                  {r.c.umdNm}
                  {r.buildYear ? ` · '${String(r.buildYear).slice(2)}년` : ""}
                  {r.households ? ` · ${r.households.toLocaleString()}세대` : ""}
                  {` · ${r.count}건`}
                </div>
                <div style={rowBadges}>
                  {r.yoy != null && (
                    <span style={r.yoy >= HOT_PCT ? hotBadge : r.yoy >= 0 ? upBadge : downBadge}>
                      {r.yoy >= HOT_PCT ? "🔥 " : ""}1년 {r.yoy >= 0 ? "+" : ""}{r.yoy}%
                    </span>
                  )}
                  {r.rebuild && <span style={rebuildBadge}>🏗 재건축연한</span>}
                  {r.noLoan ? (
                    <span style={gapNoBadge}>대출 불가</span>
                  ) : r.gap != null ? (
                    r.gap >= 0 ? (
                      <span style={gapOkBadge}>✓ 여유 {formatManwon(r.gap)}</span>
                    ) : (
                      <span style={gapNoBadge}>부족 {formatManwon(-r.gap)}</span>
                    )
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );

  // 모바일: 컨트롤은 상단 전체폭 바, 세부패널은 하단 시트(지도 상단부가 보이도록).
  // 데스크톱: 좌측 패널이 컨트롤+단지 리스트(네이버식)로 전체 높이.
  const controlPanelStyle = isMobile
    ? { ...controlPanel, left: 8, right: 8, top: 8, width: "auto", padding: 11, gap: 8 }
    : { ...controlPanel, bottom: 14, width: 340, overflow: "hidden" };
  const detailPanelStyle = isMobile
    ? {
        ...detailPanel,
        top: "auto", left: 0, right: 0, bottom: 0, width: "auto",
        maxHeight: "60vh", borderRadius: "20px 20px 0 0",
        padding: "16px 16px calc(18px + env(safe-area-inset-bottom))",
        boxShadow: "0 -1px 2px rgba(15,23,42,0.04), 0 -8px 32px rgba(15,23,42,0.16)",
      }
    : detailPanel;

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* 좌측 상단 컨트롤 (모바일: 상단 전체폭 바) */}
      <div style={controlPanelStyle}>
        <div style={{ ...panelTitle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>🏠 실거래 · 대출 비교</span>
          <a href="/news" style={newsTabLink}>📰 뉴스</a>
        </div>

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
          <select value={area} onChange={(e) => setArea(e.target.value)} disabled={loading} style={{ ...selectStyle, flex: 1 }}>
            {AREA_FILTERS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          <select value={price} onChange={(e) => setPrice(e.target.value)} disabled={loading} style={{ ...selectStyle, flex: 1 }}>
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
          {isMobile && (
            <button
              onClick={() => { setShowList(true); setShowFavs(false); setShowProfile(false); }}
              style={pillBtn}
            >
              📋 목록
            </button>
          )}
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
        {hasProfile && assets > 0 && (
          <div style={legendRow}>
            <span style={legendItem}><span style={{ ...legendDot, background: C.green }} />구매가능</span>
            <span style={legendItem}><span style={{ ...legendDot, background: C.red }} />자금부족</span>
            <span style={{ color: C.muted }}>· {priceBasis === "recent" ? "최근가" : "평균가"} 기준</span>
          </div>
        )}
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
            <div style={ownedBox}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>🔁 갈아타기 — 보유 주택 매도</div>
              {owned ? (
                <>
                  <div style={{ fontSize: 12, color: C.sub, margin: "4px 0 2px" }}>
                    🏠 {regionName(owned.lawdCd)} {owned.umdNm} {owned.aptNm} {owned.area}㎡
                    <button onClick={() => updateProfile({ owned: null })} style={ownedClearBtn}>해제</button>
                  </div>
                  <label style={fieldRow}>
                    <span style={fieldLabel}>대출 잔액</span>
                    <input type="number" value={profile.ownedLoanBalance} onChange={(e) => updateProfile({ ownedLoanBalance: e.target.value })} placeholder="0" style={fieldInput} />
                  </label>
                  <label style={fieldRow}>
                    <span style={fieldLabel}>보증금 반환</span>
                    <input type="number" value={profile.ownedDeposit} onChange={(e) => updateProfile({ ownedDeposit: e.target.value })} placeholder="0" style={fieldInput} />
                  </label>
                  <label style={fieldRow}>
                    <span style={fieldLabel}>취득일(잔금)</span>
                    <input type="date" value={profile.ownedAcquiredYmd} onChange={(e) => updateProfile({ ownedAcquiredYmd: e.target.value })} style={fieldInput} />
                  </label>
                  {profile.ownedAcquiredYmd && (() => {
                    // 1주택 양도세 비과세: 보유 2년 + 12억 이하(소득세법 §89①3, 고가 기준 12억은 2021-12-08~).
                    // 양도일 = 잔금일(둘 중 빠른 등기일). 취득 당시 조정대상지역이면 거주 2년 요건 추가.
                    // 단기양도 중과: 보유 1년 미만 70% / 1~2년 60% (2021-06-01 이후 양도분, 확인일 2026-07-05).
                    const free = new Date(profile.ownedAcquiredYmd);
                    free.setFullYear(free.getFullYear() + 2);
                    const dd = Math.ceil((free - Date.now()) / 86400000);
                    const freeYmd = free.toISOString().slice(0, 10);
                    return (
                      <div style={{ fontSize: 11, marginTop: 3, lineHeight: 1.5, fontWeight: 600, color: dd > 0 ? "#b45309" : C.green }}>
                        {dd > 0
                          ? `⏳ 비과세(보유 2년) ${freeYmd}부터 · D-${dd} — 그 전 양도(잔금)는 단기중과 60~70%`
                          : "✓ 보유 2년 충족 — 12억 이하 비과세 가능(잔금일 기준 · 취득 시 조정지역이었다면 거주요건 별도, 세무사 확인)"}
                      </div>
                    );
                  })()}
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 4, lineHeight: 1.5 }}>
                    매도가 <b style={{ color: C.text }}>{formatManwon(ownedSalePrice)}</b>
                    ({priceBasis === "recent" ? "최근가" : "평균가"} · {owned.capturedYmd} 시세)
                    {" → "}실수령 <b style={{ color: C.text }}>{formatManwon(ownedNet)}</b>
                    {" · "}가용 자기자금 <b style={{ color: C.blue }}>{formatManwon(assets)}</b>
                  </div>
                </>
              ) : (
                <div style={{ ...hintLine, marginTop: 2 }}>
                  단지 세부패널의 평형 카드에서 <b>보유 지정</b>을 누르면 예상 매도대금이 자기자금에 합산됩니다
                </div>
              )}
            </div>
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
          <div style={{ ...drawer, maxHeight: 280, overflowY: "auto" }}>
            {favorites.length === 0 ? (
              <div style={hintText}>즐겨찾기가 없습니다</div>
            ) : (
              favorites.map((f) => (
                <div key={f.id} style={favRow}>
                  <div onClick={() => gotoFavorite(f)} style={{ cursor: "pointer", display: "flex", alignItems: "baseline" }}>
                    <span style={{ flexGrow: 1, minWidth: 0 }}>
                      <span style={{ color: C.amber }}>★</span> {f.apt_nm}
                      <span style={{ color: C.muted }}> · {regionName(f.lawd_cd)} {f.umd_nm}</span>
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFavDdayErr("");
                        setFavEdit(
                          favEdit?.id === f.id
                            ? null
                            : { id: f.id, leaseEnd: f.lease_end || "", note: f.note || "", noteDate: f.note_date || "" }
                        );
                      }}
                      style={favEditBtn}
                      title="임대차 만기·이벤트 메모 D-day 입력"
                    >
                      ✎
                    </button>
                  </div>
                  {favEdit?.id !== f.id && (f.lease_end || f.note) && (
                    <div style={favDdayLine}>
                      {f.lease_end && <span>🔑 {leaseLabel(f.lease_end)}</span>}
                      {f.note && (
                        <span>
                          📌 {f.note}
                          {f.note_date ? ` · ${daysUntil(f.note_date) >= 0 ? "D-" + daysUntil(f.note_date) : daysUntil(f.note_date) * -1 + "일 지남"}` : ""}
                        </span>
                      )}
                    </div>
                  )}
                  {favEdit?.id === f.id && (
                    <div style={favEditBox}>
                      <label style={fieldRow}>
                        <span style={fieldLabel}>임대차 만기</span>
                        <input type="date" value={favEdit.leaseEnd} onChange={(e) => setFavEdit({ ...favEdit, leaseEnd: e.target.value })} style={fieldInput} />
                      </label>
                      <label style={fieldRow}>
                        <span style={fieldLabel}>이벤트 메모</span>
                        <input type="text" value={favEdit.note} onChange={(e) => setFavEdit({ ...favEdit, note: e.target.value })} placeholder="예: 재건축 결정" style={fieldInput} />
                      </label>
                      <label style={fieldRow}>
                        <span style={fieldLabel}>이벤트 날짜</span>
                        <input type="date" value={favEdit.noteDate} onChange={(e) => setFavEdit({ ...favEdit, noteDate: e.target.value })} style={fieldInput} />
                      </label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                        <button onClick={saveFavDday} style={favSaveBtn}>저장</button>
                        {favDdayErr && <span style={{ fontSize: 11, color: C.red }}>{favDdayErr}</span>}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {!isMobile && listContent}
      </div>

      {/* 모바일 단지 목록 시트 */}
      {isMobile && showList && (
        <div style={mobileListSheet}>
          <button onClick={() => setShowList(false)} style={closeBtn} aria-label="닫기">×</button>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, paddingRight: 24 }}>
            📋 {regionLabel} 단지 목록
          </div>
          {listContent}
        </div>
      )}

      {/* 우측 세부정보 패널 (모바일: 하단 시트) */}
      {selected && detail && (
        <div style={detailPanelStyle}>
          <button onClick={() => setSelected(null)} style={closeBtn} aria-label="닫기">×</button>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingRight: 24 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text, lineHeight: 1.25 }}>{selected.aptNm}</div>
              {detail.overall && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 5, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: -0.3 }}>
                    {formatManwon(detail.overall.recentAmount)}
                  </span>
                  <span style={{ fontSize: 11, color: C.muted }}>
                    최근 실거래({shortDate(detail.overall.recentDate)}) · 평균 {formatManwon(detail.overall.avg)}
                  </span>
                </div>
              )}
              {(() => {
                const yoy = rank.get(`${selected.umdNm}|${selected.aptNm}`)?.yoyPct;
                const rebuild =
                  detail.buildYear && new Date().getFullYear() - Number(detail.buildYear) >= REBUILD_AGE;
                if (yoy == null && !rebuild) return null;
                return (
                  <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                    {yoy != null && (
                      <span style={yoy >= HOT_PCT ? hotBadge : yoy >= 0 ? upBadge : downBadge}>
                        {yoy >= HOT_PCT ? "🔥 " : ""}1년 {yoy >= 0 ? "+" : ""}{yoy}%
                      </span>
                    )}
                    {yoy != null && rankMedian != null && (() => {
                      const ex = Math.round(yoy - rankMedian);
                      return (
                        <span
                          style={ex >= EXCESS_HOT_PCT ? excessHotBadge : excessBadge}
                          title={`단지 1년 상승률 − 지역 중앙값(${rankMedian >= 0 ? "+" : ""}${rankMedian}%) = 지역 대비 초과상승. 크게 양수면 재건축 등 기대가 이미 가격에 선반영된 정도가 큼(되돌림 주의), 0 근처면 지역 장세 동행.`}
                        >
                          {ex >= EXCESS_HOT_PCT ? "⚡ " : ""}지역 대비 {ex >= 0 ? "+" : ""}{ex}%p
                        </span>
                      );
                    })()}
                    {rebuild && <span style={rebuildBadge}>🏗 재건축연한</span>}
                  </div>
                );
              })()}
              <div style={{ fontSize: 12, color: C.sub, marginTop: 5 }}>
                {regionLabel} {selected.umdNm}
                {detail.buildYear ? ` · ${detail.buildYear}년 준공` : ""}
                {info.data?.households ? ` · ${info.data.households.toLocaleString()}세대` : ""}
                {info.data?.dongCnt ? ` · ${info.data.dongCnt}개동` : ""}
                {detail.overall ? ` · 최근 ${MONTHS}개월 ${detail.overall.count}건` : ""}
              </div>
              <a
                href={`https://search.naver.com/search.naver?query=${encodeURIComponent(`${regionLabel} ${selected.aptNm}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={newsLink}
              >
                🔎 네이버 검색
              </a>
            </div>
            <button onClick={toggleFavorite} style={starBtn} title="즐겨찾기">
              {isSelectedFav ? "★" : "☆"}
            </button>
          </div>

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

          <div style={hintLine}>평형을 누르면 시세 추세 그래프가 펼쳐져요</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {detail.groups.map((g) => {
              const gp = priceBasis === "recent" ? g.recentAmount : g.avg;
              const ln = loanForPrice(gp);
              const gap = ln ? assets - ln.requiredCash : null;
              const isSel = trendArea === g.m2;
              return (
                <div
                  key={g.m2}
                  onClick={() => setTrendArea(g.m2)}
                  style={{ ...pyeongCard, ...(isSel ? pyeongCardOn : null), cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>
                      {g.m2}㎡ <span style={{ color: C.sub, fontWeight: 500 }}>· {g.pyeong}평</span>
                    </span>
                    <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleOwned(g); }}
                        style={{ ...ownedBtn, ...(isOwnedPyeong(g) ? ownedBtnOn : null) }}
                        title="갈아타기: 이 평형을 보유 주택으로 지정하면 예상 매도대금이 자기자금에 합산됩니다"
                      >
                        {isOwnedPyeong(g) ? "✓ 보유중" : "보유 지정"}
                      </button>
                      <a
                        href={naverLandUrl(selected.umdNm, selected.aptNm)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={naverLandLink}
                        title="네이버 부동산에서 이 단지 매물 보기"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {g.count}건 · 🏠 매물
                      </a>
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
                    평균 <b style={{ color: C.text }}>{formatManwon(g.avg)}</b>
                    {" · "}최근 <b style={{ color: C.blue }}>{formatManwon(g.recentAmount)}</b>
                  </div>

                  {isSel && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}` }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>
                          시세 추세 <span style={{ color: C.muted, fontWeight: 400 }}>· {trendMonths === 36 ? "최근 3년" : "최근 1년"}</span>
                        </span>
                        <span style={{ display: "flex", gap: 4 }}>
                          {[{ v: 12, label: "1년" }, { v: 36, label: "3년" }].map((o) => (
                            <button key={o.v} onClick={() => setTrendMonths(o.v)} style={{ ...basisBtn, ...(trendMonths === o.v ? basisBtnOn : null) }}>
                              {o.label}
                            </button>
                          ))}
                        </span>
                      </div>
                      {trend.loading ? (
                        <div style={hintText}>불러오는 중…</div>
                      ) : trend.series ? (
                        <TrendChart series={trend.series} areaLabel={`${g.m2}㎡`} />
                      ) : null}
                    </div>
                  )}

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
          background: #2563eb; color: #fff; padding: 4px 10px;
          border-radius: 999px; font-size: 11px; white-space: nowrap;
          box-shadow: 0 1px 2px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.22),
            0 0 0 1.5px rgba(255,255,255,0.9);
          cursor: pointer; transform: translateX(-50%);
          transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
        }
        /* 공통 hover는 변형별 hover보다 먼저 — 같은 특이도라 뒤에 두면 색칠 핀 hover색을 덮음 */
        .trade-pin:hover {
          background: #1d4ed8;
          transform: translateX(-50%) translateY(-2px);
          box-shadow: 0 2px 4px rgba(15,23,42,0.16), 0 8px 20px rgba(15,23,42,0.28),
            0 0 0 1.5px rgba(255,255,255,0.95);
        }
        .trade-pin--fav { background: #f59e0b; }
        .trade-pin--fav:hover { background: #d97706; }
        .trade-pin--away { opacity: 0.92;
          outline: 2px dashed rgba(255,255,255,0.95); outline-offset: 1px; }
        .trade-pin--ok { background: #059669; }
        .trade-pin--ok:hover { background: #047857; }
        .trade-pin--no { background: #dc2626; }
        .trade-pin--no:hover { background: #b91c1c; }
        .trade-pin b { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .trade-pin span { font-size: 9px; opacity: 0.85; max-width: 92px;
          overflow: hidden; text-overflow: ellipsis; }
        .cx-row { padding: 9px 8px 9px 10px; border-bottom: 1px solid ${C.divider};
          border-left: 3px solid transparent; cursor: pointer;
          border-radius: 0 10px 10px 0;
          transition: background 0.15s, border-color 0.15s;
          animation: cxIn 0.28s ease both; }
        .cx-row:hover { background: #f8fafc; }
        .cx-row--on { background: ${C.blueSoft}; border-left-color: ${C.blue}; }
        @keyframes cxIn { from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}
