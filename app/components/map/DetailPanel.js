"use client";

// 단지 세부 패널 — 헤더(시세·배지·링크) + 평형 카드 목록.
// ⚠️ 모바일 시트에서는 백드롭 탭·그립으로 닫는다. closeBtn은 absolute라 시트에서 좌표가 어긋나
//    !isMobile일 때만 렌더한다.
// ⚠️ 호출부(KakaoMap)는 이 컴포넌트를 `selected && detail &&` 가드 뒤에서만 렌더할 것 —
//    JSX를 변수로 빼면 children 표현식이 즉시 평가돼 selected가 null일 때 터진다.

import { C } from "../../lib/palette";
import { formatManwon, shortDate } from "../../lib/format";
import { EXCESS_HOT_PCT, REBUILD_AGE, isHotYoy } from "../../lib/mapFilters";
import {
  closeBtn, starBtn, sectionLabel, newsLink, hintLine, noticeBox, linkBtn,
  hotBadge, upBadge, downBadge, rebuildBadge, excessBadge, excessHotBadge,
  basisToggle, basisBtn, basisBtnOn, helpBtn, regBadge, nonRegBadge,
} from "../mapStyles";
import PyeongCard from "./PyeongCard";

// 1년 상승률 + 지역 대비 초과상승 + 재건축 연한 배지 묶음.
function HeaderBadges({ yoy, rankMedian, rebuild }) {
  if (yoy == null && !rebuild) return null;
  const ex = yoy != null && rankMedian != null ? Math.round(yoy - rankMedian) : null;
  const hot = isHotYoy(yoy, rankMedian); // 리스트·핀과 같은 판정(lib/mapFilters)
  return (
    <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
      {yoy != null && (
        <span style={hot ? hotBadge : yoy >= 0 ? upBadge : downBadge}>
          {hot ? "🔥 " : ""}1년 {yoy >= 0 ? "+" : ""}{yoy}%
        </span>
      )}
      {ex != null && (
        <span
          style={ex >= EXCESS_HOT_PCT ? excessHotBadge : excessBadge}
          title={`단지 1년 상승률 − 지역 중앙값(${rankMedian >= 0 ? "+" : ""}${rankMedian}%) = 지역 대비 초과상승. 크게 양수면 재건축 등 기대가 이미 가격에 선반영된 정도가 큼(되돌림 주의), 0 근처면 지역 장세 동행.`}
        >
          {ex >= EXCESS_HOT_PCT ? "⚡ " : ""}지역 대비 {ex >= 0 ? "+" : ""}{ex}%p
        </span>
      )}
      {rebuild && <span style={rebuildBadge}>🏗 재건축연한</span>}
    </div>
  );
}

export default function DetailPanel({
  selected, detail, info, isMobile, onClose, regionLabel, months,
  yoy, rankMedian, isFav, onToggleFavorite,
  regulated, priceBasis, setPriceBasis, onShowHelp,
  hasProfile, onOpenProfile, excluded,
  loanForGroup, trendArea, setTrendArea, trend, trendMonths, setTrendMonths,
  isOwnedPyeong, onToggleOwned, showCost, setShowCost, profile, assets,
}) {
  const rebuild = !!detail.buildYear && new Date().getFullYear() - Number(detail.buildYear) >= REBUILD_AGE;

  return (
    <>
      {!isMobile && (
        <button onClick={onClose} style={closeBtn} aria-label="닫기">×</button>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingRight: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text, lineHeight: 1.25 }}>{selected.aptNm}</div>
          {detail.overall && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: -0.3 }}>
                {formatManwon(detail.overall.recentAmount)}
              </span>
              <span style={{ fontSize: 11, color: C.muted }}>
                최근 실거래({shortDate(detail.overall.recentDate)}) · 평균 {formatManwon(detail.overall.avg)}
              </span>
            </div>
          )}
          <HeaderBadges yoy={yoy} rankMedian={rankMedian} rebuild={rebuild} />
          <div style={{ fontSize: 12, color: C.sub, marginTop: 5 }}>
            {regionLabel} {selected.umdNm}
            {detail.buildYear ? ` · ${detail.buildYear}년 준공` : ""}
            {info.data?.households ? ` · ${info.data.households.toLocaleString()}세대` : ""}
            {info.data?.dongCnt ? ` · ${info.data.dongCnt}개동` : ""}
            {detail.overall ? ` · 최근 ${months}개월 ${detail.overall.count}건` : ""}
          </div>
          <a
            href={`https://search.naver.com/search.naver?query=${encodeURIComponent(`${regionLabel} ${selected.aptNm}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={newsLink}
          >
            🔎 네이버 검색
          </a>
        </div>
        <button onClick={onToggleFavorite} style={starBtn} title="즐겨찾기">
          {isFav ? "★" : "☆"}
        </button>
      </div>

      {/* 평형별 시세 · 대출 */}
      <div style={{ ...sectionLabel, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          평형별 시세·대출
          <span style={regulated ? regBadge : nonRegBadge}>{regulated ? "규제지역" : "비규제"}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={basisToggle}>
            {[["recent", "최근"], ["avg", "평균"]].map(([v, l]) => (
              <button key={v} onClick={() => setPriceBasis(v)} style={{ ...basisBtn, ...(priceBasis === v ? basisBtnOn : null) }}>
                {l}
              </button>
            ))}
          </span>
          <button onClick={onShowHelp} style={helpBtn} title="LTV·DSR 계산 설명">?</button>
        </span>
      </div>

      {!hasProfile && (
        <div style={noticeBox}>
          <button onClick={onOpenProfile} style={linkBtn}>💰 내 자금 설정</button>
          {" "}하면 평형별 대출 가능액이 함께 표시됩니다.
        </div>
      )}

      <div style={hintLine}>
        평형을 누르면 시세 추세 그래프가 펼쳐져요
        {excluded && (excluded.cancelled > 0 || excluded.direct > 0) && (
          <>
            {" · "}
            <span title="계약 해제된 거래와 가족간 증여성 거래가 많은 직거래는 시세에서 뺐습니다">
              이 지역 해제 {excluded.cancelled}건·직거래 {excluded.direct}건 제외됨
            </span>
          </>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        {detail.groups.map((g) => {
          const { ln, gap } = loanForGroup(g); // 마커·리스트와 같은 계산(농특세 포함)
          return (
            <PyeongCard
              key={g.m2}
              g={g}
              ln={ln}
              gap={gap}
              selected={selected}
              isSel={trendArea === g.m2}
              onSelectArea={setTrendArea}
              isOwned={isOwnedPyeong(g)}
              onToggleOwned={onToggleOwned}
              regulated={regulated}
              profile={profile}
              assets={assets}
              trend={trend}
              trendMonths={trendMonths}
              setTrendMonths={setTrendMonths}
              showCost={showCost}
              setShowCost={setShowCost}
            />
          );
        })}
      </div>
    </>
  );
}
