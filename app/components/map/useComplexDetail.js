"use client";

// 선택한 단지의 세부 데이터 — 평형 요약(파생) + 월별 추세(/api/trend) + 세대수(/api/complex-info).
// 2026-10-25 KakaoMap.js에서 분리. lawdCd는 선택 시점 값으로 충분해 deps에서 뺐다(단지가 바뀌면 다시 돈다).

import { useEffect, useMemo, useState } from "react";
import { summarize, groupByPyeong } from "../../lib/tradeStats";

export default function useComplexDetail(selected, lawdCd) {
  const detail = useMemo(() => {
    if (!selected) return null;
    const ts = selected.trades || [];
    return { overall: summarize(ts), buildYear: ts[0]?.buildYear, groups: groupByPyeong(ts) };
  }, [selected]);

  const [trend, setTrend] = useState({ loading: false, series: null });
  const [trendArea, setTrendArea] = useState(null); // null=전체, 정수 m2=특정 평형
  const [trendMonths, setTrendMonths] = useState(12); // 추세 기간: 12(1년) | 36(3년)
  const [info, setInfo] = useState({ loading: false, data: null }); // 세대수 등 부가정보

  // 단지 바뀌면 추세를 '가장 거래 많은 평형'으로 초기화. 추세는 평형별만 본다
  // (전체는 평형이 섞여 시세가 들쭉날쭉 → 추세 의미가 흐려짐).
  // ⚠️ 아래 추세 fetch effect보다 **먼저** 선언돼 있어야 한다(같은 커밋에서 평형이 먼저 정해진다).
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

  return { detail, trend, trendArea, setTrendArea, trendMonths, setTrendMonths, info };
}
