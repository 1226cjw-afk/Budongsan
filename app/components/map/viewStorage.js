// 지도 첫 화면을 정하는 브라우저 저장소 — 딥링크(?lawdCd=&q=)와 마지막으로 보던 위치(re_map_view).
// 2026-10-25 KakaoMap.js에서 분리. ⚠️ 전부 **마운트 이후에만** 부를 것 — location·localStorage는
// 클라이언트에만 있어 useState 초기값으로 읽으면 서버 렌더와 어긋나 하이드레이션이 깨진다.

const VIEW_KEY = "re_map_view"; // {lawdCd, lat, lng, level} — idle마다 저장, 재방문 복원

// 외부에서 들어온 딥링크(/?lawdCd=11530&q=구로주공). 앱 안(🔥 오늘 탭)에선 focusComplex를 쓴다.
// ⚠️ 한 번 소비한 링크는 같은 탭 세션에서 다시 발동하지 않는다(LINK_SEEN_KEY). 주소창 정리만으론
//    부족했다 — 탭 셸에서 <Link href="/">로 돌아오면 Next 라우터가 첫 로드 URL(`/?lawdCd=…`)을
//    되살린다(2026-09-29 로컬 prod 실측. replaceState 즉시·지연, router.replace 즉시·지연 4가지 모두
//    실패 — 정적 프리렌더 라우트의 캐시 URL로 보인다). 그 상태로 새로고침하면 딥링크가 다시 발동해
//    보던 자리에서 끌려간다.
const LINK_SEEN_KEY = "re_link_seen";

// ⚠️ useSearchParams가 아니라 location.search를 쓴다 — 마운트 이후에만 읽어야 하고(하이드레이션),
//    App Router에서 useSearchParams는 Suspense 경계를 요구해 이 컴포넌트 하나 때문에 트리를 손대야 한다.
export function readDeepLink(validCodes) {
  try {
    const p = new URLSearchParams(window.location.search);
    const lawdCd = p.get("lawdCd");
    if (!lawdCd || !validCodes.has(lawdCd)) return null;
    if (sessionStorage.getItem(LINK_SEEN_KEY) === window.location.search) return null; // 이미 소비함
    return { lawdCd, q: p.get("q") || "" };
  } catch {
    return null;
  }
}

// 딥링크를 소비했다고 남긴다 — **페이지를 떠날 때**. 읽는 순간 남기면 dev StrictMode의 effect 2회
// 실행에서 두 번째가 링크를 "이미 소비함"으로 보고 버린다.
export function markLinkConsumedOnLeave() {
  const consumed = window.location.search;
  window.addEventListener(
    "pagehide",
    () => {
      try {
        sessionStorage.setItem(LINK_SEEN_KEY, consumed);
      } catch {
        /* 무시 */
      }
    },
    { once: true }
  );
}

// 마지막으로 보던 지도 위치. 새로고침·재방문 시 그 자리에서 이어 보게 한다.
export function readSavedView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
    if (!v || !Number.isFinite(v.lat) || !Number.isFinite(v.lng)) return null;
    return v;
  } catch {
    return null;
  }
}

export function writeSavedView(v) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    /* 무시 */
  }
}
