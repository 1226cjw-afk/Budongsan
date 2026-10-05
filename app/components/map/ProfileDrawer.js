"use client";

// 내 자금 설정 서랍 — 컨트롤 패널의 💰 버튼으로 열린다.
// ⚠️ 여기 입력은 마커 색칠·리스트 배지·평형 카드·브리핑까지 전부 먹인다(단일 소스).
//    새 자금 입력을 늘릴 때 계산에 반영할 곳은 두 군데뿐이다:
//    assets 정의(자기자금 쪽) / calcMaxLoan의 requiredCash(비용 쪽) — KakaoMap.js 참조.

import { regionName } from "../../lib/regions";
import { toPyeong } from "../../lib/tradeStats";
import { C } from "../../lib/palette";
import { addYearsYmd, daysUntil, formatManwon } from "../../lib/format";
import {
  drawer, drawerHead, fieldRow, fieldLabel, fieldInput, hintLine,
  ownedBox, ownedClearBtn,
} from "../mapStyles";

// 1주택 양도세 비과세: 보유 2년 + 12억 이하(소득세법 §89①3, 고가 기준 12억은 2021-12-08~).
// 양도일 = 잔금일(둘 중 빠른 등기일). 취득 당시 조정대상지역이면 거주 2년 요건 추가.
// 단기양도 중과: 보유 1년 미만 70% / 1~2년 60% (2021-06-01 이후 양도분, 확인일 2026-07-05).
// ⚠️ D-day를 Date 산술로 세지 말 것 — new Date("YYYY-MM-DD")는 UTC 자정이라
//    (free - Date.now())로 세면 KST 브라우저에서 당일 09:00 이전에 하루가 더 남은 것처럼
//    나온다("오늘부터 비과세"인 날 아침에 D-1). 문자열로 더하고(addYearsYmd) 로컬 자정
//    기준 daysUntil로 세면 ★ 즐겨찾기 D-day와도 같은 기준이 된다. (2026-08-30 교정)
function TaxFreeLine({ acquiredYmd }) {
  const freeYmd = addYearsYmd(acquiredYmd, 2);
  if (!freeYmd) return null;
  const dd = daysUntil(freeYmd);
  return (
    <div style={{ fontSize: 11, marginTop: 3, lineHeight: 1.5, fontWeight: 600, color: dd > 0 ? "#b45309" : C.green }}>
      {dd > 0
        ? `⏳ 비과세(보유 2년) ${freeYmd}부터 · D-${dd} — 그 전 양도(잔금)는 단기중과 60~70%`
        : "✓ 보유 2년 충족 — 12억 이하 비과세 가능(잔금일 기준 · 취득 시 조정지역이었다면 거주요건 별도, 세무사 확인)"}
    </div>
  );
}

export default function ProfileDrawer({
  profile, updateProfile, owned, ownedSalePrice, ownedNet, assets, priceBasis,
}) {
  return (
    <div style={drawer}>
      <div style={drawerHead}>내 자금 설정 <span style={{ color: C.muted, fontWeight: 400 }}>(단위: 만원)</span></div>
      <label style={fieldRow}>
        <span style={fieldLabel}>보유자산</span>
        <input type="number" value={profile.assets} onChange={(e) => updateProfile({ assets: e.target.value })} placeholder="예: 50000" style={fieldInput} />
      </label>
      <div style={ownedBox}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>🔁 갈아타기 — 보유 주택 매도</div>
        {owned ? (
          <>
            <div style={{ fontSize: 12, color: C.sub, margin: "4px 0 2px" }}>
              🏠 {regionName(owned.lawdCd)} {owned.umdNm} {owned.aptNm} {toPyeong(owned.area)}평
              <button onClick={() => updateProfile({ owned: null })} style={ownedClearBtn}>해제</button>
            </div>
            <label style={fieldRow}>
              <span style={fieldLabel}>대출 잔액</span>
              <input type="number" value={profile.ownedLoanBalance} onChange={(e) => updateProfile({ ownedLoanBalance: e.target.value })} placeholder="0" style={fieldInput} />
            </label>
            <label style={fieldRow}>
              <span style={fieldLabel}>보증금 반환</span>
              <input type="number" value={profile.ownedDeposit} onChange={(e) => updateProfile({ ownedDeposit: e.target.value })} placeholder="0" style={fieldInput} />
            </label>
            <label style={fieldRow}>
              <span style={fieldLabel}>취득일(잔금)</span>
              <input type="date" value={profile.ownedAcquiredYmd} onChange={(e) => updateProfile({ ownedAcquiredYmd: e.target.value })} style={fieldInput} />
            </label>
            {profile.ownedAcquiredYmd && <TaxFreeLine acquiredYmd={profile.ownedAcquiredYmd} />}
            <div style={{ fontSize: 11, color: C.sub, marginTop: 4, lineHeight: 1.5 }}>
              매도가 <b style={{ color: C.text }}>{formatManwon(ownedSalePrice)}</b>
              ({priceBasis === "recent" ? "최근가" : "평균가"} · {owned.capturedYmd} 시세)
              {" → "}실수령 <b style={{ color: C.text }}>{formatManwon(ownedNet)}</b>
              {" · "}가용 자기자금 <b style={{ color: C.blue }}>{formatManwon(assets)}</b>
            </div>
          </>
        ) : (
          <div style={{ ...hintLine, marginTop: 2 }}>
            단지 세부패널의 평형 카드에서 <b>보유 지정</b>을 누르면 예상 매도대금이 자기자금에 합산됩니다
          </div>
        )}
      </div>
      <label style={fieldRow}>
        <span style={fieldLabel}>연소득</span>
        <input type="number" value={profile.income} onChange={(e) => updateProfile({ income: e.target.value })} placeholder="예: 7000" style={fieldInput} />
      </label>
      <label style={fieldRow}>
        <span style={fieldLabel}>기존대출 연상환</span>
        <input type="number" value={profile.existingDebt} onChange={(e) => updateProfile({ existingDebt: e.target.value })} placeholder="0" style={fieldInput} />
      </label>
      <label style={fieldRow}>
        <span style={fieldLabel}>월 저축액</span>
        <input
          type="number"
          value={profile.monthlySaving}
          onChange={(e) => updateProfile({ monthlySaving: e.target.value })}
          placeholder="선택"
          style={fieldInput}
          title="입력하면 자금이 부족한 평형에 '얼마나 더 모으면 되는지'가 표시됩니다"
        />
      </label>
      <label style={fieldRow}>
        <span style={fieldLabel}>가구유형</span>
        <select value={profile.householdType} onChange={(e) => updateProfile({ householdType: e.target.value })} style={fieldInput}>
          <option value="무주택">무주택</option>
          <option value="1주택">1주택</option>
          <option value="다주택">다주택</option>
        </select>
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <label style={{ ...fieldRow, flex: 1 }}>
          <span style={fieldLabel}>금리%</span>
          <input type="number" step="0.1" value={profile.rate} onChange={(e) => updateProfile({ rate: e.target.value })} style={{ ...fieldInput, width: 64 }} />
        </label>
        <label style={{ ...fieldRow, flex: 1 }}>
          <span style={fieldLabel}>만기년</span>
          <input type="number" value={profile.termYears} onChange={(e) => updateProfile({ termYears: e.target.value })} style={{ ...fieldInput, width: 64 }} />
        </label>
      </div>
      <label style={{ ...fieldRow, cursor: "pointer" }}>
        <span style={fieldLabel}>생애최초 구입</span>
        <input type="checkbox" checked={profile.isFirstTime} onChange={(e) => updateProfile({ isFirstTime: e.target.checked })} />
      </label>
      <div style={hintLine}>단지를 클릭하면 평형별 대출 가능액이 계산됩니다</div>
    </div>
  );
}
