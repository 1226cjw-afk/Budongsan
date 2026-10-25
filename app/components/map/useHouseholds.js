"use client";

// 리스트 상위 N개 행의 세대수 lazy 조회(/api/complex-info POST 일괄 — 서버가 kapt_cache 조회).
// 반환: Map(favKey → 세대수|null). 2026-10-25 KakaoMap.js에서 분리.
// ⚠️ 세대수는 행(buildComplexRows)에 넣지 않는다 — 늦게 도착해 마커까지 다시 그리게 된다. 리스트가 렌더 때 붙인다.

import { useEffect, useRef, useState } from "react";

const LIST_INFO_TOP = 30; // 세대수 lazy 조회 대상: 정렬 상위 N개 행

export default function useHouseholds(listRows, lawdCd) {
  const [householdMap, setHouseholdMap] = useState(new Map());
  const inflightRef = useRef(new Set()); // 조회 중 키 — 중복 요청 방지

  useEffect(() => {
    if (!listRows) return;
    const targets = listRows
      .slice(0, LIST_INFO_TOP)
      .filter((r) => !householdMap.has(r.key) && !inflightRef.current.has(r.key));
    if (!targets.length) return;
    targets.forEach((r) => inflightRef.current.add(r.key));
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
        // ⚠️ 요청이 끝나면(성공/중단 무관) inflight에서 해제. 중단(alive=false) 시에도 해제해야
        //    키가 남아 세대수를 영영 못 부르는 걸 막는다 — rank 도착 등으로 listRows가 자주 바뀐다
        //    (2026-07-21 수정: 안 하면 세대수가 세션 내내 안 떴다).
        targets.forEach((r) => inflightRef.current.delete(r.key));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRows, lawdCd]);

  return householdMap;
}
