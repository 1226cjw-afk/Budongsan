"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_REGIONS, regionName } from "../lib/regions";
import { isRegulated } from "../lib/loanPolicy";
import { kstDate, kstYm } from "../lib/format";
import { favKey, distMeters } from "../lib/tradeStats";
import useIsMobile from "./useIsMobile";
import { useShell } from "./AppShell";
import {
  AREA_FILTERS, PRICE_FILTERS, MONTHLY_FILTERS, bandFor,
  SORT_OPTIONS, regionYoyMedian, SORT_GAP, matchesComplexName, resolveFocus,
} from "../lib/mapFilters";
import { bestFit, buildComplexRows, sortComplexRows } from "../lib/complexRows";
import { KAKAO_SDK_URL } from "../lib/kakaoSdk";
import HelpModal from "./HelpModal";
import { MobileTopBar, MobileSheet } from "./MobileShell";
import ControlPanel from "./map/ControlPanel";
import MapSheet from "./map/MapSheet";
import ComplexList from "./map/ComplexList";
import DetailPanel from "./map/DetailPanel";
import useMapProfile from "./map/useMapProfile";
import useFavorites from "./map/useFavorites";
import useCompareList from "./useCompareList";
import useBackToClose from "./map/useBackToClose";
import useComplexDetail from "./map/useComplexDetail";
import useHouseholds from "./map/useHouseholds";
import { syncMarkers, MAP_CSS } from "./map/markers";
import { readDeepLink, markLinkConsumedOnLeave, readSavedView, writeSavedView } from "./map/viewStorage";
import {
  controlPanel, detailPanel, locateBtn, regionToastBox, regionToastBtn, TABBAR_H, SNAP_H,
} from "./mapStyles";

// 카카오맵 + 국토부 실거래가. 지도 이동 시 중심 지역을 자동 인식해 그 시군구 데이터를 로드하고,
// 단지 클릭(또는 지도 빈 곳 클릭→가까운 단지) 시 우측 패널에 평형별 시세·대출 분석을 보여준다.
//
// 이 파일에 남긴 것: 지도 SDK·지역 판정·지도 이동·데이터 로딩·화면 조립. 나머지는 components/map/에:
//   화면 조각(ControlPanel·ComplexList·DetailPanel·MapSheet…) · 핀 동기화(markers.js) ·
//   훅(useMapProfile 자금 · useFavorites ★ · useComplexDetail 세부 · useHouseholds 세대수 ·
//   useBackToClose 모바일 뒤로가기) · 첫 화면 저장소(viewStorage.js). 순수 파생은 lib/complexRows.js.
// ⚠️ 새 기능을 넣을 땐 여기 쌓기 전에 분리 가능한지 먼저 볼 것 — 이 파일은 **세 번** 비대해졌다
//    (2026-07-12 1263줄 → 08-15 1791줄 → 08-30 1156줄 → 10-05 1330줄 → 10-25 분리).

const VALID_CODES = new Set(ALL_REGIONS.map((r) => r.code));
const DEFAULT_CODE = "41173"; // 안양시 동안구
const DEFAULT_CENTER = { lat: 37.3897, lng: 126.9536 }; // 안양 평촌 일대
const MONTHS = 3; // 지도 마커: 최근 3개월 병합
const NEAR_CLICK_M = 200; // 지도 빈 곳 클릭 시 이 거리(m) 안의 가장 가까운 단지 선택

// 지도 이동이 멈춘 뒤 이만큼 더 조용해야 지역을 재판정한다. 팬 도중 매 idle마다
// 지오코더를 때리고 시군구가 바뀔 때마다 전체 재로드가 걸려 지도가 버벅였다.
const IDLE_SETTLE_MS = 400;
// 코드가 지도를 옮긴 직후(setBounds·setCenter·panTo) 이 시간 동안은 지역 재판정을 건너뛴다.
// ⚠️ 이게 없으면 "지역 선택 → 지도가 그 지역으로 이동 → 그 이동의 idle이 다시 지역을 판정"
//    하는 자기참조 루프가 생겨, 경계에 걸친 지역은 원래 지역으로 되돌아간다.
const PROGRAMMATIC_MOVE_MS = 1200;

export default function KakaoMap() {
  const { tab, focusRef, gotoMapTab } = useShell();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const geocoderRef = useRef(null);

  // 오버레이는 key → {overlay, el} 로 재사용한다(전량 파괴/재생성 금지 — map/markers.js 참조).
  const overlaysRef = useRef(new Map());
  const dataRef = useRef(null); // 지도 클릭 핸들러(초기화 때 만든 고정 클로저)가 최신 거래를 참조
  const lawdCdRef = useRef(DEFAULT_CODE); // idle 핸들러가 최신 지역 코드 참조
  const fitRef = useRef(true); // 다음 렌더에서 지도 영역 자동 맞춤 여부
  const suppressIdleRef = useRef(0); // 코드가 지도를 옮긴 시각 — 지역 재판정 억제 창
  const idleTimerRef = useRef(null); // idle 디바운스 타이머
  const myLocRef = useRef(null); // 현위치 점 오버레이
  const initialViewRef = useRef(null); // 첫 화면(딥링크 | 마지막 위치) — 아래 부트스트랩이 정하고 지도 초기화가 이어받는다

  const [ready, setReady] = useState(false); // 카카오 SDK 로드 + 지도 생성 완료
  // 첫 지역 확정 완료. ⚠️ 실거래·상승률 로드는 ready가 아니라 **이걸** 기다린다(부트스트랩 주석 참조).
  const [booted, setBooted] = useState(false);
  const [status, setStatus] = useState("지도 로딩 중…");
  const [lawdCd, setLawdCd] = useState(DEFAULT_CODE);
  const [area, setArea] = useState("all");
  const [price, setPrice] = useState("all");
  const [monthly, setMonthly] = useState("all"); // 월 상환액 상한
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null); // 캐시 갱신 시각(ISO)
  const [selected, setSelected] = useState(null);
  const [showFavs, setShowFavs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [priceBasis, setPriceBasis] = useState("recent"); // recent | avg
  const [showCost, setShowCost] = useState(null); // 부대비용 내역 펼친 평형(m2) | null
  const isMobile = useIsMobile(); // 좁은 화면 → 패널을 시트/상단바로
  const [excluded, setExcluded] = useState(null); // {cancelled, direct} 시세에서 뺀 거래 수
  const [regionToast, setRegionToast] = useState(null); // 자동 지역 전환 알림 {from, to}
  const [myLoc, setMyLoc] = useState(null); // 현위치 {lat, lng}
  const [locating, setLocating] = useState(false);

  const [tradesData, setTradesData] = useState(null);
  const [rank, setRank] = useState(new Map()); // `${umd}|${apt}` → {yoyPct, recentN, pastN}
  const [sortBy, setSortBy] = useState("yoy");
  const [onlyBuyable, setOnlyBuyable] = useState(false); // 구매가능 단지만 (자금 설정 시)
  const [nameQuery, setNameQuery] = useState(""); // 리스트 이름 검색(딥링크 q로도 채워진다)
  // 딥링크·🔥 오늘 탭 착지 후 결과가 1곳이면 자동 선택(1회성). 값 = 착지할 지역 코드 | null.
  const pendingPickRef = useRef(null); // { lawdCd, aptNm, umdNm? } | null

  // 모바일 시트: 지도 시트(목록 peek/half/full + 상세 스택)와 ⚙️ 설정 시트(모달). 둘은 동시에 렌더되지 않는다.
  const [listSnap, setListSnap] = useState("peek");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 내 자금(입력·저장·자기자금·대출 계산기) — map/useMapProfile.js
  const {
    profile, updateProfile, hasProfile, assets, affordMode, loanKey, loanForPrice,
    owned, ownedSalePrice, ownedNet, showCostNotice, dismissCostNotice,
  } = useMapProfile(priceBasis);
  // ★ 즐겨찾기 — map/useFavorites.js
  const favs = useFavorites();
  const compare = useCompareList(); // ⚖️ 비교 담기 — 비교 탭과 같은 localStorage 목록
  const { favorites, favSet } = favs;
  // 선택 단지의 평형 요약·추세·세대수 — map/useComplexDetail.js
  const { detail, trend, trendArea, setTrendArea, trendMonths, setTrendMonths, info } =
    useComplexDetail(selected, lawdCd);

  const regionLabel = useMemo(() => regionName(lawdCd), [lawdCd]);
  useEffect(() => {
    lawdCdRef.current = lawdCd;
  }, [lawdCd]);

  // 모바일: 단지가 선택되면 상세가 목록 시트 위에 쌓인다. 접혀 있었으면 half로 편다.
  useEffect(() => {
    if (isMobile && selected) setListSnap((s) => (s === "peek" ? "half" : s));
  }, [selected, isMobile]);

  // 모바일 뒤로가기 = 상세 닫기(→ 목록) · ⚙️ 설정 닫기. 없으면 홈 화면 북마크(히스토리 1칸)에서 뒤로가기가
  // 앱을 벗어나고, 탭 이동 뒤엔 설정이 열린 채 이전 탭으로 간다(2026-09-29 리뷰 · 실측: 오늘 → 지도 → ⚙️ →
  // 뒤로 = /news로 가고 설정은 열린 채). 히스토리 규칙은 map/useBackToClose.js 주석.
  // ⚠️ 선언 순서 유지(상세 → 설정) — popstate 리스너도 이 순서로 붙는다.
  const closeDetail = useBackToClose(isMobile && !!selected, "detail", () => setSelected(null));
  const closeSettings = useBackToClose(isMobile && settingsOpen, "settings", () => setSettingsOpen(false));

  // 자동 지역 전환 알림은 잠깐만 띄운다(되돌릴 기회만 주고 사라짐).
  useEffect(() => {
    if (!regionToast) return;
    const t = setTimeout(() => setRegionToast(null), 6000);
    return () => clearTimeout(t);
  }, [regionToast]);

  // 현위치 점 — 지도에 하나만 유지한다.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (myLocRef.current) {
      myLocRef.current.setMap(null);
      myLocRef.current = null;
    }
    if (!myLoc) return;
    const kakao = window.kakao;
    const el = document.createElement("div");
    el.className = "my-loc-dot";
    const ov = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(myLoc.lat, myLoc.lng),
      content: el,
      zIndex: 1,
    });
    ov.setMap(mapRef.current);
    myLocRef.current = ov;
  }, [ready, myLoc]);

  // 지역 1년 상승률 중앙값 — 선반영 게이지 기준선(단지 상승률 − 중앙값 = 지역 대비 초과상승 %p).
  const rankMedian = useMemo(() => regionYoyMedian(rank), [rank]);

  const isSelectedFav = selected
    ? favSet.has(favKey(lawdCd, selected.umdNm, selected.aptNm))
    : false;

  const regulated = isRegulated(lawdCd);

  // 평형 카드 한 장(groupByPyeong의 g)에 대한 대출 계산.
  // ⚠️ **마커/리스트와 세부패널이 반드시 같은 입력을 쓰게** 하려고 한 곳에 모았다 —
  //    기준가 선택(priceBasis)과 area 전달이 여기 한 번만 적힌다.
  //    예전엔 세부패널이 같은 계산을 따로 적으면서 `loanForPrice(gp)`로 **area(g.m2)를
  //    빠뜨렸다**. 그래서 전용 85㎡ 초과 평형에서 농어촌특별세(0.2%, 중과 시 0.6%)가 통째로
  //    빠져 필요자금이 작게 나왔다(2026-08-14 실측: 11억 40평 −220만원 / 12억 54평 −238만원).
  //    같은 평형인데 리스트 배지는 "부족", 세부 카드는 "여유"가 뜰 수 있었다.
  function loanForGroup(g) {
    const gp = priceBasis === "recent" ? g.recentAmount : g.avg;
    // ⚠️ area: g.m2 = 농특세(85㎡ 초과) 판정 기준. 빼지 말 것
    const ln = loanForPrice(gp, { lawdCd, area: g.m2 });
    return { ln, gap: ln ? assets - ln.requiredCash : null };
  }

  // 코드가 지도를 옮길 때는 반드시 이걸로 감싼다 — 그 이동이 만든 idle은 지역을 재판정하지 않는다.
  // (지역 선택 → 지도 이동 → 그 idle이 다시 지역 판정 → 원래 지역으로 되돌림, 이 루프를 끊는다.)
  function moveMap(fn) {
    suppressIdleRef.current = Date.now();
    fn();
  }

  // 현위치로 이동. initial=true면 첫 방문 자동 호출(실패해도 조용히 넘어간다).
  function locateMe({ initial = false } = {}) {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const kakao = window.kakao;
        const { latitude: lat, longitude: lng } = pos.coords;
        setMyLoc({ lat, lng });
        geocoderRef.current.coord2RegionCode(lng, lat, (res, st) => {
          const code =
            st === kakao.maps.services.Status.OK
              ? ((res.find((x) => x.region_type === "B") || res[0])?.code || "").slice(0, 5)
              : "";
          // 서비스 지역(수도권) 밖이면 첫 방문에선 그냥 기본 위치를 유지한다.
          if (!VALID_CODES.has(code)) {
            if (!initial) setStatus("현위치가 서비스 지역(수도권) 밖이에요.");
            return;
          }
          fitRef.current = false;
          moveMap(() => {
            map.setLevel(5);
            map.setCenter(new kakao.maps.LatLng(lat, lng));
          });
          if (code !== lawdCdRef.current) {
            lawdCdRef.current = code;
            setLawdCd(code);
          }
        });
      },
      () => setLocating(false), // 권한 거부·타임아웃 — 기본 위치 그대로
      { timeout: 8000, maximumAge: 300000 }
    );
  }

  // 첫 지역 확정 (1회) — 딥링크 > 마지막으로 보던 위치 > 기본값.
  // ⚠️ 이 판정은 원래 지도 초기화(카카오 SDK 로드 콜백) **안에** 있었다. 그래서 지도와 아무
  //    관계도 없는 /api/trades·/api/rank가 SDK 로드가 끝나기를 기다렸다
  //    (2026-09-04 로컬 prod 실측: 게이트 없는 /api/favorites는 492ms에 출발하는데
  //     같은 페이지의 /api/trades는 1749ms — 1.26초를 그냥 흘렸다).
  //    판정에 필요한 건 location.search와 localStorage뿐이라 마운트 직후 알 수 있다.
  // ⚠️ 딥링크가 저장된 위치를 **이긴다**. 안 그러면 📢 요주의 단지에서 링크로 들어와도
  //    마지막에 보던 지역으로 되돌아가, 링크가 아무 일도 안 한 것처럼 보인다.
  // ⚠️ localStorage·location은 마운트 이후에만 읽는다(useState 초기값 → 하이드레이션 불일치).
  useEffect(() => {
    const link = readDeepLink(VALID_CODES);
    const saved = link ? null : readSavedView();
    initialViewRef.current = { link, saved };

    if (link) {
      // 좌표를 모르는 채 지역만 아는 상태 → 데이터가 오면 지역 전체를 자동 맞춤한다
      // (좌표 없는 옛 즐겨찾기를 여는 gotoFavorite 폴백과 같은 경로).
      // fitRef는 마커 effect가 소비하는데 그건 ready 이후라, 여기서 미리 정해 둬도 안전하다.
      fitRef.current = true;
      lawdCdRef.current = link.lawdCd;
      setLawdCd(link.lawdCd);
      if (link.q) {
        pendingPickRef.current = { lawdCd: link.lawdCd, aptNm: link.q }; // 착지 후 landOn이 처리
        setListSnap("half"); // 모바일: 목록 시트를 펴서 착지 결과를 바로 보여준다
      }
      // 주소창을 정리한다 — 안 지우면 사용자가 지도를 옮긴 뒤 새로고침할 때마다
      // 딥링크가 다시 발동해 원래 자리로 끌려간다.
      // 한 틱 미룬다 — 자식 effect가 App Router effect보다 먼저 돌아 즉시 부르면 Next가 모르는 변경이 된다.
      // ⚠️ 이 정리는 **첫 화면용**일 뿐이다. 탭 이동 뒤 Next가 옛 URL을 되살리는 건 못 막는다 —
      //    그래서 재발동 방지는 viewStorage의 LINK_SEEN_KEY가 맡는다(readDeepLink 주석 참조).
      setTimeout(() => window.history.replaceState(null, "", "/"), 0);
      markLinkConsumedOnLeave();
    } else if (saved && VALID_CODES.has(saved.lawdCd)) {
      fitRef.current = false; // 복원한 위치를 자동 맞춤(setBounds)이 덮지 않도록
      lawdCdRef.current = saved.lawdCd;
      setLawdCd(saved.lawdCd);
    }
    setBooted(true);
  }, []);

  // 지도 초기화 (1회) — services 라이브러리로 좌표→지역 변환 + 빈 곳 클릭→가까운 단지.
  // ⚠️ 이 effect는 위 부트스트랩보다 **뒤에** 선언돼 있어야 한다(initialViewRef를 읽는다).
  useEffect(() => {
    const SCRIPT_ID = "kakao-map-sdk";

    function initMap() {
      window.kakao.maps.load(() => {
        const kakao = window.kakao;
        // 지난번 보던 자리부터 복원. 없으면 기본 위치로 띄우고 아래에서 현위치를 물어본다.
        // 지역 확정·딥링크 처리는 부트스트랩 effect가 이미 끝냈다(데이터도 그때 출발했다).
        // 여기서 남은 일은 그 결정을 **지도에 반영**하는 것뿐이다.
        const { link, saved } = initialViewRef.current || { link: null, saved: null };
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(saved?.lat ?? DEFAULT_CENTER.lat, saved?.lng ?? DEFAULT_CENTER.lng),
          level: saved?.level ?? 5,
        });
        mapRef.current = map;
        geocoderRef.current = new kakao.maps.services.Geocoder();
        suppressIdleRef.current = Date.now(); // 생성 직후 첫 idle은 판정하지 않는다

        // 지도가 멈추면 ① 위치를 저장하고 ② 잠시 더 조용할 때만 중심 시군구를 재판정한다.
        kakao.maps.event.addListener(map, "idle", () => {
          const c = map.getCenter();
          writeSavedView({
            lawdCd: lawdCdRef.current,
            lat: c.getLat(),
            lng: c.getLng(),
            level: map.getLevel(),
          });
          // 코드가 옮긴 이동이면 재판정하지 않는다(자기참조 루프 차단).
          if (Date.now() - suppressIdleRef.current < PROGRAMMATIC_MOVE_MS) return;
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = setTimeout(() => {
            geocoderRef.current.coord2RegionCode(c.getLng(), c.getLat(), (res, st) => {
              if (st !== kakao.maps.services.Status.OK) return;
              const r = res.find((x) => x.region_type === "B") || res[0];
              const code = r.code.slice(0, 5);
              if (!VALID_CODES.has(code) || code === lawdCdRef.current) return;
              fitRef.current = false; // 팬으로 인한 전환 → 자동 맞춤 안 함
              setRegionToast({ from: lawdCdRef.current, to: code });
              setNameQuery(""); // ⚠️ 이전 지역의 이름 검색이 남으면 새 지역 목록이 "0곳"이 된다
              setLawdCd(code);
            });
          }, IDLE_SETTLE_MS);
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
        // 저장된 위치가 없는 첫 방문에만 현위치를 물어본다(매번 권한 팝업이 뜨지 않게).
        // ⚠️ 딥링크로 들어왔을 땐 부르지 말 것 — 딥링크면 saved가 null이라 이 조건만으론
        //    현위치를 묻게 되고, 허용돼 있으면 setLawdCd가 링크의 지역을 덮어써 📢 요주의
        //    단지에서 온 사용자가 엉뚱한 지역에 착지한다(2026-09-04 확인, 링크는 09-02 도입).
        if (!saved && !link) locateMe({ initial: true });
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
    script.src = KAKAO_SDK_URL; // ⚠️ layout의 preload와 같은 URL이어야 한다(lib/kakaoSdk.js)
    script.addEventListener("load", initMap);
    document.head.appendChild(script);
    return () => script.removeEventListener("load", initMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 대기 중인 idle 디바운스 타이머 정리(언마운트 후 setState 방지).
  useEffect(() => () => clearTimeout(idleTimerRef.current), []);

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
        // ⚠️ toISOString()은 UTC 날짜다 — 브라우저가 KST여도 00:00~08:59엔 어제가 찍혀
        //    "07-31 시세"로 저장된 스냅샷이 화면에 08-01로 보이지 않는다. 서버 쪽 날짜
        //    보정과 같은 함수를 쓴다(format.kstDate).
        capturedYmd: kstDate(),
      },
      // 보유 주택이 생기면 가구유형도 1주택으로 보정(처분조건부 — LTV 규칙은 무주택과 동일).
      ...(profile.householdType === "무주택" ? { householdType: "1주택" } : {}),
    });
  }

  // 지도에서 고른 단지 ★ 담기/빼기(빼기는 ★ 서랍의 removeFavorite도 있다 — useFavorites 주석).
  function toggleFavorite() {
    if (!selected) return;
    const { umdNm, aptNm, lat, lng } = selected;
    favs.toggleFavorite({ lawdCd, umdNm, aptNm, lat, lng });
  }

  // ⚠️ ready(지도 SDK)가 아니라 booted를 기다린다 — 실거래는 지도와 무관한 데이터라
  //    SDK 로드를 기다릴 이유가 없다. 마커는 어차피 아래 렌더 effect가 ready 이후에 그리고,
  //    먼저 도착한 데이터는 tradesData에 앉아 기다린다.
  useEffect(() => {
    if (!booted) return;
    loadTrades(lawdCd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, lawdCd]);

  // 지역이 바뀌면 저장된 뷰의 지역도 맞춰 둔다 — 셀렉트로 바꾼 직후엔 지도가 아직 안 움직여
  // idle이 안 오므로, 이게 없으면 새로고침 때 좌표와 지역이 어긋난다.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const c = mapRef.current.getCenter();
    writeSavedView({ lawdCd, lat: c.getLat(), lng: c.getLng(), level: mapRef.current.getLevel() });
  }, [ready, lawdCd]);

  // 지역 전체 1년 상승률(/api/rank) — 리스트 정렬·🔥 배지용. 지도와 병렬로 비동기 로드.
  // 실거래 로드와 같은 이유로 ready가 아니라 booted 기준(바로 위 loadTrades effect 참조).
  useEffect(() => {
    if (!booted) return;
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
  }, [booted, lawdCd]);

  // ⚠️ 여기서 마커를 직접 그리지 않는다. 예전엔 fetch가 끝난 자리에서 바로 그렸는데,
  //    그 함수는 **호출된 렌더의 클로저**를 들고 있어 로딩 중에 사용자가 필터를 바꾸면
  //    바뀌기 전 필터로 마커를 그리고 끝났다(리스트는 최신 필터라 둘이 갈라짐).
  //    지금은 tradesData 상태만 갱신하고, 마커는 아래 effect가 최신 값으로 그린다.
  async function loadTrades(code, { refresh = false } = {}) {
    setLoading(true);
    setSelected(null);
    setStatus(`${regionName(code)} 최근 ${MONTHS}개월 ${refresh ? "갱신" : "불러오는"} 중…`);
    try {
      const res = await fetch(
        `/api/trades?lawdCd=${code}&dealYmd=${kstYm()}&months=${MONTHS}${refresh ? "&refresh=1" : ""}`
      );
      const data = await res.json();
      if (data.error) {
        setStatus(`오류: ${data.error}`);
        return;
      }
      dataRef.current = data; // 지도 클릭 핸들러용(고정 클로저라 ref로만 최신값을 본다)
      setTradesData(data);
      setLastUpdated(data.fetchedAt ?? null);
      setExcluded(data.excluded ?? null);
    } catch (e) {
      setStatus(`불러오기 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const areaBand = bandFor(AREA_FILTERS, area);
  const priceBand = bandFor(PRICE_FILTERS, price);
  const monthlyCap = bandFor(MONTHLY_FILTERS, monthly).max;

  // 지도 마커와 리스트가 **함께 쓰는** 단지 행. 예전엔 renderMarkers와 listRows가 필터·집계·
  // 대출 계산을 각자 적어, 단지 수백 곳의 계산이 매 필터 변경마다 두 번 돌고 호출부가 갈라질
  // 여지가 있었다(2026-08-14 농특세 사고가 그 계열). 이제 파생 경로가 하나뿐이다.
  const baseRows = useMemo(() => {
    if (!tradesData) return null;
    return buildComplexRows({
      complexes: tradesData.complexes,
      lawdCd: tradesData.lawdCd,
      areaBand,
      priceBand,
      priceBasis,
      rankMap: rank,
      favSet,
      fitFor: affordMode ? (hits) => bestFit(hits, { loanForGroup, monthlyCap }) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradesData, area, price, monthly, priceBasis, rank, loanKey, favSet, affordMode]);

  const listRows = useMemo(() => {
    if (!baseRows) return null;
    let rows = affordMode && onlyBuyable ? baseRows.filter((r) => r.buyable) : baseRows;
    // ⚠️ 이름 검색은 **리스트 전용** 필터다. buildComplexRows(마커와 공유하는 배열)에 넣으면
    //    검색이 지도 마커까지 지워 "이 단지가 어디쯤인가"라는 맥락이 통째로 사라진다.
    if (nameQuery.trim()) {
      rows = rows.filter((r) => matchesComplexName(r.c.aptNm, nameQuery, regionName(lawdCd)));
    }
    return sortComplexRows(rows, sortBy);
  }, [baseRows, affordMode, onlyBuyable, sortBy, nameQuery, lawdCd]);

  const householdMap = useHouseholds(listRows, lawdCd); // 상위 행 세대수 lazy — map/useHouseholds.js

  // 딥링크로 착지해 검색 결과가 **한 곳뿐이면** 그 단지를 자동으로 연다 — 거기까지 가야
  // "지도에서 보기"가 끝난 것이다(평형·시세·★ 버튼이 다 세부패널에 있다).
  // ⚠️ 한 번만 소비하는 ref다. 사용자가 검색창에 타이핑하다 우연히 1곳이 될 때마다
  //    패널이 튀어나오면 방해가 된다 — 자동 선택은 링크로 들어온 그 순간만이다.
  useEffect(() => {
    // ⚠️ **착지 지역의 데이터**로 만든 목록에서만 소비한다. 검색어(nameQuery)는 지역 전환보다 먼저
    //    바뀌므로, 그냥 소비하면 **이전 지역** 목록(0곳)에서 기회를 써 버려 착지 후 자동 선택이 안 된다
    //    (2026-09-29 실측: 🔥 핫플 → 강남구 착지, 상세 안 열림). 콜드 딥링크는 그때 데이터가 없어서
    //    드러나지 않았다.
    //    ⚠️ 그리고 **필터 전** 전체 단지(tradesData.complexes)에서 찾는다 — listRows는 면적·가격·구매가능만
    //    필터가 걸려 있어, 자금 부족 핫플을 누르면 "0곳"에 착지했다(2026-09-29 리뷰).
    const target = pendingPickRef.current;
    if (!target || tradesData?.lawdCd !== target.lawdCd) return;
    pendingPickRef.current = null;
    landOn(target, tradesData.complexes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradesData]);

  // 마커는 오직 여기서만 그린다(단일 경로). baseRows가 바뀔 때마다 = 데이터·필터·자금·순위가
  // 바뀔 때마다 최신 값으로 다시 그려진다. 마커에 영향 주는 새 입력은 대부분 baseRows의 deps에
  // 넣으면 되고, 행에 안 들어가는 입력만 이 effect deps에 직접 넣을 것.
  // ⚠️ 지역 전환 중 stale 렌더 방지 가드를 지우지 말 것 — 옛 지역 데이터로 setBounds가 실행되면
  //    fitRef가 소진돼 새 지역으로 지도가 안 움직이고, idle 핸들러가 지역을 되돌린다.
  // ⚠️ ready 게이트를 booted로 내리지 말 것 — 데이터가 SDK보다 먼저 오는 순서의 유일한 안전장치다.
  useEffect(() => {
    if (!ready || !baseRows || !tradesData) return;
    if (tradesData.lawdCd !== lawdCd) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!kakao || !map) return;
    const { bounds, shown, trades, buyable } = syncMarkers({
      kakao,
      map,
      overlays: overlaysRef.current,
      rows: baseRows,
      lawdCd: tradesData.lawdCd,
      favorites,
      affordMode,
      onSelect: setSelected,
      onGotoFavorite: gotoFavorite,
    });

    if (fitRef.current && shown) {
      moveMap(() => map.setBounds(bounds));
      fitRef.current = false;
    }

    const tags = [
      area === "all" ? null : areaBand.label,
      price === "all" ? null : priceBand.label,
      monthly === "all" ? null : bandFor(MONTHLY_FILTERS, monthly).label,
    ]
      .filter(Boolean)
      .join(" · ");
    const head = `${regionName(tradesData.lawdCd)} · 최근 ${MONTHS}개월${tags ? " · " + tags : ""}`;
    const buyTag = affordMode && shown ? ` · 🟢 구매가능 ${buyable}/${shown}곳` : "";
    setStatus(
      shown ? `${head} · 거래 ${trades}건 / 단지 ${shown}곳${buyTag}` : `${head} · 조건에 맞는 거래 없음`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, baseRows, tradesData, lawdCd, favorites]);

  // 리스트 행 클릭 → 단지 선택 + 지도 이동(자동맞춤 없이 그 위치로).
  // 모바일: half 시트가 화면 아래 절반을 덮는다 → 목표 중심을 핀보다 innerHeight/4 px **아래**로 잡아
  //   핀이 상단 바와 시트 사이 빈 영역 가운데에 오게 한다(2026-09-29 실측: 예전엔 핀이 시트 뒤에 숨었다).
  // ⚠️ fitRef=false를 먼저 — panTo(애니메이션)와 데이터 도착 후 setBounds가 겹치면 화면이 밀린다.
  function selectComplex(c) {
    setSelected(c);
    const map = mapRef.current;
    if (c.lat == null || !map) return;
    fitRef.current = false;
    const kakao = window.kakao;
    let target = new kakao.maps.LatLng(c.lat, c.lng);
    if (isMobile) {
      const proj = map.getProjection();
      const p = proj.containerPointFromCoords(target);
      target = proj.coordsFromContainerPoint(
        new kakao.maps.Point(p.x, p.y + Math.round(window.innerHeight / 4))
      );
    }
    moveMap(() => map.panTo(target));
  }

  function selectRegion(code) {
    fitRef.current = true;
    setRegionToast(null); // 직접 고른 지역 — 자동 전환 알림은 필요 없다
    setNameQuery(""); // 지역이 바뀌면 이전 이름 검색은 의미가 없다(남으면 "0곳")
    setLawdCd(code);
  }

  function gotoFavorite(f) {
    setShowFavs(false);
    // panTo(애니메이션)+fitRef(데이터 도착 후 setBounds)를 같이 걸면 경합 —
    // 캐시가 빠르면 setBounds 위로 panTo가 마저 진행돼 단지들이 화면 가장자리로 밀린다.
    // 좌표가 있으면 즉시 setCenter로 착지하고 자동맞춤은 끈다(레벨 5 = 초기 지도 배율).
    if (f.lat != null && mapRef.current) {
      fitRef.current = false;
      moveMap(() => {
        mapRef.current.setLevel(5);
        mapRef.current.setCenter(new window.kakao.maps.LatLng(f.lat, f.lng));
      });
    } else {
      fitRef.current = true; // 좌표 없는 옛 즐겨찾기 → 지역 전체 맞춤 폴백
    }
    setRegionToast(null);
    setNameQuery("");
    setLawdCd(f.lawd_cd);
  }

  // 🔥 오늘 탭(핫플·관심 단지·새 거래)에서 단지로 보내기. AppShell.focusComplex가 부른다.
  // ⚠️ 지역 전환은 selectRegion 경로를 그대로 탄다 — stale 가드·idle 억제·토스트 끔을 새로 만들지 않는다.
  // ⚠️ 다른 지역이면 딥링크의 pendingPickRef 경로(착지 지역 데이터가 온 뒤 landOn). 같은 지역이면
  //    데이터 재로드가 없으므로 dataRef에서 바로 landOn.
  function focusComplex({ lawdCd: code, aptNm, umdNm }) {
    if (!VALID_CODES.has(code)) return;
    const target = { lawdCd: code, aptNm, umdNm };
    if (code === lawdCdRef.current && dataRef.current?.lawdCd === code) {
      landOn(target, dataRef.current.complexes);
      return;
    }
    pendingPickRef.current = target;
    setListSnap("half");
    selectRegion(code);
  }

  // 착지: "누른 그 단지"가 한 곳으로 정해지면 바로 연다(lib/mapFilters.resolveFocus — 이름+동 정확 →
  // 이름 정확 → 부분일치). 여러 곳·0곳이면 이름 검색을 건 목록으로 보여준다.
  // ⚠️ 데스크톱에서 🔥 오늘 패널(440px)이 좌측 목록을 덮고 있으면 목록이 안 보인다 → 지도 탭으로 넘긴다.
  function landOn(target, complexes) {
    const hits = resolveFocus(complexes, target, regionName(target.lawdCd));
    if (hits.length === 1) {
      setNameQuery("");
      selectComplex(hits[0]);
      return;
    }
    setNameQuery(target.aptNm || "");
    setListSnap("half");
    if (!isMobile && tab !== "map") gotoMapTab();
  }
  useEffect(() => {
    focusRef.current = focusComplex; // 매 렌더 최신 클로저로 교체(selectComplex가 isMobile을 본다)
  });

  // 탭 셸: 오늘·뉴스 패널이 지도를 덮었다가 걷힐 때. 컨테이너 크기는 안 바뀌지만(덮기만 함)
  // 모바일 주소창 높이 변화 등으로 어긋날 수 있어 복귀 시 한 번 맞춘다(비용 ~0).
  useEffect(() => {
    if (tab === "map" && mapRef.current) mapRef.current.relayout();
  }, [tab]);

  // 내 자금이 꺼지면 자금 기반 정렬·필터도 초기화.
  useEffect(() => {
    if (!affordMode) {
      if (sortBy === "gap") setSortBy("yoy");
      if (onlyBuyable) setOnlyBuyable(false);
      if (monthly !== "all") setMonthly("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affordMode]);

  const sortOptions = affordMode ? [...SORT_OPTIONS, SORT_GAP] : SORT_OPTIONS;

  // 모바일: 상단 1줄 바 + 바닥의 지도 시트(목록 peek/half/full, 상세는 그 위에 쌓임) + ⚙️ 설정 시트(모달).
  //   설정이 열리면 지도 시트는 렌더하지 않는다 = 겹침 구조적 불가(예전 단일 슬롯의 성질 유지).
  //   패널 자체는 시트 안의 콘텐츠가 되므로 위치·배경·그림자를 벗긴다.
  // 데스크톱: 좌측 패널이 컨트롤+단지 리스트(네이버식)로 전체 높이.
  const bare = {
    position: "static", width: "auto", padding: 0,
    background: "none", boxShadow: "none", border: "none",
  };
  const controlPanelStyle = isMobile
    ? { ...controlPanel, ...bare, borderRadius: 0 }
    : { ...controlPanel, bottom: 14, width: 340, overflow: "hidden" };
  const detailPanelStyle = isMobile
    ? { ...detailPanel, ...bare, overflowY: "visible" }
    : detailPanel;

  // ⚠️ status 전문(필터 태그·구매가능 수 포함)은 1줄 바에 안 들어간다 → 짧은 버전.
  const shortSummary = tradesData
    ? `${regionLabel} · ${listRows ? listRows.length : 0}곳`
    : regionLabel;
  const hasFilter = area !== "all" || price !== "all" || monthly !== "all";

  const controlPanelContent = (
    <ControlPanel
      isMobile={isMobile}
      loading={loading}
      status={status}
      lastUpdated={lastUpdated}
      lawdCd={lawdCd}
      onSelectRegion={selectRegion}
      onRefresh={() => loadTrades(lawdCd, { refresh: true })}
      area={area} setArea={setArea}
      price={price} setPrice={setPrice}
      monthly={monthly} setMonthly={setMonthly}
      affordMode={affordMode}
      hasProfile={hasProfile}
      assets={assets}
      priceBasis={priceBasis}
      favorites={favorites}
      showFavs={showFavs} setShowFavs={setShowFavs}
      showProfile={showProfile} setShowProfile={setShowProfile}
      onOpenList={() => { closeSettings(); setListSnap("half"); setShowFavs(false); setShowProfile(false); }}
      showCostNotice={showCostNotice}
      onDismissCostNotice={dismissCostNotice}
      profile={profile}
      updateProfile={updateProfile}
      owned={owned}
      ownedSalePrice={ownedSalePrice}
      ownedNet={ownedNet}
      favProps={{
        onGoto: gotoFavorite,
        onRemove: favs.removeFavorite,
        favEdit: favs.favEdit, setFavEdit: favs.setFavEdit,
        favDdayErr: favs.favDdayErr, setFavDdayErr: favs.setFavDdayErr,
        onSave: favs.saveFavDday,
      }}
    />
  );

  const listContent = (
    <ComplexList
      rows={listRows}
      selected={selected}
      onSelect={selectComplex}
      sortBy={sortBy} setSortBy={setSortBy}
      sortOptions={sortOptions}
      affordMode={affordMode}
      onlyBuyable={onlyBuyable} setOnlyBuyable={setOnlyBuyable}
      householdMap={householdMap}
      nameQuery={nameQuery} setNameQuery={setNameQuery}
    />
  );

  // ⚠️ `selected && detail &&` 가드 필수 — JSX는 변수로 만드는 순간 children 표현식이
  // 평가되므로, 가드 없이 두면 selected가 null일 때 `selected.aptNm`이 터진다.
  // 빌드의 prerender 단계가 이걸 잡아준다.
  const detailContent = selected && detail && (
    <DetailPanel
      selected={selected}
      detail={detail}
      info={info}
      isMobile={isMobile}
      onClose={() => setSelected(null)}
      regionLabel={regionLabel}
      months={MONTHS}
      yoy={rank.get(`${selected.umdNm}|${selected.aptNm}`)?.yoyPct}
      rankMedian={rankMedian}
      isFav={isSelectedFav}
      onToggleFavorite={toggleFavorite}
      inCompare={compare.has({ lawdCd, umdNm: selected.umdNm, aptNm: selected.aptNm })}
      onToggleCompare={() => {
        const r = compare.toggle({ lawdCd, umdNm: selected.umdNm, aptNm: selected.aptNm });
        if (r.full) alert("비교는 최대 4곳까지예요. ⚖️ 비교 탭에서 하나를 빼고 담아 주세요.");
      }}
      regulated={regulated}
      priceBasis={priceBasis}
      setPriceBasis={setPriceBasis}
      onShowHelp={() => setShowHelp(true)}
      hasProfile={hasProfile}
      onOpenProfile={() => { setShowProfile(true); setShowFavs(false); }}
      excluded={excluded}
      loanForGroup={loanForGroup}
      trendArea={trendArea}
      setTrendArea={setTrendArea}
      trend={trend}
      trendMonths={trendMonths}
      setTrendMonths={setTrendMonths}
      isOwnedPyeong={isOwnedPyeong}
      onToggleOwned={toggleOwned}
      showCost={showCost}
      setShowCost={setShowCost}
      profile={profile}
      assets={assets}
    />
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* 지도를 보면서 눌러야 하는 컨트롤 — 패널/시트 밖에 직접 둔다.
          모바일은 시트가 열려 있으면 가려지므로 숨긴다.
          ⚠️ 데스크톱에서 right 정렬 금지 — 세부패널(right:14, width:320, 전체높이)이 덮어
             클릭이 안 된다. 좌우 패널 사이 빈 지도 영역(left:368)에 둔다. */}
      {!(isMobile && (settingsOpen || selected || listSnap !== "peek")) && (
        <button
          onClick={() => locateMe()}
          disabled={locating}
          style={{
            ...locateBtn,
            // 모바일: 접힌 목록 시트(peek) 바로 위 — 시트·탭바 높이를 따라간다.
            ...(isMobile
              ? { left: "auto", right: 14, bottom: `calc(${TABBAR_H}px + env(safe-area-inset-bottom) + ${SNAP_H.peek + 12}px)` }
              : null),
          }}
          title="현위치로 이동"
          aria-label="현위치로 이동"
        >
          {locating ? "⏳" : "📍"}
        </button>
      )}

      {regionToast && (
        <div style={{ ...regionToastBox, ...(isMobile ? { top: 60 } : { top: 18 }) }}>
          <span>📍 {regionName(regionToast.to)}로 이동했어요</span>
          <button
            onClick={() => {
              const back = regionToast.from;
              setRegionToast(null);
              fitRef.current = true; // 되돌아간 지역 전체가 보이게
              setLawdCd(back);
            }}
            style={regionToastBtn}
          >
            ↩︎ {regionName(regionToast.from)}
          </button>
        </div>
      )}

      {isMobile ? (
        <>
          <MobileTopBar
            summary={shortSummary}
            hasFilter={hasFilter}
            onOpenSettings={() => setSettingsOpen(true)}
            onRefresh={() => loadTrades(lawdCd, { refresh: true })}
            refreshing={loading}
          />
          {/* ⚠️ 설정과 지도 시트는 동시에 렌더하지 않는다 — "한 번에 하나" 성질(겹침 구조적 불가) 유지 */}
          {settingsOpen ? (
            <MobileSheet open onClose={closeSettings}>
              {controlPanelContent}
            </MobileSheet>
          ) : (
            <MapSheet
              snap={listSnap}
              setSnap={setListSnap}
              title={`📋 ${shortSummary}`}
              detail={detailContent ? <div style={detailPanelStyle}>{detailContent}</div> : null}
              detailTitle={selected?.aptNm}
              onBack={closeDetail}
              onClose={() => {
                closeDetail();
                setListSnap("peek");
              }}
              list={listContent}
            />
          )}
        </>
      ) : (
        <>
          <div style={controlPanelStyle}>
            {controlPanelContent}
            {listContent}
          </div>
          {detailContent && <div style={detailPanelStyle}>{detailContent}</div>}
        </>
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      <style>{MAP_CSS}</style>
    </div>
  );
}
