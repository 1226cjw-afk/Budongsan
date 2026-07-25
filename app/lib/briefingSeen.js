// 브리핑 🆕 판정 — 마지막으로 확인한 거래일을 localStorage에 단지별로 저장한다.
// 서버·DB를 쓰지 않는다. 지도의 📰 배지와 뉴스 브리핑이 같은 판정을 공유하려고 분리했다.

const KEY = "re_briefing_seen";

export function complexKey(c) {
  return `${c.lawdCd}|${c.umdNm}|${c.aptNm}`;
}

export function loadSeen() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

// 지금 보고 있는 단지들의 최신 거래일을 "확인함"으로 기록.
export function markSeen(complexes) {
  try {
    const seen = loadSeen();
    for (const c of complexes || []) {
      const latest = c.recent?.[0]?.dealDate;
      if (latest) seen[complexKey(c)] = latest;
    }
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* 무시 */
  }
}

// 마지막 확인 이후 새 거래가 뜬 단지인지. 처음 보는 단지는 새 것으로 친다.
export function isNew(c, seen) {
  const latest = c.recent?.[0]?.dealDate;
  return !!latest && (!seen[complexKey(c)] || seen[complexKey(c)] < latest);
}

// 미확인 단지 수 — 지도 📰 배지용.
export function countNew(complexes) {
  const seen = loadSeen();
  let n = 0;
  for (const c of complexes || []) if (isNew(c, seen)) n += 1;
  return n;
}
