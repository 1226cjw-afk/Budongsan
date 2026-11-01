"use client";

// ⚖️ 비교 탭 — 담은 단지 2~4곳을 같은 평형 기준으로 나란히 본다.
// 원천: /api/compare(최근 15개월 실거래 집계 + 세대수). 집계 규칙은 lib/compare.js.
//
// ⚠️ 대출 숫자는 지도·브리핑과 **같은 어댑터**(loanPolicy.loanCalcFor + usableAssets)로 계산한다.
//    기준가는 지도 기본값과 같은 **최근 실거래가**, 면적은 묶음의 최대 전용(농특세 판정 — compare.js 주석).
//    여기서 calcMaxLoan을 직접 부르거나 area를 빠뜨리면 지도 카드와 숫자가 갈린다(2026-08-14 농특세 사고).
// ⚠️ fetch는 이 컨테이너에서만 하고 하위 조각엔 prop으로 내린다(Briefing.js와 같은 규칙).
// ⚠️ keep-alive 패널이라 탭이 보일 때만 불러온다 — 지도 첫 로딩과 경쟁하지 않게.

import { useEffect, useMemo, useState } from "react";
import { useShell } from "./AppShell";
import { TabHeader } from "./TabBar";
import useCompareList from "./useCompareList";
import useLoanProfile from "./useLoanProfile";
import CompareTrendChart, { SERIES_COLORS, SERIES_MARKS } from "./compare/CompareTrendChart";
import { C } from "../lib/palette";
import { formatManwon, shortDate } from "../lib/format";
import { regionName } from "../lib/regions";
import { loanCalcFor, usableAssets } from "../lib/loanPolicy";
import { REBUILD_AGE } from "../lib/mapFilters";
import {
  COMPARE_MAX, compareKey, pickBasePyeong, allPyeongs, groupForPyeong, bestIndex,
} from "../lib/compare";
import { card, cardHead, headSub, emptyHint, okTag, noTag, flatTag } from "./briefing/styles";

const chip = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 9px", borderRadius: 999,
  border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, fontWeight: 600, color: C.text,
  cursor: "pointer", whiteSpace: "nowrap",
};
const chipOn = { background: C.blueSoft, borderColor: "#bfdbfe", color: C.blue };
const th = {
  position: "sticky", left: 0, zIndex: 1, background: "#fff", textAlign: "left",
  fontSize: 11.5, fontWeight: 600, color: C.sub, padding: "8px 10px", whiteSpace: "nowrap",
  borderTop: `1px solid ${C.divider}`,
};
const td = {
  fontSize: 13, color: C.text, padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums", borderTop: `1px solid ${C.divider}`, minWidth: 104,
};
const tdBest = { background: "#ecfdf5", color: "#047857", fontWeight: 800 };
const sectionRow = {
  ...th, position: "sticky", fontSize: 11, fontWeight: 800, color: C.text, background: "#f8fafc",
};

const signed = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`);

export default function CompareView() {
  const { tab, focusComplex, isMobile } = useShell();
  const active = tab === "compare";
  const cmp = useCompareList();
  const profile = useLoanProfile();
  const hasIncome = Number(profile?.income) > 0;
  const assets = usableAssets(profile);

  // ★ 관심 단지 — 담기 후보. 탭에 들어올 때마다 조용히 다시 받는다(지도에서 ★를 바꿨을 수 있다).
  const [favs, setFavs] = useState(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    fetch("/api/favorites")
      .then((r) => r.json())
      .then((d) => alive && setFavs(d.favorites || []))
      .catch(() => alive && setFavs([]));
    return () => { alive = false; };
  }, [active]);

  // 비교 데이터. 담은 목록이 바뀌면(또는 탭에 처음 들어오면) 다시 받는다.
  const listKey = cmp.list.map(compareKey).join("~");
  const [data, setData] = useState({ key: null, loading: false, entries: [], months: [], error: "" });
  useEffect(() => {
    if (!active || !cmp.list.length || data.key === listKey) return;
    let alive = true;
    setData((d) => ({ ...d, loading: true, error: "" }));
    fetch("/api/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cmp.list }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        return j;
      })
      .then((j) => alive && setData({ key: listKey, loading: false, entries: j.entries, months: j.months, error: "" }))
      .catch((e) => alive && setData((d) => ({ ...d, key: listKey, loading: false, error: e.message })));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, listKey]);

  // 화면 열 = 담은 순서. 응답이 아직 옛 목록이면 담은 목록에 남아 있는 것만 보여준다(뺀 단지가 남지 않게).
  const entries = useMemo(() => {
    const byKey = new Map(data.entries.map((e) => [compareKey(e), e]));
    return cmp.list.map((it) => byKey.get(compareKey(it))).filter(Boolean);
  }, [data.entries, cmp.list]);

  const [pickedPy, setPickedPy] = useState(null); // null = 자동
  const pyeongs = allPyeongs(entries);
  const basePy = pyeongs.includes(pickedPy) ? pickedPy : pickBasePyeong(entries);

  const loanFor = loanCalcFor(profile, assets);
  const cols = entries.map((e, i) => {
    const sel = basePy != null ? groupForPyeong(e.summary, basePy) : null;
    const g = sel?.group || null;
    const ln = g && hasIncome ? loanFor(g.recentAmount, { lawdCd: e.lawdCd, area: g.m2 }) : null;
    const canLoan = !!ln && ln.maxLoan > 0;
    const age = e.summary?.buildYear ? new Date().getFullYear() - e.summary.buildYear : null;
    return {
      e, i, g, exact: sel?.exact ?? false, ln, canLoan, age,
      gap: canLoan ? assets - ln.requiredCash : null,
      color: SERIES_COLORS[i], mark: SERIES_MARKS[i],
    };
  });

  const inList = (f) => cmp.has({ lawdCd: f.lawd_cd, umdNm: f.umd_nm, aptNm: f.apt_nm });
  const full = cmp.list.length >= COMPARE_MAX;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <TabHeader title="⚖️ 비교" sub="담은 단지를 같은 평형으로 나란히 — 최근 12개월 실거래" />

      <Picker
        cmp={cmp} favs={favs} inList={inList} full={full}
      />

      {cmp.list.length < 2 ? (
        <div style={emptyHint}>
          단지를 <b>2곳 이상</b> 담으면 비교표가 나와요. 위의 ★ 관심 단지를 누르거나, 지도에서 단지를 열고
          {" "}<b>⚖️</b> 버튼을 누르세요. (최대 {COMPARE_MAX}곳)
        </div>
      ) : data.error && !entries.length ? (
        <div style={emptyHint}>비교 데이터를 못 불러왔어요: {data.error}</div>
      ) : !entries.length ? (
        <div style={{ ...emptyHint, color: C.muted }}>불러오는 중…</div>
      ) : (
        <>
          {pyeongs.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.sub }}>기준 평형</span>
              {pyeongs.map((p) => (
                <button key={p} onClick={() => setPickedPy(p)} style={{ ...chip, ...(p === basePy ? chipOn : null) }}>
                  {p}평
                </button>
              ))}
            </div>
          )}

          <Highlights cols={cols} hasIncome={hasIncome} basePy={basePy} />

          <section>
            <div style={cardHead}>
              {basePy}평 월별 시세 <span style={headSub}>· 중앙값 · 해제·직거래 제외</span>
            </div>
            <div style={{ ...card, padding: "10px 10px 6px" }}>
              <Legend cols={cols} />
              <CompareTrendChart
                months={data.months}
                lines={cols.map((c) => ({
                  key: compareKey(c.e), color: c.color, mark: c.mark,
                  series: (c.g && c.e.summary?.series?.[c.g.pyeong]) || [],
                }))}
              />
            </div>
          </section>

          <section>
            <div style={cardHead}>
              비교표 <span style={headSub}>· 초록 = 그 줄에서 가장 유리한 값{isMobile && cols.length > 2 ? " · 옆으로 밀어 더 보기 →" : ""}</span>
            </div>
            <div style={{ ...card, overflowX: "auto" }}>
              <CompareTable cols={cols} basePy={basePy} hasIncome={hasIncome} onFocus={focusComplex} />
            </div>
            <div style={{ fontSize: 11, color: C.muted, margin: "6px 2px 0", lineHeight: 1.6 }}>
              시세는 국토부 실거래(최근 12개월, 12억 미만 거래만 수집). 1년 상승률은 지도 리스트와 같은 정의
              (최근 3개월 vs 1년 전 3개월의 ㎡당가). 대출은 <b>최근 실거래가</b> 기준, 지도 ⚙️의 내 자금 설정을 따릅니다.
              {data.loading && " · 갱신 중…"}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// 담은 단지 칩(× 빼기) + ★ 관심 단지에서 담기.
function Picker({ cmp, favs, inList, full }) {
  const [notice, setNotice] = useState("");
  const candidates = (favs || []).filter((f) => !inList(f));
  return (
    <section>
      <div style={cardHead}>
        담은 단지 <span style={headSub}>· {cmp.list.length}/{COMPARE_MAX}</span>
        {cmp.list.length > 0 && (
          <button onClick={cmp.clear} style={{ float: "right", border: "none", background: "none", color: C.muted, fontSize: 11, cursor: "pointer" }}>
            모두 빼기
          </button>
        )}
      </div>
      <div style={{ ...card, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {cmp.list.length === 0 && <span style={{ fontSize: 12, color: C.muted }}>아직 없어요</span>}
          {cmp.list.map((it, i) => (
            <span key={compareKey(it)} style={{ ...chip, cursor: "default", borderColor: SERIES_COLORS[i] }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: SERIES_COLORS[i] }} />
              {SERIES_MARKS[i]} {it.aptNm}
              <button
                onClick={() => cmp.remove(compareKey(it))}
                aria-label={`${it.aptNm} 빼기`}
                style={{ border: "none", background: "none", color: C.muted, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {candidates.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, marginBottom: 6 }}>★ 관심 단지에서 담기</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {candidates.map((f) => (
                <button
                  key={f.id ?? `${f.lawd_cd}|${f.umd_nm}|${f.apt_nm}`}
                  disabled={full}
                  onClick={() => {
                    const r = cmp.add({ lawdCd: f.lawd_cd, umdNm: f.umd_nm, aptNm: f.apt_nm });
                    setNotice(r.full ? `최대 ${COMPARE_MAX}곳까지 담을 수 있어요` : "");
                  }}
                  style={{ ...chip, color: full ? C.muted : C.text, cursor: full ? "not-allowed" : "pointer" }}
                  title={`${regionName(f.lawd_cd)} ${f.umd_nm}`}
                >
                  ＋ {f.apt_nm}
                </button>
              ))}
            </div>
          </div>
        )}
        {(full || notice) && (
          <div style={{ fontSize: 11, color: C.muted }}>{notice || `최대 ${COMPARE_MAX}곳 — 하나를 빼면 더 담을 수 있어요`}</div>
        )}
      </div>
    </section>
  );
}

function Legend({ cols }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: C.text, padding: "0 4px 4px" }}>
      {cols.map((c) => (
        <span key={compareKey(c.e)} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: c.color }} />
          {c.mark} {c.e.aptNm}
          {c.g && !c.exact && <span style={{ color: C.muted }}>({c.g.pyeong}평)</span>}
        </span>
      ))}
    </div>
  );
}

// 한눈 요약 — 표에서 사람이 제일 먼저 찾는 세 가지를 문장으로.
function Highlights({ cols, hasIncome, basePy }) {
  const name = (i) => `${cols[i].mark} ${cols[i].e.aptNm}`;
  const items = [];
  const cheap = bestIndex(cols.map((c) => c.g?.perPyeong), "min");
  if (cheap >= 0) items.push(`평당가 가장 낮음: ${name(cheap)} (${formatManwon(cols[cheap].g.perPyeong)}/평)`);
  const up = bestIndex(cols.map((c) => c.e.summary?.yoyPct), "max");
  if (up >= 0) items.push(`1년 상승률 가장 높음: ${name(up)} (${signed(cols[up].e.summary.yoyPct)})`);
  const liquid = bestIndex(cols.map((c) => c.g?.count), "max");
  if (liquid >= 0) items.push(`${basePy}평 거래 가장 활발: ${name(liquid)} (${cols[liquid].g.count}건)`);
  if (hasIncome) {
    const ok = cols.filter((c) => c.gap != null && c.gap >= 0);
    items.push(
      ok.length
        ? `내 자금으로 가능: ${ok.map((c) => `${c.mark} ${c.e.aptNm}`).join(", ")}`
        : "내 자금으로는 모두 부족 — 표의 '자금 여유' 줄에서 부족액을 보세요"
    );
  }
  if (!items.length) return null;
  return (
    <div style={{ ...card, padding: "11px 14px", fontSize: 12.5, color: C.text, lineHeight: 1.75 }}>
      {items.map((t) => <div key={t}>· {t}</div>)}
    </div>
  );
}

function CompareTable({ cols, basePy, hasIncome, onFocus }) {
  // 행 정의: label, 칸별 표시값, (선택) 강조용 숫자와 방향.
  const rows = [
    { section: `시세 · ${basePy}평` },
    {
      label: "최근 실거래",
      cells: cols.map((c) => c.g ? (
        <>
          <div style={{ fontWeight: 700 }}>{formatManwon(c.g.recentAmount)}</div>
          <div style={{ fontSize: 10.5, color: C.muted }}>{shortDate(c.g.recentDate)}</div>
        </>
      ) : "—"),
    },
    { label: "12개월 중앙값", cells: cols.map((c) => c.g ? formatManwon(c.g.median) : "—") },
    { label: "평당가", nums: cols.map((c) => c.g?.perPyeong), dir: "min", cells: cols.map((c) => c.g ? `${formatManwon(c.g.perPyeong)}` : "—") },
    { label: "거래량(12개월)", nums: cols.map((c) => c.g?.count), dir: "max", cells: cols.map((c) => c.g ? `${c.g.count}건` : "0건") },
    { section: "단지" },
    {
      label: "1년 상승률",
      cells: cols.map((c) => {
        const v = c.e.summary?.yoyPct;
        return <span style={{ color: v == null ? C.muted : v >= 0 ? C.red : C.blue, fontWeight: 700 }}>{signed(v)}</span>;
      }),
    },
    {
      label: "준공",
      cells: cols.map((c) => c.e.summary?.buildYear ? (
        <>
          {c.e.summary.buildYear}년 <span style={{ color: C.muted }}>({c.age}년차)</span>
          {c.age >= REBUILD_AGE && <div><span style={flatTag}>🏗 재건축연한</span></div>}
        </>
      ) : "—"),
    },
    {
      label: "세대수", nums: cols.map((c) => c.e.info?.households), dir: "max",
      cells: cols.map((c) => c.e.info?.households ? `${c.e.info.households.toLocaleString()}세대` : "—"),
    },
    { label: "전체 거래(12개월)", cells: cols.map((c) => `${c.e.summary?.count ?? 0}건`) },
  ];
  if (hasIncome) {
    rows.push(
      { section: "내 자금 · 최근 실거래가 기준" },
      {
        label: "대출 가능액", nums: cols.map((c) => (c.canLoan ? c.ln.maxLoan : null)), dir: "max",
        cells: cols.map((c) => !c.ln ? "—" : c.canLoan ? formatManwon(c.ln.maxLoan) : <span style={{ color: C.red }}>대출 불가</span>),
      },
      {
        label: "필요 현금", nums: cols.map((c) => (c.canLoan ? c.ln.requiredCash : null)), dir: "min",
        cells: cols.map((c) => (c.canLoan ? formatManwon(c.ln.requiredCash) : "—")),
      },
      {
        label: "월 상환액", nums: cols.map((c) => (c.canLoan ? c.ln.monthlyPayment : null)), dir: "min",
        cells: cols.map((c) => (c.canLoan ? `${c.ln.monthlyPayment.toLocaleString()}만원` : "—")),
      },
      {
        label: "DSR",
        cells: cols.map((c) => (c.canLoan && c.ln.dsrRatio != null ? `${Math.round(c.ln.dsrRatio * 100)}%` : "—")),
      },
      {
        label: "자금 여유", nums: cols.map((c) => c.gap), dir: "max",
        cells: cols.map((c) => c.gap == null ? "—" : (
          <span style={c.gap >= 0 ? okTag : noTag}>
            {c.gap >= 0 ? `✓ 여유 ${formatManwon(c.gap)}` : `✗ 부족 ${formatManwon(-c.gap)}`}
          </span>
        )),
      }
    );
  }

  return (
    <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
      <thead>
        <tr>
          <th style={{ ...th, borderTop: "none" }} />
          {cols.map((c) => (
            <th key={compareKey(c.e)} style={{ ...td, borderTop: "none", textAlign: "right", verticalAlign: "bottom" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color, flex: "0 0 auto" }} />
                <span style={{ fontSize: 12, color: C.sub }}>{c.mark}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "normal", lineHeight: 1.3, marginTop: 2 }}>{c.e.aptNm}</div>
              <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 400, whiteSpace: "normal" }}>
                {regionName(c.e.lawdCd)} {c.e.umdNm}
              </div>
              {c.g && !c.exact && (
                <div style={{ fontSize: 10.5, color: "#b45309", fontWeight: 600 }}>{basePy}평 없음 → {c.g.pyeong}평</div>
              )}
              {c.e.error && <div style={{ fontSize: 10.5, color: C.red, fontWeight: 600 }}>수집 실패</div>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => {
          if (r.section) {
            return (
              <tr key={ri}>
                <td style={sectionRow} colSpan={cols.length + 1}>{r.section}</td>
              </tr>
            );
          }
          const best = r.nums ? bestIndex(r.nums, r.dir) : -1;
          return (
            <tr key={ri}>
              <th style={th} scope="row">{r.label}</th>
              {r.cells.map((cell, ci) => (
                <td key={ci} style={{ ...td, ...(ci === best ? tdBest : null) }}>{cell}</td>
              ))}
            </tr>
          );
        })}
        <tr>
          <th style={th} />
          {cols.map((c) => (
            <td key={compareKey(c.e)} style={td}>
              <button
                onClick={() => onFocus({ lawdCd: c.e.lawdCd, umdNm: c.e.umdNm, aptNm: c.e.aptNm })}
                style={{ border: `1px solid ${C.border}`, background: "#fff", borderRadius: 8, padding: "4px 8px", fontSize: 11.5, fontWeight: 600, color: C.blue, cursor: "pointer" }}
              >
                🗺 지도에서
              </button>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
