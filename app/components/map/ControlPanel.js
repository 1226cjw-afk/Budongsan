"use client";

// 컨트롤 패널 — 지역·필터 선택 + 상태줄 + 두 서랍(★ 즐겨찾기 / 💰 내 자금).
// ⚠️ 여기 넣은 UI는 **모바일에서 ⚙️ 시트를 열어야만 보인다**. 상시 노출이 필요한
//    알림/배너는 이 패널 밖(상단 바 아래)에 따로 렌더할 것.
//    (부대비용 안내 배너가 이 이유로 모바일에서 안 보이지만 2026-07-25에 그대로 두기로
//     결정했다 — 고치지 말 것. 새로 만드는 알림에만 적용할 규칙.)

import { REGIONS } from "../../lib/regions";
import { C } from "../../lib/palette";
import { formatAgo } from "../../lib/format";
import { AREA_FILTERS, PRICE_FILTERS, MONTHLY_FILTERS } from "../../lib/mapFilters";
import {
  panelTitle, newsTabLink, newsBadge, selectStyle, pillBtn, pillBtnOn,
  statusText, refreshBtn, hintLine, legendRow, legendItem, legendDot,
  migrateNotice, linkBtn,
} from "../mapStyles";
import ProfileDrawer from "./ProfileDrawer";
import FavoriteDrawer from "./FavoriteDrawer";

export default function ControlPanel({
  isMobile, newsNew, loading, status, lastUpdated,
  lawdCd, onSelectRegion, onRefresh,
  area, setArea, price, setPrice, monthly, setMonthly,
  affordMode, hasProfile, assets, priceBasis,
  favorites, showFavs, setShowFavs, showProfile, setShowProfile, onOpenList,
  showCostNotice, onDismissCostNotice,
  profile, updateProfile, owned, ownedSalePrice, ownedNet,
  favProps,
}) {
  return (
    <>
      {!isMobile && (
        <div style={{ ...panelTitle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>🏠 실거래 · 대출 비교</span>
          <a href="/news" style={newsTabLink}>
            📰 뉴스{newsNew > 0 && <span style={newsBadge}>{newsNew}</span>}
          </a>
        </div>
      )}

      <select
        value={lawdCd}
        onChange={(e) => onSelectRegion(e.target.value)}
        disabled={loading}
        style={selectStyle}
      >
        {REGIONS.map((g) => (
          <optgroup key={g.sido} label={g.sido}>
            {g.items.map((it) => (
              <option key={it.code} value={it.code}>{it.name}</option>
            ))}
          </optgroup>
        ))}
      </select>

      <div style={{ display: "flex", gap: 8 }}>
        <select value={area} onChange={(e) => setArea(e.target.value)} disabled={loading} style={{ ...selectStyle, flex: 1 }}>
          {AREA_FILTERS.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
        <select value={price} onChange={(e) => setPrice(e.target.value)} disabled={loading} style={{ ...selectStyle, flex: 1 }}>
          {PRICE_FILTERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {affordMode && (
        <select
          value={monthly}
          onChange={(e) => setMonthly(e.target.value)}
          disabled={loading}
          style={selectStyle}
          title="월 원리금 상환액 상한으로 거르기"
        >
          {MONTHLY_FILTERS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => { setShowFavs((v) => !v); setShowProfile(false); }}
          style={{ ...pillBtn, ...(showFavs ? pillBtnOn : null) }}
        >
          ★ 즐겨찾기 {favorites.length}
        </button>
        <button
          onClick={() => { setShowProfile((v) => !v); setShowFavs(false); }}
          style={{ ...pillBtn, ...(showProfile ? pillBtnOn : null) }}
        >
          💰 내 자금{hasProfile ? " ✓" : ""}
        </button>
        {isMobile && (
          <button onClick={onOpenList} style={pillBtn}>
            📋 목록
          </button>
        )}
      </div>

      <div style={statusText}>{status}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={hintLine}>
          {lastUpdated ? `🕒 갱신 ${formatAgo(lastUpdated)}` : "지도 이동 → 지역 전환"}
        </span>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={refreshBtn}
          title="실거래가 새로 갱신"
        >
          🔄 갱신
        </button>
      </div>
      {showCostNotice && (
        <div style={migrateNotice}>
          필요자금에 <b>취득세·중개보수·등기비</b>가 반영되도록 개선했습니다.
          이전보다 필요자금이 커 보이는 게 정상이에요.
          <button onClick={onDismissCostNotice} style={{ ...linkBtn, marginLeft: 6, fontSize: 11 }}>
            확인
          </button>
        </div>
      )}
      {hasProfile && assets > 0 && (
        <div style={legendRow}>
          <span style={legendItem}><span style={{ ...legendDot, background: C.green }} />구매가능</span>
          <span style={legendItem}><span style={{ ...legendDot, background: C.red }} />자금부족</span>
          <span style={{ color: C.muted }}>· {priceBasis === "recent" ? "최근가" : "평균가"} 기준</span>
        </div>
      )}
      {!isMobile && (
        <div style={hintLine}>지도 이동 → 지역 전환 · 빈 곳 클릭 → 가까운 단지</div>
      )}

      {showProfile && (
        <ProfileDrawer
          profile={profile}
          updateProfile={updateProfile}
          owned={owned}
          ownedSalePrice={ownedSalePrice}
          ownedNet={ownedNet}
          assets={assets}
          priceBasis={priceBasis}
        />
      )}

      {showFavs && <FavoriteDrawer favorites={favorites} {...favProps} />}
    </>
  );
}
