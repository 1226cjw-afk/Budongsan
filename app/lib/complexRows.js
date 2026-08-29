// 단지 행 파생 — 필터 → 집계 → 배지·자금여유 계산 → 정렬. 순수 함수(의존성: tradeStats뿐).
//
// ⚠️ **지도 마커와 리스트 패널이 이 한 곳에서 같은 행 배열을 받아 쓴다.** 예전엔
//    renderMarkers와 listRows useMemo가 filterTrades → summarize → bestFit을 **각자
//    따로 적었다**. 같은 헬퍼를 부르긴 했지만 호출부가 둘이라 ① 필터 한 번 바꿀 때마다
//    단지 수백 곳의 대출 계산이 두 번 돌았고 ② 한쪽 호출부만 인자를 빠뜨리면 조용히 갈라졌다
//    (2026-08-14 농특세 사고가 정확히 이 계열이다 — build도 npm test도 못 잡는다).
//    행을 만드는 경로를 하나로 두면 그 갈라짐이 **구조적으로 불가능**해지고, 여기 있는 한
//    순수 함수라 테스트가 잡아준다.
// ⚠️ 여기서 만든 배열은 마커·리스트가 공유하므로 **in-place 정렬 금지**(sortComplexRows가 복사한다).

// ⚠️ 확장자 import 유지 — raw node(npm test)가 확장자 없는 경로를 못 찾아 ERR_MODULE_NOT_FOUND로
//    죽는다. 이 파일은 순수 로직이라 테스트 대상이므로 marketSignal.js·news.js와 같은 규칙을 따른다.
import { favKey, filterTrades, summarize, groupByPyeong } from "./tradeStats.js";
import { REBUILD_AGE } from "./mapFilters.js";

// 한 단지에서 "대출 가능 + 월납 상한 이내"인 평형 중 자금 여유가 최대인 것.
// 반환 {gap, monthly} — 조건을 만족하는 평형이 없으면 null.
// ⚠️ gap과 monthly는 반드시 **같은 평형**에서 나와야 한다. 평형을 넘나들며 고르면
//    "A평형은 살 수 있고 B평형은 월납이 싸다"는 이유로 못 사는 단지가 통과한다.
// loanForGroup은 호출부(KakaoMap)가 넘긴다 — 자금 프로필·규제지역·기준가에 의존해
// 순수 함수로 만들 수 없는 부분을 여기 한 군데로 주입받는 형태.
export function bestFit(hits, { loanForGroup, monthlyCap = Infinity }) {
  let best = null;
  for (const g of groupByPyeong(hits)) {
    const { ln, gap } = loanForGroup(g);
    if (!ln || ln.maxLoan <= 0) continue;
    if (ln.monthlyPayment > monthlyCap) continue;
    if (!best || gap > best.gap) best = { gap, monthly: ln.monthlyPayment };
  }
  return best;
}

// 단지 배열 → 화면 행 배열(정렬 전). 거래가 필터를 통과 못 한 단지는 제외한다.
// fitFor(hits) = 자금 설정이 있을 때만 넘기는 bestFit 클로저. 없으면 자금 배지가 전부 꺼진다.
// ⚠️ 세대수(households)는 여기 넣지 않는다 — 나중에 lazy로 도착하는 값이라 행에 섞으면
//    세대수가 채워질 때마다 마커 전량이 다시 그려진다. 리스트가 렌더 시점에 따로 붙인다.
export function buildComplexRows({
  complexes,
  lawdCd,
  areaBand,
  priceBand,
  priceBasis,
  rankMap,
  favSet,
  fitFor = null,
  thisYear = new Date().getFullYear(),
}) {
  const rows = [];
  for (const c of complexes || []) {
    const hits = filterTrades(c.trades, areaBand, priceBand);
    const stat = summarize(hits);
    if (!stat) continue;
    const fit = fitFor ? fitFor(hits) : null;
    const gap = fit ? fit.gap : null;
    const key = favKey(lawdCd, c.umdNm, c.aptNm);
    const buildYear = Number(hits[0]?.buildYear) || null;
    rows.push({
      c,
      key,
      // 리스트에 보이는 대표가. 마커 라벨은 기준가와 무관하게 늘 평균이라 avg도 함께 싣는다.
      price: priceBasis === "recent" ? stat.recentAmount : stat.avg,
      avg: stat.avg,
      count: stat.count,
      yoy: rankMap?.get(`${c.umdNm}|${c.aptNm}`)?.yoyPct ?? null,
      buildYear,
      rebuild: buildYear != null && thisYear - buildYear >= REBUILD_AGE,
      gap,
      noLoan: !!fitFor && gap == null, // 대출 불가(다주택 규제 등) 또는 월납 상한 초과
      buyable: gap != null && gap >= 0,
      isFav: favSet?.has(key) ?? false,
    });
  }
  return rows;
}

// 정렬 기준. 값이 없는 행(yoy·gap null)은 항상 뒤로 보낸다.
const COMPARATORS = {
  yoy: (a, b) => (b.yoy ?? -Infinity) - (a.yoy ?? -Infinity),
  count: (a, b) => b.count - a.count,
  priceAsc: (a, b) => a.price - b.price,
  priceDesc: (a, b) => b.price - a.price,
  old: (a, b) => (a.buildYear ?? 9999) - (b.buildYear ?? 9999),
  gap: (a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity),
};

// ⚠️ 반드시 **복사본**을 정렬한다 — 입력 배열은 지도 마커도 함께 보는 공유 배열이라
//    in-place로 뒤집으면 마커 렌더 순서가 정렬에 따라 흔들린다.
export function sortComplexRows(rows, sortBy) {
  const cmp = COMPARATORS[sortBy];
  return cmp ? [...rows].sort(cmp) : rows;
}
