"use client";

// 네이버식 단지 리스트 — 정렬 바 + 행 목록. 데스크톱은 좌측 패널 하단, 모바일은 목록 시트에 공용.
// 행 데이터(rows)는 lib/complexRows.js가 만든 것을 그대로 받는다 — **지도 마커와 같은 배열**이라
// "리스트엔 여유, 마커는 부족" 같은 불일치가 구조적으로 생길 수 없다.
// ⚠️ 세대수(households)는 행에 없다 — 나중에 lazy로 도착하는 값이라 행에 섞으면 마커까지
//    다시 그려진다. 여기서 렌더 시점에 householdMap으로 붙인다.

import { C } from "../../lib/palette";
import { formatManwon } from "../../lib/format";
import { HOT_PCT } from "../../lib/mapFilters";
import {
  sortBar, sortSelect, onlyBuyLabel, listScroll, hintText,
  rowTop, rowName, rowPrice, rowSub, rowBadges,
  hotBadge, upBadge, downBadge, rebuildBadge, gapOkBadge, gapNoBadge,
} from "../mapStyles";

export default function ComplexList({
  rows, selected, onSelect, sortBy, setSortBy, sortOptions,
  affordMode, onlyBuyable, setOnlyBuyable, householdMap,
}) {
  return (
    <>
      <div style={sortBar}>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={sortSelect}>
          {sortOptions.map((o) => (
            <option key={o.v} value={o.v}>{o.label}</option>
          ))}
        </select>
        {affordMode && (
          <label style={onlyBuyLabel}>
            <input
              type="checkbox"
              checked={onlyBuyable}
              onChange={(e) => setOnlyBuyable(e.target.checked)}
              style={{ margin: 0 }}
            />
            구매가능만
          </label>
        )}
        <span style={{ fontSize: 11, color: C.muted, marginLeft: "auto", whiteSpace: "nowrap" }}>
          {rows ? `${rows.length}곳` : ""}
        </span>
      </div>
      <div style={listScroll}>
        {!rows ? (
          <div style={hintText}>불러오는 중…</div>
        ) : rows.length === 0 ? (
          <div style={hintText}>조건에 맞는 단지가 없습니다</div>
        ) : (
          rows.map((r, i) => {
            const isOn = selected && selected.umdNm === r.c.umdNm && selected.aptNm === r.c.aptNm;
            const households = householdMap.get(r.key) ?? null;
            return (
              <div
                key={r.key}
                className={`cx-row${isOn ? " cx-row--on" : ""}`}
                onClick={() => onSelect(r.c)}
                style={{ animationDelay: `${Math.min(i, 15) * 20}ms` }}
              >
                <div style={rowTop}>
                  <span style={rowName}>
                    {r.isFav && <span style={{ color: C.amber }}>★ </span>}
                    {r.c.aptNm}
                  </span>
                  <span style={rowPrice}>{formatManwon(r.price)}</span>
                </div>
                <div style={rowSub}>
                  {r.c.umdNm}
                  {r.buildYear ? ` · '${String(r.buildYear).slice(2)}년` : ""}
                  {households ? ` · ${households.toLocaleString()}세대` : ""}
                  {` · ${r.count}건`}
                </div>
                <div style={rowBadges}>
                  {r.yoy != null && (
                    <span style={r.yoy >= HOT_PCT ? hotBadge : r.yoy >= 0 ? upBadge : downBadge}>
                      {r.yoy >= HOT_PCT ? "🔥 " : ""}1년 {r.yoy >= 0 ? "+" : ""}{r.yoy}%
                    </span>
                  )}
                  {r.rebuild && <span style={rebuildBadge}>🏗 재건축연한</span>}
                  {r.noLoan ? (
                    <span style={gapNoBadge}>대출 불가</span>
                  ) : r.gap != null ? (
                    r.gap >= 0 ? (
                      <span style={gapOkBadge}>✓ 여유 {formatManwon(r.gap)}</span>
                    ) : (
                      <span style={gapNoBadge}>부족 {formatManwon(-r.gap)}</span>
                    )
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
