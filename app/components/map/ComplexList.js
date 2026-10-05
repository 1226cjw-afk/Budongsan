"use client";

// 네이버식 단지 리스트 — 정렬 바 + 행 목록. 데스크톱은 좌측 패널 하단, 모바일은 목록 시트에 공용.
// 행 데이터(rows)는 lib/complexRows.js가 만든 것을 그대로 받는다 — **지도 마커와 같은 배열**이라
// "리스트엔 여유, 마커는 부족" 같은 불일치가 구조적으로 생길 수 없다.
// ⚠️ 세대수(households)는 행에 없다 — 나중에 lazy로 도착하는 값이라 행에 섞으면 마커까지
//    다시 그려진다. 여기서 렌더 시점에 householdMap으로 붙인다.

import { C } from "../../lib/palette";
import { formatManwon } from "../../lib/format";
import {
  sortBar, sortSelect, onlyBuyLabel, listScroll, hintText,
  nameSearchBar, nameSearchInput, nameSearchClear, nameSearchMiss,
  rowTop, rowName, rowPrice, rowSub, rowBadges,
  hotBadge, upBadge, downBadge, rebuildBadge, gapOkBadge, gapNoBadge,
} from "../mapStyles";

export default function ComplexList({
  rows, selected, onSelect, sortBy, setSortBy, sortOptions,
  affordMode, onlyBuyable, setOnlyBuyable, householdMap,
  nameQuery = "", setNameQuery,
}) {
  const searching = nameQuery.trim().length > 0;
  return (
    <>
      <div style={nameSearchBar}>
        <input
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="단지 이름 검색"
          style={nameSearchInput}
          aria-label="단지 이름 검색"
        />
        {searching && (
          <button type="button" onClick={() => setNameQuery("")} style={nameSearchClear}>
            지우기
          </button>
        )}
      </div>
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
          // ⚠️ 검색 중일 때는 다른 안내를 준다. 📢 요주의 단지에서 넘어온 이름은 아직
          //    실거래가 없는 분양 신축일 수 있고(그건 정상 경로다), 그때 "조건에 맞는 단지가
          //    없습니다"만 뜨면 필터를 잘못 건드린 줄 알고 헤매게 된다.
          searching ? (
            <div style={nameSearchMiss}>
              <b>{nameQuery.trim()}</b>과(와) 일치하는 단지가 없어요.
              <br />
              아직 실거래가 없는 신축이거나, 실거래 등록명이 다를 수 있어요.
              <br />
              <button type="button" onClick={() => setNameQuery("")} style={{ ...nameSearchClear, marginTop: 6 }}>
                검색어 지우고 전체 보기
              </button>
            </div>
          ) : (
            <div style={hintText}>조건에 맞는 단지가 없습니다</div>
          )
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
                    <span style={r.hot ? hotBadge : r.yoy >= 0 ? upBadge : downBadge}>
                      {r.hot ? "🔥 " : ""}1년 {r.yoy >= 0 ? "+" : ""}{r.yoy}%
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
