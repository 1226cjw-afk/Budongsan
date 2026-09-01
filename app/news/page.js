"use client";

// 📰 데일리 부동산 뉴스 — /api/cron/news 가 매일 모아둔 기사를 날짜별로 보여준다.
// 필터(카테고리 칩)는 재요청 없이 클라이언트에서 처리(/api/news 가 최신 전체를 내려줌).
// 카테고리는 lib/news.js의 classifyNews(제목 룰)로 렌더 시 계산 — 과거 기사에도 소급.
// 디자인은 지도 패널(KakaoMap.js)의 팔레트·흰 카드 언어를 따른다.

import { useEffect, useMemo, useState } from "react";
import { classifyNews, newsPriority, isRegionKeyword, NEWS_CATEGORIES } from "../lib/news";
import { daysBetweenYmd, kstDate } from "../lib/format";
import { C, CARD_SHADOW, TRANSITION } from "../lib/palette";
import Briefing from "../components/Briefing";

const PROFILE_KEY = "re_loan_profile"; // KakaoMap·Briefing과 동일 키

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

export default function NewsPage() {
  const [items, setItems] = useState(null); // null = 로딩 중
  const [days, setDays] = useState(7); // 서버가 자른 기간 — 라벨이 서버와 어긋나지 않게 받아온다
  const [error, setError] = useState("");
  // "" = 전체 | "must" = 🔴 필독 | "region" = ⭐ 관심지역 | 카테고리명
  const [sel, setSel] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [notice, setNotice] = useState("");
  const [hasIncome, setHasIncome] = useState(false);

  const load = async () => {
    try {
      // ⚠️ limit 상향(300→600): 2026-09-02 키워드를 단지 축으로 넓히면서 최근 7일이 이미
      //    372건이라 기존 상한을 넘긴다. 잘리면 📢 요주의 단지의 집계 모수가 함께 줄어든다.
      const res = await fetch("/api/news?limit=600");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setItems(json.items);
      if (json.days) setDays(json.days);
      setError("");
    } catch (e) {
      setError(e.message);
      setItems([]);
    }
  };
  useEffect(() => { load(); }, []);

  // 소득을 입력해 뒀으면 대출·금리 기사의 중요도가 한 칸 올라간다(newsPriority).
  // ⚠️ localStorage는 마운트 이후에만 — useState 초기값으로 읽으면 하이드레이션 불일치.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) setHasIncome(Number(JSON.parse(raw)?.income) > 0);
    } catch {
      /* 무시 */
    }
  }, []);

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
        await load();
      }
    } catch (e) {
      setNotice(e.message);
    }
    setCollecting(false);
  };

  // 카테고리·중요도는 제목에서 한 번만 계산해 붙여둔다(둘 다 DB 컬럼 없음).
  const withCat = useMemo(
    () =>
      (items || []).map((it) => {
        const cat = classifyNews(it.title);
        return { ...it, cat, priority: newsPriority({ ...it, cat }, { hasIncome }) };
      }),
    [items, hasIncome]
  );
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
    <div style={page}>
      <div style={column}>
        <div style={headerRow}>
          <a href="/" style={backLink}>← 지도</a>
          <button onClick={collectNow} disabled={collecting || items === null} style={collectBtn}>
            {collecting ? "수집 중…" : "🔄 지금 수집"}
          </button>
        </div>
        <h1 style={title}>📰 부동산 뉴스</h1>
        <div style={subtitle}>
          최근 {days}일 · 매일 아침 6:30 자동 수집 · 수도권(서울·경기·인천) 매매 위주 + 즐겨찾기 지역
          {notice && <span style={noticeText}> — {notice}</span>}
        </div>

        {/* 브리핑은 칩 필터의 영향을 받지 않는 고정 영역 → 전체 목록(withCat)을 넘긴다 */}
        <Briefing news={withCat} days={days} />

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
      <style>{`.news-row { transition: background 0.15s; }
        .news-row:hover { background: #f8fafc; }`}</style>
    </div>
  );
}

const page = {
  minHeight: "100vh", background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)", color: C.text,
  padding: "18px 14px calc(24px + env(safe-area-inset-bottom))",
};
const column = { maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 };
const headerRow = { display: "flex", alignItems: "center", justifyContent: "space-between" };
const backLink = {
  fontSize: 13, fontWeight: 600, color: C.sub, textDecoration: "none",
  padding: "6px 10px", background: "#fff", borderRadius: 10, border: `1px solid ${C.border}`,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)", transition: TRANSITION,
};
const collectBtn = {
  padding: "6px 10px", borderRadius: 10, border: `1px solid ${C.border}`,
  background: "#fff", color: C.sub, fontSize: 12, fontWeight: 600, cursor: "pointer",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)", transition: TRANSITION,
};
const title = { margin: "4px 0 0", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" };
const subtitle = { fontSize: 12, color: C.muted };
const noticeText = { color: C.blue, fontWeight: 600 };
const chipRow = {
  display: "flex", gap: 6, overflowX: "auto", padding: "4px 0 6px",
  WebkitOverflowScrolling: "touch",
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
