"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_REGIONS, regionName } from "../lib/regions";
import { loanCalcFor, isRegulated } from "../lib/loanPolicy";
import { C } from "../lib/palette";
import { kstDate, formatManwon } from "../lib/format";
import { favKey, distMeters, summarize, groupByPyeong } from "../lib/tradeStats";
import { countNew } from "../lib/briefingSeen";
import {
  AREA_FILTERS, PRICE_FILTERS, MONTHLY_FILTERS, bandFor,
  HOT_PCT, SORT_OPTIONS, SORT_GAP, matchesComplexName,
} from "../lib/mapFilters";
import { bestFit, buildComplexRows, sortComplexRows } from "../lib/complexRows";
import HelpModal from "./HelpModal";
import { MobileTopBar, MobileSheet } from "./MobileShell";
import ControlPanel from "./map/ControlPanel";
import ComplexList from "./map/ComplexList";
import DetailPanel from "./map/DetailPanel";
import {
  controlPanel, detailPanel, pillBtn, locateBtn, regionToastBox, regionToastBtn,
} from "./mapStyles";

// 카카오맵 + 국토부 실거래가. 지도 이동 시 중심 지역을 자동 인식해 그 시군구 데이터를 로드하고,
// 단지 클릭(또는 지도 빈 곳 클릭→가까운 단지) 시 우측 패널에 평형별 시세·대출 분석을 보여준다.
//
// 이 파일에 남긴 것: 지도 SDK·상태·데이터 로딩·마커 렌더. 화면 조각은 components/map/에,
// 순수 파생(행 만들기·정렬)은 lib/complexRows.js에 있다.
// ⚠️ 새 기능을 넣을 땐 여기 쌓기 전에 분리 가능한지 먼저 볼 것 — 이 파일은 두 번 비대해졌다
//    (2026-07-12 리팩토링으로 1263줄 → 2026-08-15에 다시 1791줄).

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
const VIEW_KEY = "re_map_view"; // 마지막으로 보던 지도 위치(지역·중심·확대) — 재방문 복원용

const LIST_INFO_TOP = 30; // 세대수 lazy 조회 대상: 정렬 상위 N개 행

// 뉴스 📢 요주의 단지 카드에서 넘어온 딥링크(/?lawdCd=11530&q=구로주공).
// ⚠️ useSearchParams가 아니라 location.search를 쓴다 — localStorage와 같은 이유로 마운트
//    이후에만 읽어야 하고(하이드레이션), App Router에서 useSearchParams는 Suspense 경계를
//    요구해 이 클라이언트 컴포넌트 하나 때문에 트리를 손대야 한다.
function readDeepLink() {
  try {
    const p = new URLSearchParams(window.location.search);
    const lawdCd = p.get("lawdCd");
    if (!lawdCd || !VALID_CODES.has(lawdCd)) return null;
    return { lawdCd, q: p.get("q") || "" };
  } catch {
    return null;
  }
}

// 마지막으로 보던 지도 위치. 새로고침·재방문 시 그 자리에서 이어 보게 한다.
// ⚠️ localStorage는 클라이언트에만 있으므로 반드시 마운트 이후(지도 초기화 effect)에만 부른다 —
//    useState 초기값으로 읽으면 서버 렌더와 어긋나 하이드레이션이 깨진다.
function readSavedView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
    if (!v || !Number.isFinite(v.lat) || !Number.isFinite(v.lng)) return null;
    return v;
  } catch {
    return null;
  }
}
function writeSavedView(v) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    /* 무시 */
  }
}

// 대출 계산용 내 자금 프로필. 단위: 만원(보유자산/연소득/기존상환액), % (금리), 년(만기).
const PROFILE_KEY = "re_loan_profile";
const COST_NOTICE_KEY = "re_cost_notice_seen"; // 부대비용 반영 안내를 본 적 있는지
const DEFAULT_PROFILE = {
  assets: "",        // 보유자산(여유 현금)
  income: "",        // 연소득
  existingDebt: "",  // 기존 대출 연 원리금상환액
  monthlySaving: "", // 월 저축 가능액 — "얼마 더 모으면 되나" 계산용(선택)
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

  // 오버레이는 key → {overlay, el} 로 재사용한다(전량 파괴/재생성 금지 — renderMarkers 참조).
  const overlaysRef = useRef(new Map());
  const dataRef = useRef(null); // 지도 클릭 핸들러(초기화 때 만든 고정 클로저)가 최신 거래를 참조
  const lawdCdRef = useRef(DEFAULT_CODE); // idle 핸들러가 최신 지역 코드 참조
  const fitRef = useRef(true); // 다음 렌더에서 지도 영역 자동 맞춤 여부
  const favoritesRef = useRef([]); // 타지역 즐겨찾기 마커용 — 좌표 포함 전체 목록
  const suppressIdleRef = useRef(0); // 코드가 지도를 옮긴 시각 — 지역 재판정 억제 창
  const idleTimerRef = useRef(null); // idle 디바운스 타이머
  const myLocRef = useRef(null); // 현위치 점 오버레이

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("지도 로딩 중…");
  const [lawdCd, setLawdCd] = useState(DEFAULT_CODE);
  const [area, setArea] = useState("all");
  const [price, setPrice] = useState("all");
  const [monthly, setMonthly] = useState("all"); // 월 상환액 상한
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
  const [showCost, setShowCost] = useState(null); // 부대비용 내역 펼친 평형(m2) | null
  const [showCostNotice, setShowCostNotice] = useState(false);
  const [isMobile, setIsMobile] = useState(false); // 좁은 화면 → 패널을 시트/상단바로
  const [newsNew, setNewsNew] = useState(0); // 브리핑 미확인 단지 수 (📰 배지)
  const [excluded, setExcluded] = useState(null); // {cancelled, direct} 시세에서 뺀 거래 수
  const [regionToast, setRegionToast] = useState(null); // 자동 지역 전환 알림 {from, to}
  const [myLoc, setMyLoc] = useState(null); // 현위치 {lat, lng}
  const [locating, setLocating] = useState(false);

  const [tradesData, setTradesData] = useState(null);
  const [rank, setRank] = useState(new Map()); // `${umd}|${apt}` → {yoyPct, recentN, pastN}
  const [sortBy, setSortBy] = useState("yoy");
  const [onlyBuyable, setOnlyBuyable] = useState(false); // 구매가능 단지만 (자금 설정 시)
  const [nameQuery, setNameQuery] = useState(""); // 리스트 이름 검색(딥링크 q로도 채워진다)
  const pendingPickRef = useRef(false); // 딥링크 착지 후 결과가 1곳이면 자동 선택(1회성)

  const [sheet, setSheet] = useState(null);
  const [householdMap, setHouseholdMap] = useState(new Map()); // favKey → 세대수|null (lazy)
  const infoInflightRef = useRef(new Set()); // 세대수 조회 중복 방지

  const [favEdit, setFavEdit] = useState(null); // 즐겨찾기 D-day 인라인 편집 {id, leaseEnd, note, noteDate}
  const [favDdayErr, setFavDdayErr] = useState("");

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
    favoritesRef.current = favorites;
  }, [favorites]);
  useEffect(() => {
    lawdCdRef.current = lawdCd;
  }, [lawdCd]);

  // 모바일: 단지가 선택되면 세부 시트로 전환한다. 슬롯이 하나라 설정·목록 시트는
  // 자동으로 닫히고, 따라서 상단 바와 겹칠 패널이 애초에 존재하지 않는다.
  useEffect(() => {
    if (!isMobile) return;
    if (selected) setSheet("detail");
    else setSheet((s) => (s === "detail" ? null : s));
  }, [selected, isMobile]);

  const detail = useMemo(() => {
    if (!selected) return null;
    const ts = selected.trades || [];
    return { overall: summarize(ts), buildYear: ts[0]?.buildYear, groups: groupByPyeong(ts) };
  }, [selected]);

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
  const affordMode = hasProfile && assets > 0;

  // 마커·리스트 계산에 실제로 영향을 주는 자금 입력만 추린 키(문자열이라 얕은 비교가 통한다).
  // ⚠️ profile 객체를 그대로 deps에 넣으면 자금 입력창에 **한 글자 칠 때마다** 객체가 새로 만들어져
  //    마커 수백 개가 통째로 다시 그려진다 — 입력이 끊기는 주된 원인이었다.
  const loanKey = [
    assets, incomeNum, profile.existingDebt, profile.rate,
    profile.termYears, profile.householdType, profile.isFirstTime,
  ].join("|");

  // 자금 프로필 → 대출 계산기. 브리핑 카드 3종과 **같은 어댑터**(loanCalcFor)를 쓴다 —
  // 인자를 손으로 조립하던 시절엔 화면마다 한 필드씩 어긋날 여지가 있었다.
  const loanForPrice = loanCalcFor(profile, assets);

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

  // 지도 초기화 (1회) — services 라이브러리로 좌표→지역 변환 + 빈 곳 클릭→가까운 단지.
  useEffect(() => {
    const KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    const SCRIPT_ID = "kakao-map-sdk";

    function initMap() {
      window.kakao.maps.load(() => {
        const kakao = window.kakao;
        // 지난번 보던 자리부터 복원. 없으면 기본 위치로 띄우고 아래에서 현위치를 물어본다.
        // ⚠️ 딥링크가 저장된 위치를 **이긴다**. 안 그러면 📢 요주의 단지에서 링크로 들어와도
        //    마지막에 보던 지역으로 되돌아가, 링크가 아무 일도 안 한 것처럼 보인다.
        const link = readDeepLink();
        const saved = link ? null : readSavedView();
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(saved?.lat ?? DEFAULT_CENTER.lat, saved?.lng ?? DEFAULT_CENTER.lng),
          level: saved?.level ?? 5,
        });
        mapRef.current = map;
        geocoderRef.current = new kakao.maps.services.Geocoder();
        suppressIdleRef.current = Date.now(); // 생성 직후 첫 idle은 판정하지 않는다

        if (link) {
          // 좌표를 모르는 채 지역만 아는 상태 → 데이터가 오면 지역 전체를 자동 맞춤한다
          // (좌표 없는 옛 즐겨찾기를 여는 gotoFavorite 폴백과 같은 경로).
          fitRef.current = true;
          lawdCdRef.current = link.lawdCd;
          setLawdCd(link.lawdCd);
          if (link.q) {
            setNameQuery(link.q);
            pendingPickRef.current = true;
            setSheet("list"); // 모바일: 목록 시트를 열어 착지 결과를 바로 보여준다
          }
          // 주소창을 정리한다 — 안 지우면 사용자가 지도를 옮긴 뒤 새로고침할 때마다
          // 딥링크가 다시 발동해 원래 자리로 끌려간다.
          window.history.replaceState({}, "", "/");
        } else if (saved && VALID_CODES.has(saved.lawdCd)) {
          fitRef.current = false; // 복원한 위치를 자동 맞춤(setBounds)이 덮지 않도록
          lawdCdRef.current = saved.lawdCd;
          setLawdCd(saved.lawdCd);
        }

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
        if (!saved) locateMe({ initial: true });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 대기 중인 idle 디바운스 타이머 정리(언마운트 후 setState 방지).
  useEffect(() => () => clearTimeout(idleTimerRef.current), []);

  useEffect(() => {
    loadFavorites();
  }, []);

  // 브리핑 미확인 개수 — 📰 배지용. 캐시 전용 라우트라 가볍고, 실패하면 배지만 생략한다.
  // ready 이후에 걸어 지도 초기 로드를 지연시키지 않는다.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    fetch("/api/briefing")
      .then((r) => r.json())
      .then((d) => alive && setNewsNew(countNew(d.complexes)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready]);

  // 내 자금 프로필 복원(로컬 저장).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved) setProfile((p) => ({ ...p, ...JSON.parse(saved) }));
    } catch {
      /* 무시 */
    }
  }, []);

  // 부대비용 반영 안내 — 자금을 설정해 둔 기존 사용자에게만, 최초 1회.
  // 필요자금이 갑자기 커 보여 "고장났나" 싶은 것을 막는다.
  useEffect(() => {
    if (!hasProfile) return;
    try {
      if (!localStorage.getItem(COST_NOTICE_KEY)) setShowCostNotice(true);
    } catch {
      /* 무시 */
    }
  }, [hasProfile]);

  function dismissCostNotice() {
    setShowCostNotice(false);
    try {
      localStorage.setItem(COST_NOTICE_KEY, "1");
    } catch {
      /* 무시 */
    }
  }

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
        // ⚠️ toISOString()은 UTC 날짜다 — 브라우저가 KST여도 00:00~08:59엔 어제가 찍혀
        //    "07-31 시세"로 저장된 스냅샷이 화면에 08-01로 보이지 않는다. 서버 쪽 날짜
        //    보정과 같은 함수를 쓴다(format.kstDate).
        capturedYmd: kstDate(),
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

  // 지역이 바뀌면 저장된 뷰의 지역도 맞춰 둔다 — 셀렉트로 바꾼 직후엔 지도가 아직 안 움직여
  // idle이 안 오므로, 이게 없으면 새로고침 때 좌표와 지역이 어긋난다.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const c = mapRef.current.getCenter();
    writeSavedView({ lawdCd, lat: c.getLat(), lng: c.getLng(), level: mapRef.current.getLevel() });
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

  // ★ 목록에서 직접 해제. toggleFavorite은 "지도에서 고른 단지"가 있어야 동작하는데,
  // ⚠️ 지도에 안 뜨는 ★ 단지가 실제로 생긴다 — 단지 핀은 면적·가격 필터를 통과한 거래가
  //    있어야만 그려지고(renderMarkers), 타지역 ★ 폴백은 현재 지역을 제외하기 때문이다.
  //    그러면 해제할 방법이 아예 없어진다(2026-08-15 구로구 예원아파트 실제 발생:
  //    거래는 멀쩡히 있었지만 94.63㎡ = 공급 38평이라 평형 필터에 걸려 사라져 있었다).
  //    그래서 이 경로는 **지도 상태에 전혀 의존하지 않는다**.
  async function removeFavorite(f) {
    if (!confirm(`★ ${f.apt_nm} 을(를) 즐겨찾기에서 지울까요?`)) return;
    await fetch(
      `/api/favorites?lawdCd=${f.lawd_cd}&umdNm=${encodeURIComponent(f.umd_nm)}&aptNm=${encodeURIComponent(f.apt_nm)}`,
      { method: "DELETE" }
    );
    if (favEdit?.id === f.id) setFavEdit(null); // 편집 중이던 행이 사라지면 열린 폼도 닫는다
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

  // ⚠️ 여기서 renderMarkers를 직접 부르지 않는다. 예전엔 fetch가 끝난 자리에서 바로 그렸는데,
  //    이 함수는 **호출된 렌더의 클로저**를 들고 있어 로딩 중에 사용자가 필터를 바꾸면
  //    바뀌기 전 필터로 마커를 그리고 끝났다(리스트는 최신 필터라 둘이 갈라짐).
  //    지금은 tradesData 상태만 갱신하고, 마커는 아래 effect가 최신 값으로 그린다.
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

  // 딥링크로 착지해 검색 결과가 **한 곳뿐이면** 그 단지를 자동으로 연다 — 거기까지 가야
  // "지도에서 보기"가 끝난 것이다(평형·시세·★ 버튼이 다 세부패널에 있다).
  // ⚠️ 한 번만 소비하는 ref다. 사용자가 검색창에 타이핑하다 우연히 1곳이 될 때마다
  //    패널이 튀어나오면 방해가 된다 — 자동 선택은 링크로 들어온 그 순간만이다.
  useEffect(() => {
    if (!pendingPickRef.current || !listRows) return;
    pendingPickRef.current = false;
    if (listRows.length === 1) selectComplex(listRows[0].c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRows]);

  function renderMarkers(rows) {
    const data = tradesData;
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!data || !kakao || !map) return;

    // 오버레이는 **재사용**한다 — 필터를 한 번 바꿀 때마다 수백 개를 파괴/재생성하면
    // 지도가 눈에 띄게 멈칫한다. 이번 렌더에 살아남은 키를 모아 두고 나머지만 걷어낸다.
    const alive = new Set();
    const upsert = (key, lat, lng, cls, html, onClick) => {
      alive.add(key);
      let e = overlaysRef.current.get(key);
      if (!e) {
        const el = document.createElement("div");
        const overlay = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(lat, lng),
          content: el,
          yAnchor: 1.2,
        });
        overlay.setMap(map);
        e = { overlay, el, lat, lng, cls: "", html: "" };
        overlaysRef.current.set(key, e);
      } else if (e.lat !== lat || e.lng !== lng) {
        e.overlay.setPosition(new kakao.maps.LatLng(lat, lng));
        e.lat = lat;
        e.lng = lng;
      }
      if (e.cls !== cls) { e.el.className = cls; e.cls = cls; }
      if (e.html !== html) { e.el.innerHTML = html; e.html = html; }
      e.el.onclick = onClick; // 속성 대입 — addEventListener와 달리 중복 등록되지 않는다
    };

    const bounds = new kakao.maps.LatLngBounds();
    let shownComplexes = 0;
    let shownTrades = 0;
    let buyableCount = 0;

    for (const r of rows) {
      const c = r.c;
      if (c.lat == null) continue; // 지오코딩 실패 단지 — 리스트엔 남지만 핀은 못 찍는다

      const pos = new kakao.maps.LatLng(c.lat, c.lng);
      bounds.extend(pos);
      shownComplexes += 1;
      shownTrades += r.count;

      // 구매가능: 어떤 평형이든 보유자산으로 필요자금을 댈 수 있으면(최대 여유 ≥ 0) true.
      // 자금 설정이 없으면 null → 색칠하지 않고 즐겨찾기 금색을 살린다.
      const buyable = affordMode ? r.buyable : null;
      if (buyable) buyableCount += 1;

      const hot = r.yoy != null && r.yoy >= HOT_PCT; // 1년 급등 단지는 핀에도 🔥
      let cls = "trade-pin";
      if (buyable === true) cls += " trade-pin--ok";
      else if (buyable === false) cls += " trade-pin--no";
      else if (r.isFav) cls += " trade-pin--fav"; // 색칠모드 아닐 때만 금색
      upsert(
        `c:${data.lawdCd}|${c.umdNm}|${c.aptNm}`,
        c.lat,
        c.lng,
        cls,
        `<b>${r.isFav ? "★ " : ""}${hot ? "🔥 " : ""}평균 ${formatManwon(r.avg)}</b><span>${c.aptNm}</span>`,
        () => setSelected(c)
      );
    }

    // 타지역 즐겨찾기: 현재 지역 밖의 즐겨찾기도 ★ 핀으로 함께 표시한다.
    // 그 지역 거래는 안 불러왔으므로 가격이 없음 → 지역명만 보여주고, 클릭하면 그 지역으로 이동.
    // (현재 지역 즐겨찾기는 위 루프에서 이미 금색 가격 핀으로 그림 → 중복 제외.)
    favoritesRef.current.forEach((f) => {
      if (f.lat == null || f.lawd_cd === data.lawdCd) return;
      upsert(
        `f:${f.lawd_cd}|${f.umd_nm}|${f.apt_nm}`,
        f.lat,
        f.lng,
        "trade-pin trade-pin--fav trade-pin--away",
        `<b>★ ${regionName(f.lawd_cd)}</b><span>${f.apt_nm}</span>`,
        () => gotoFavorite(f)
      );
    });

    // 이번 렌더에서 빠진 오버레이만 지운다.
    for (const [key, e] of overlaysRef.current) {
      if (!alive.has(key)) {
        e.overlay.setMap(null);
        overlaysRef.current.delete(key);
      }
    }

    if (fitRef.current && shownComplexes) {
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
    const buyTag = affordMode && shownComplexes ? ` · 🟢 구매가능 ${buyableCount}/${shownComplexes}곳` : "";
    setStatus(
      shownComplexes
        ? `${regionName(data.lawdCd)} · 최근 ${MONTHS}개월${tags ? " · " + tags : ""} · 거래 ${shownTrades}건 / 단지 ${shownComplexes}곳${buyTag}`
        : `${regionName(data.lawdCd)} · 최근 ${MONTHS}개월${tags ? " · " + tags : ""} · 조건에 맞는 거래 없음`
    );
  }

  // 마커는 오직 여기서만 그린다(단일 경로). baseRows가 바뀔 때마다 = 데이터·필터·자금·순위가
  // 바뀔 때마다 최신 값으로 다시 그려진다.
  // ⚠️ 지역 전환 중 stale 렌더 방지 가드를 지우지 말 것 — 옛 지역 데이터로 setBounds가 실행되면
  //    fitRef가 소진돼 새 지역으로 지도가 안 움직이고, idle 핸들러가 지역을 되돌린다.
  useEffect(() => {
    if (!ready || !baseRows || !tradesData) return;
    if (tradesData.lawdCd !== lawdCd) return;
    renderMarkers(baseRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, baseRows, tradesData, lawdCd, favorites]);

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
      try {
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
      } finally {
        // 요청이 끝나면(성공/중단 무관) inflight에서 해제. 중단(alive=false) 시에도 해제해야
        // 키가 남아 세대수를 영영 못 부르는 걸 막는다 — rank 도착 등으로 listRows가 자주 바뀜.
        targets.forEach((r) => infoInflightRef.current.delete(r.key));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRows, lawdCd]);

  // 리스트 행 클릭 → 단지 선택 + 지도 이동(자동맞춤 없이 그 위치로).
  function selectComplex(c) {
    setSelected(c);
    if (c.lat != null && mapRef.current) {
      fitRef.current = false;
      moveMap(() => mapRef.current.panTo(new window.kakao.maps.LatLng(c.lat, c.lng)));
    }
  }

  function selectRegion(code) {
    fitRef.current = true;
    setRegionToast(null); // 직접 고른 지역 — 자동 전환 알림은 필요 없다
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
    setLawdCd(f.lawd_cd);
  }

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

  // 모바일: 상단은 1줄 바(MobileTopBar), 컨트롤·목록·세부는 전부 하단 시트 하나로.
  //   시트 슬롯이 단일 상태(sheet)라 동시에 둘 이상 열릴 수 없다 = 겹침 구조적 불가.
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
      newsNew={newsNew}
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
      onOpenList={() => { setSheet("list"); setShowFavs(false); setShowProfile(false); }}
      showCostNotice={showCostNotice}
      onDismissCostNotice={dismissCostNotice}
      profile={profile}
      updateProfile={updateProfile}
      owned={owned}
      ownedSalePrice={ownedSalePrice}
      ownedNet={ownedNet}
      favProps={{
        onGoto: gotoFavorite,
        onRemove: removeFavorite,
        favEdit, setFavEdit,
        favDdayErr, setFavDdayErr,
        onSave: saveFavDday,
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
      {!(isMobile && sheet) && (
        <button
          onClick={() => locateMe()}
          disabled={locating}
          style={{ ...locateBtn, ...(isMobile ? { left: "auto", right: 14, bottom: 16 } : null) }}
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
            onOpenSettings={() => setSheet("settings")}
            onRefresh={() => loadTrades(lawdCd, { refresh: true })}
            refreshing={loading}
            newsNew={newsNew}
          />
          <MobileSheet
            open={sheet != null}
            onClose={() => {
              if (sheet === "detail") setSelected(null); // effect가 sheet도 null로 되돌린다
              else setSheet(null);
            }}
          >
            {sheet === "settings" && (
              <>
                {controlPanelContent}
                <button onClick={() => setSheet("list")} style={pillBtn}>
                  📋 단지 목록 보기
                </button>
              </>
            )}
            {sheet === "list" && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                  📋 {regionLabel} 단지 목록
                </div>
                {listContent}
              </>
            )}
            {sheet === "detail" && detailContent && (
              <div style={detailPanelStyle}>{detailContent}</div>
            )}
          </MobileSheet>
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
        /* 현위치 점 — 단지 핀과 헷갈리지 않게 파란 원 + 옅은 링. */
        .my-loc-dot {
          width: 14px; height: 14px; border-radius: 50%;
          background: #2563eb; border: 2.5px solid #fff;
          box-shadow: 0 0 0 5px rgba(37,99,235,0.22), 0 1px 4px rgba(15,23,42,0.35);
          transform: translate(-50%, -50%);
        }
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
