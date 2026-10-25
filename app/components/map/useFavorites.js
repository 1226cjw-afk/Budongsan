"use client";

// ★ 즐겨찾기 — 목록·담기/빼기·D-day 편집. 2026-10-25 KakaoMap.js에서 분리.
// ⚠️ removeFavorite은 **지도 상태에 전혀 의존하지 않는다** — 그 이유는 함수 주석 참조. 지우지 말 것.

import { useEffect, useMemo, useState } from "react";
import { favKey } from "../../lib/tradeStats";

const favUrl = ({ lawdCd, umdNm, aptNm }) =>
  `/api/favorites?lawdCd=${lawdCd}&umdNm=${encodeURIComponent(umdNm)}&aptNm=${encodeURIComponent(aptNm)}`;

export default function useFavorites() {
  const [favorites, setFavorites] = useState([]);
  const [favEdit, setFavEdit] = useState(null); // 즐겨찾기 D-day 인라인 편집 {id, leaseEnd, note, noteDate}
  const [favDdayErr, setFavDdayErr] = useState("");

  const favSet = useMemo(
    () => new Set(favorites.map((f) => favKey(f.lawd_cd, f.umd_nm, f.apt_nm))),
    [favorites]
  );

  async function loadFavorites() {
    try {
      const d = await fetch("/api/favorites").then((r) => r.json());
      if (d.favorites) setFavorites(d.favorites);
    } catch {
      /* 무시 */
    }
  }
  useEffect(() => {
    loadFavorites();
  }, []);

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
  //    있어야만 그려지고(map/markers.js), 타지역 ★ 폴백은 현재 지역을 제외하기 때문이다.
  //    그러면 해제할 방법이 아예 없어진다(2026-08-15 구로구 예원아파트 실제 발생:
  //    거래는 멀쩡히 있었지만 94.63㎡ = 공급 38평이라 평형 필터에 걸려 사라져 있었다).
  //    그래서 이 경로는 **지도 상태에 전혀 의존하지 않는다**.
  async function removeFavorite(f) {
    if (!confirm(`★ ${f.apt_nm} 을(를) 즐겨찾기에서 지울까요?`)) return;
    await fetch(favUrl({ lawdCd: f.lawd_cd, umdNm: f.umd_nm, aptNm: f.apt_nm }), { method: "DELETE" });
    if (favEdit?.id === f.id) setFavEdit(null); // 편집 중이던 행이 사라지면 열린 폼도 닫는다
    loadFavorites();
  }

  // 지도에서 고른 단지 ★ 담기/빼기. target = {lawdCd, umdNm, aptNm, lat, lng}.
  async function toggleFavorite(target) {
    if (favSet.has(favKey(target.lawdCd, target.umdNm, target.aptNm))) {
      await fetch(favUrl(target), { method: "DELETE" });
    } else {
      await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
    }
    loadFavorites();
  }

  return {
    favorites, favSet,
    toggleFavorite, removeFavorite,
    favEdit, setFavEdit, favDdayErr, setFavDdayErr, saveFavDday,
  };
}
