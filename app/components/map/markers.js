// 지도 핀(카카오 CustomOverlay) 동기화 + 핀·리스트 행 CSS. 2026-10-25 KakaoMap.js에서 분리.
// ⚠️ 호출 경로는 KakaoMap의 마커 렌더 effect **하나뿐**이어야 한다 — fetch 끝난 자리 등에서 직접
//    부르면 그 렌더의 클로저(옛 필터)로 그리고 굳는다(2026-08-30 stale 클로저 버그). 그래서 이 함수는
//    상태를 읽지 않고 필요한 값을 전부 인자로 받는다.

import { regionName } from "../../lib/regions";
import { formatManwon } from "../../lib/format";
import { C } from "../../lib/palette";

// rows(buildComplexRows — 리스트와 공유하는 배열)와 ★ 목록을 핀으로 맞춘다. overlays = Map(key → 항목).
// 반환: { bounds, shown, trades, buyable } — 자동 맞춤과 상태 줄에 쓴다.
// ⚠️ 오버레이는 **재사용**한다 — 필터를 한 번 바꿀 때마다 수백 개를 파괴/재생성하면 지도가 눈에 띄게
//    멈칫한다(2026-07-29). 이번에 살아남은 키를 모아 두고 나머지만 걷어낸다. 새 핀 종류도 upsert로.
// ⚠️ 키에 lawdCd를 포함할 것 — 지역 전환 시 동명 단지가 남지 않게.
export function syncMarkers({ kakao, map, overlays, rows, lawdCd, favorites, affordMode, onSelect, onGotoFavorite }) {
  const alive = new Set();
  const upsert = (key, lat, lng, cls, html, onClick) => {
    alive.add(key);
    let e = overlays.get(key);
    if (!e) {
      const el = document.createElement("div");
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(lat, lng),
        content: el,
        yAnchor: 1.2,
      });
      overlay.setMap(map);
      e = { overlay, el, lat, lng, cls: "", html: "" };
      overlays.set(key, e);
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
  let shown = 0;
  let trades = 0;
  let buyable = 0;

  for (const r of rows) {
    const c = r.c;
    if (c.lat == null) continue; // 지오코딩 실패 단지 — 리스트엔 남지만 핀은 못 찍는다
    bounds.extend(new kakao.maps.LatLng(c.lat, c.lng));
    shown += 1;
    trades += r.count;

    // 구매가능: 어떤 평형이든 보유자산으로 필요자금을 댈 수 있으면(최대 여유 ≥ 0) true.
    // 자금 설정이 없으면 null → 색칠하지 않고 즐겨찾기 금색을 살린다.
    const ok = affordMode ? r.buyable : null;
    if (ok) buyable += 1;

    let cls = "trade-pin";
    if (ok === true) cls += " trade-pin--ok";
    else if (ok === false) cls += " trade-pin--no";
    else if (r.isFav) cls += " trade-pin--fav"; // 색칠모드 아닐 때만 금색
    upsert(
      `c:${lawdCd}|${c.umdNm}|${c.aptNm}`,
      c.lat,
      c.lng,
      cls,
      // 🔥 = 1년 급등(지역 대비 상대 기준, buildComplexRows의 hot)
      `<b>${r.isFav ? "★ " : ""}${r.hot ? "🔥 " : ""}평균 ${formatManwon(r.avg)}</b><span>${c.aptNm}</span>`,
      () => onSelect(c)
    );
  }

  // 타지역 즐겨찾기: 현재 지역 밖의 ★도 핀으로 함께 표시한다. 그 지역 거래는 안 불러왔으므로 가격이
  // 없음 → 지역명만 보여주고, 클릭하면 그 지역으로 이동. (현재 지역 ★는 위 루프가 금색 가격 핀으로 그림.)
  for (const f of favorites) {
    if (f.lat == null || f.lawd_cd === lawdCd) continue;
    upsert(
      `f:${f.lawd_cd}|${f.umd_nm}|${f.apt_nm}`,
      f.lat,
      f.lng,
      "trade-pin trade-pin--fav trade-pin--away",
      `<b>★ ${regionName(f.lawd_cd)}</b><span>${f.apt_nm}</span>`,
      () => onGotoFavorite(f)
    );
  }

  // 이번 렌더에서 빠진 오버레이만 지운다.
  for (const [key, e] of overlays) {
    if (!alive.has(key)) {
      e.overlay.setMap(null);
      overlays.delete(key);
    }
  }
  return { bounds, shown, trades, buyable };
}

// 핀·현위치 점·리스트 행(.cx-row) 스타일. 인라인 스타일로는 :hover·애니메이션을 못 써서 <style>로 둔다.
export const MAP_CSS = `
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
`;
