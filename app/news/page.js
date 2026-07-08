"use client";

// 📰 데일리 부동산 뉴스 — /api/cron/news 가 매일 모아둔 기사를 날짜별로 보여준다.
// 필터(키워드 칩)는 재요청 없이 클라이언트에서 처리(/api/news 가 최신 전체를 내려줌).
// 디자인은 지도 패널(KakaoMap.js)의 팔레트·흰 카드 언어를 따른다.

import { useEffect, useMemo, useState } from "react";

const C = {
  text: "#0f172a", sub: "#64748b", muted: "#94a3b8",
  border: "#e2e8f0", divider: "#f1f5f9",
  blue: "#2563eb", blueSoft: "#eff6ff", red: "#dc2626",
};

// "오늘 · 7월 8일 (화)" 꼴 날짜 그룹 라벨.
function dateLabel(iso) {
  const d = new Date(iso);
  const base = d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (diff === 0) return `오늘 · ${base}`;
  if (diff === 1) return `어제 · ${base}`;
  return base;
}

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function NewsPage() {
  const [items, setItems] = useState(null); // null = 로딩 중
  const [error, setError] = useState("");
  const [kw, setKw] = useState(""); // "" = 전체
  const [collecting, setCollecting] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    try {
      const res = await fetch("/api/news");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setItems(json.items);
      setError("");
    } catch (e) {
      setError(e.message);
      setItems([]);
    }
  };
  useEffect(() => { load(); }, []);

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

  const keywords = useMemo(
    () => (items ? [...new Set(items.map((i) => i.keyword))] : []),
    [items]
  );
  const filtered = useMemo(
    () => (kw ? (items || []).filter((i) => i.keyword === kw) : items || []),
    [items, kw]
  );
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
          매일 아침 6:30 자동 수집 · 기본 키워드 + 즐겨찾기 지역
          {notice && <span style={noticeText}> — {notice}</span>}
        </div>

        {keywords.length > 0 && (
          <div style={chipRow}>
            <button onClick={() => setKw("")} style={{ ...chip, ...(kw === "" ? chipOn : null) }}>
              전체
            </button>
            {keywords.map((k) => (
              <button key={k} onClick={() => setKw(k)} style={{ ...chip, ...(kw === k ? chipOn : null) }}>
                {k}
              </button>
            ))}
          </div>
        )}

        {items === null ? (
          <div style={emptyBox}>불러오는 중…</div>
        ) : error ? (
          <div style={{ ...emptyBox, color: C.red }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={emptyBox}>
            아직 수집된 뉴스가 없어요.
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
                {group.map((it, i) => (
                  <a
                    key={it.link}
                    href={it.link}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...row, ...(i > 0 ? rowDivider : null) }}
                  >
                    <div style={rowTitle}>{it.title}</div>
                    {it.description && <div style={rowDesc}>{it.description}</div>}
                    <div style={rowMeta}>
                      {it.source && <span>{it.source}</span>}
                      {it.published_at && <span>{timeLabel(it.published_at)}</span>}
                      <span style={metaKw}>{it.keyword}</span>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

const page = {
  minHeight: "100vh", background: "#f8fafc", color: C.text,
  padding: "18px 14px calc(24px + env(safe-area-inset-bottom))",
};
const column = { maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 };
const headerRow = { display: "flex", alignItems: "center", justifyContent: "space-between" };
const backLink = {
  fontSize: 13, fontWeight: 600, color: C.sub, textDecoration: "none",
  padding: "6px 10px", background: "#fff", borderRadius: 8, border: `1px solid ${C.border}`,
};
const collectBtn = {
  padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
  background: "#fff", color: C.sub, fontSize: 12, fontWeight: 600, cursor: "pointer",
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
  whiteSpace: "nowrap",
};
const chipOn = { background: C.blueSoft, borderColor: "#bfdbfe", color: C.blue };
const dayHead = { fontSize: 12, fontWeight: 700, color: C.sub, margin: "10px 2px 6px" };
const card = {
  background: "#fff", borderRadius: 14, border: `1px solid ${C.border}`,
  boxShadow: "0 2px 10px rgba(15,23,42,0.05)", overflow: "hidden",
};
const row = { display: "block", padding: "12px 16px", textDecoration: "none", color: "inherit" };
const rowDivider = { borderTop: `1px solid ${C.divider}` };
const rowTitle = { fontSize: 14, fontWeight: 600, lineHeight: 1.45 };
const rowDesc = {
  fontSize: 12, color: C.sub, lineHeight: 1.5, marginTop: 3,
  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
};
const rowMeta = { display: "flex", gap: 8, marginTop: 5, fontSize: 11, color: C.muted, alignItems: "center" };
const metaKw = {
  padding: "1px 7px", borderRadius: 999, background: C.divider, color: C.sub, fontWeight: 600,
};
const emptyBox = {
  background: "#fff", borderRadius: 14, border: `1px solid ${C.border}`,
  padding: "36px 16px", textAlign: "center", fontSize: 13, color: C.sub, lineHeight: 1.7,
};
