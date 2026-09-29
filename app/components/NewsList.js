"use client";

// 📰 데일리 부동산 뉴스 — /api/cron/news 가 매일 모아둔 기사를 날짜별로 보여준다.
// 필터(카테고리 칩)는 재요청 없이 클라이언트에서 처리(/api/news 가 최신 전체를 내려줌).
// 카테고리는 lib/news.js의 classifyNews(제목 룰)로 렌더 시 계산 — 과거 기사에도 소급.
// 디자인은 지도 패널(KakaoMap.js)의 팔레트·흰 카드 언어를 따른다.

// 2026-09-29: /news 페이지에서 📰 뉴스 **탭**으로 옮겼다. 기사 fetch·분류는 셸(AppShell.useNewsFeed)이
// 한 번만 하고 🔥 오늘 탭과 공유한다. 브리핑 카드는 오늘 탭(TodayView)으로 분리됐다.

import { useMemo, useState } from "react";
import { isRegionKeyword, NEWS_CATEGORIES } from "../lib/news";
import { daysBetweenYmd, kstDate } from "../lib/format";
import { C, CARD_SHADOW, TRANSITION } from "../lib/palette";
import { useShell } from "./AppShell";
import { TabHeader } from "./TabBar";

const CAT_EMOJI = {
  "매매·시세": "📈", "정책·세금": "🏛️", "대출·금리": "💰",
  "분양·청약": "🏗️", "재건축·재개발": "🔨", "전월세": "🏠", "기타": "📎",
};

// 중요도별 표시(lib/news.js의 newsPriority가 판정). "일반"은 항목이 없다 — 색을 **안 쓰는 것**이
// 색 구분의 절반이다. 셋 다 칠하면 아무것도 눈에 띄지 않는다.
// ⚠️ 배지 글자색은 C.amber(#f59e0b)가 아니라 amber-700 — 옅은 배경 위에서 대비가 모자란다.
const PRIORITY_STYLE = {
  필독: { bar: C.red, badge: { background: C.redSoft, color: C.red } },
  주목: { bar: C.amber, badge: { background: C.amberSoft, color: "#b45309" } },
};

// "오늘 · 7월 8일 (화)" 꼴 날짜 그룹 라벨.
// ⚠️ "오늘/어제" 판정은 **KST 달력 날짜**로 한다(format.kstDate). 예전엔 setHours(0,0,0,0)로
//    브라우저 로컬 자정을 기준 삼았는데, 그건 이 프로젝트가 네 번 겪은 UTC/KST 버그와 같은
//    계열이다 — 서버(cron·브리핑)는 이미 kstDate() 기준이라, 해외/UTC 브라우저에서 열면
//    같은 기사가 뉴스 목록에선 "어제", 브리핑에선 "오늘"로 갈린다.
function dateLabel(iso) {
  const base = new Date(iso).toLocaleDateString("ko-KR", {
    month: "long", day: "numeric", weekday: "short",
  });
  const diff = daysBetweenYmd(kstDate(Date.parse(iso)), kstDate());
  if (diff === 0) return `오늘 · ${base}`;
  if (diff === 1) return `어제 · ${base}`;
  return base;
}

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function NewsList() {
  // items: null = 로딩 중 / days: 서버가 자른 기간(라벨이 서버와 어긋나지 않게)
  const { news } = useShell();
  const { items, withCat, days, error, reload } = news;
  // "" = 전체 | "must" = 🔴 필독 | "region" = ⭐ 관심지역 | 카테고리명
  const [sel, setSel] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [notice, setNotice] = useState("");

  // 수동 수집 — 로컬(CRON_SECRET 미설정)용. 배포에선 401 → 안내만.
  const collectNow = async () => {
    setCollecting(true);
    setNotice("");
    try {
      const res = await fetch("/api/cron/news");
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) setNotice("배포 환경에선 매일 아침 자동 수집으로만 갱신돼요.");
      else if (!res.ok) setNotice(json.error || `수집 실패 (HTTP ${res.status})`);
      else {
        setNotice(`새 기사 ${json.inserted}건 수집`);
        await reload();
      }
    } catch (e) {
      setNotice(e.message);
    }
    setCollecting(false);
  };

  const mustCount = useMemo(
    () => withCat.filter((it) => it.priority === "필독").length,
    [withCat]
  );
  // 실제 기사가 있는 카테고리만 칩으로 노출(순서는 NEWS_CATEGORIES = 매매·시세 우선).
  const cats = useMemo(() => {
    const present = new Set(withCat.map((it) => it.cat));
    return NEWS_CATEGORIES.filter((c) => present.has(c));
  }, [withCat]);
  const hasRegion = useMemo(() => withCat.some((it) => isRegionKeyword(it.keyword)), [withCat]);
  const filtered = useMemo(() => {
    if (!sel) return withCat;
    if (sel === "must") return withCat.filter((it) => it.priority === "필독");
    if (sel === "region") return withCat.filter((it) => isRegionKeyword(it.keyword));
    return withCat.filter((it) => it.cat === sel);
  }, [withCat, sel]);
  // 발행일 기준 날짜 그룹(내려온 순서 = 최신순 유지). 발행일 결측은 수집일로.
  const groups = useMemo(() => {
    const map = new Map();
    for (const it of filtered) {
      const label = dateLabel(it.published_at || it.fetched_at);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(it);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
      <div style={column}>
        <TabHeader
          title="📰 뉴스"
          sub={`최근 ${days}일 · 매일 6:30 수집 · 수도권`}
          right={
            <button
              onClick={collectNow}
              disabled={collecting || items === null}
              style={collectBtn}
              title="지금 수집(로컬 전용)"
              aria-label="지금 수집"
            >
              {collecting ? "⏳" : "🔄"}
            </button>
          }
        />
        {notice && <div style={noticeText}>{notice}</div>}

        {withCat.length > 0 && (
          <div style={chipRow}>
            <button onClick={() => setSel("")} style={{ ...chip, ...(sel === "" ? chipOn : null) }}>
              전체
            </button>
            {mustCount > 0 && (
              <button
                onClick={() => setSel("must")}
                style={{ ...chip, ...(sel === "must" ? chipMustOn : null) }}
              >
                🔴 필독 {mustCount}
              </button>
            )}
            {cats.map((c) => (
              <button key={c} onClick={() => setSel(c)} style={{ ...chip, ...(sel === c ? chipOn : null) }}>
                {CAT_EMOJI[c]} {c}
              </button>
            ))}
            {hasRegion && (
              <button onClick={() => setSel("region")} style={{ ...chip, ...(sel === "region" ? chipOn : null) }}>
                ⭐ 관심지역
              </button>
            )}
          </div>
        )}

        {items === null ? (
          <div style={emptyBox}>불러오는 중…</div>
        ) : error ? (
          <div style={{ ...emptyBox, color: C.red }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={emptyBox}>
            최근 {days}일 안에 들어온 뉴스가 없어요.
            <br />
            <span style={{ color: C.muted, fontSize: 12 }}>
              내일 아침부터 자동 수집되고, 위 "지금 수집"으로 바로 채울 수도 있어요.
            </span>
          </div>
        ) : (
          groups.map(([label, group]) => (
            <section key={label}>
              <div style={dayHead}>{label}</div>
              <div style={card}>
                {group.map((it, i) => {
                  const pr = PRIORITY_STYLE[it.priority];
                  return (
                  <a
                    key={it.link}
                    href={it.link}
                    target="_blank"
                    rel="noreferrer"
                    className="news-row"
                    style={{
                      ...row,
                      ...(i > 0 ? rowDivider : null),
                      ...(pr ? { borderLeftColor: pr.bar } : null),
                    }}
                  >
                    <div style={{ ...rowTitle, ...(it.priority === "필독" ? rowTitleMust : null) }}>
                      {pr && <span style={{ ...prBadge, ...pr.badge }}>{it.priority}</span>}
                      {it.title}
                    </div>
                    {it.description && <div style={rowDesc}>{it.description}</div>}
                    <div style={rowMeta}>
                      {it.source && <span>{it.source}</span>}
                      {it.published_at && <span>{timeLabel(it.published_at)}</span>}
                      <span style={metaKw}>{CAT_EMOJI[it.cat]} {it.cat}</span>
                      {isRegionKeyword(it.keyword) && (
                        <span style={metaKw}>⭐ {it.keyword.replace(/ 아파트$/, "")}</span>
                      )}
                    </div>
                  </a>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
  );
}

// .news-row hover 스타일은 AppShell의 <style>에 있다(💰 영향 뉴스 카드와 공유).
const column = {
  maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10, color: C.text,
};
const collectBtn = {
  flex: "0 0 auto", padding: "5px 9px", borderRadius: 10, border: `1px solid ${C.border}`,
  background: "#fff", color: C.sub, fontSize: 12, fontWeight: 600, cursor: "pointer",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)", transition: TRANSITION,
};
const noticeText = { fontSize: 12, color: C.blue, fontWeight: 600 };
// ⚠️ 칩 줄은 탭 머리(56px) 바로 아래에 붙는다 — 예전엔 브리핑 카드들 아래 한참 밑에 있어 찾기 어려웠다.
//    sticky라 배경을 패널과 같은 색으로 칠해야 스크롤되는 기사가 비치지 않는다.
const chipRow = {
  display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch",
  position: "sticky", top: 56, zIndex: 1, background: "#f8fafc",
  margin: "0 -14px", padding: "4px 14px 6px",
};
const chip = {
  flex: "0 0 auto", padding: "6px 11px", borderRadius: 999,
  borderWidth: 1, borderStyle: "solid", borderColor: C.border,
  background: "#fff", color: C.sub, fontSize: 12, fontWeight: 600, cursor: "pointer",
  whiteSpace: "nowrap", transition: TRANSITION,
};
const chipOn = { background: C.blueSoft, borderColor: "#bfdbfe", color: C.blue };
// 🔴 필독 칩은 켜졌을 때 빨강 — 행의 컬러바와 같은 색이어야 "이 칩이 저 색을 고른다"가 읽힌다.
const chipMustOn = { background: C.redSoft, borderColor: "#fecaca", color: C.red };
const dayHead = { fontSize: 12, fontWeight: 700, color: C.sub, margin: "10px 2px 6px" };
const card = {
  background: "#fff", borderRadius: 16, border: `1px solid ${C.border}`,
  boxShadow: CARD_SHADOW, overflow: "hidden",
};
// ⚠️ 일반 행도 3px 투명 좌측 보더를 갖는다 — 중요도 행에만 보더를 주면 그 행들만 3px 밀려
//    제목 왼쪽 줄이 들쭉날쭉해진다. 색만 갈아끼우는 구조로 정렬을 지킨다.
//    borderLeftColor만 덮으므로 shorthand `border`를 쓰면 안 된다(React dev 경고).
const row = {
  display: "block", padding: "12px 16px", textDecoration: "none", color: "inherit",
  borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: "transparent",
};
const rowDivider = { borderTop: `1px solid ${C.divider}` };
const rowTitle = { fontSize: 14, fontWeight: 600, lineHeight: 1.45 };
const rowTitleMust = { fontWeight: 700 };
const prBadge = {
  display: "inline-block", padding: "1px 6px", borderRadius: 6, marginRight: 6,
  fontSize: 10, fontWeight: 800, letterSpacing: "-0.01em", verticalAlign: "middle",
};
const rowDesc = {
  fontSize: 12, color: C.sub, lineHeight: 1.5, marginTop: 3,
  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
};
const rowMeta = { display: "flex", gap: 8, marginTop: 5, fontSize: 11, color: C.muted, alignItems: "center" };
const metaKw = {
  padding: "1px 7px", borderRadius: 999, background: C.divider, color: C.sub, fontWeight: 600,
};
const emptyBox = {
  background: "#fff", borderRadius: 16, border: `1px solid ${C.border}`,
  boxShadow: CARD_SHADOW,
  padding: "36px 16px", textAlign: "center", fontSize: 13, color: C.sub, lineHeight: 1.7,
};
