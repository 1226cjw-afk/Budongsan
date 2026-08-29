"use client";

// ★ 즐겨찾기 서랍 — 행 클릭=그 단지로 이동 / ✎=D-day 편집 / 🗑=해제.
// ⚠️ **🗑 해제 경로를 지우지 말 것.** 지도만으로는 못 지우는 ★가 실제로 생긴다:
//    단지 핀은 면적·가격 필터를 통과한 거래가 있어야만 그려지고, 타지역 ★ 폴백은
//    현재 지역을 제외한다 → 그 지역에 있는 동안 필터에 걸리면 핀이 아예 없고,
//    세부패널의 ★ 버튼은 단지를 선택해야 열리므로 **도달 자체가 불가능**하다
//    (2026-08-15 구로구 예원아파트: 94.63㎡ = 공급 38평이라 "24~34평" 필터 하나로 재현).
//    그래서 onRemove는 **지도 상태에 전혀 의존하지 않는다** — 담을 때 지도가 필요한 건
//    자연스럽지만 뺄 때는 절대 그러면 안 된다.

import { regionName } from "../../lib/regions";
import { C } from "../../lib/palette";
import { daysUntil, leaseLabel } from "../../lib/format";
import {
  drawer, hintText, fieldRow, fieldLabel, fieldInput,
  favRow, favEditBtn, favDelBtn, favDdayLine, favEditBox, favSaveBtn,
} from "../mapStyles";

export default function FavoriteDrawer({
  favorites, onGoto, onRemove, favEdit, setFavEdit, favDdayErr, setFavDdayErr, onSave,
}) {
  return (
    <div style={{ ...drawer, maxHeight: 280, overflowY: "auto" }}>
      {favorites.length === 0 ? (
        <div style={hintText}>즐겨찾기가 없습니다</div>
      ) : (
        favorites.map((f) => (
          <div key={f.id} style={favRow}>
            <div onClick={() => onGoto(f)} style={{ cursor: "pointer", display: "flex", alignItems: "baseline" }}>
              <span style={{ flexGrow: 1, minWidth: 0 }}>
                <span style={{ color: C.amber }}>★</span> {f.apt_nm}
                <span style={{ color: C.muted }}> · {regionName(f.lawd_cd)} {f.umd_nm}</span>
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFavDdayErr("");
                  setFavEdit(
                    favEdit?.id === f.id
                      ? null
                      : { id: f.id, leaseEnd: f.lease_end || "", note: f.note || "", noteDate: f.note_date || "" }
                  );
                }}
                style={favEditBtn}
                title="임대차 만기·이벤트 메모 D-day 입력"
              >
                ✎
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation(); // 행 클릭(onGoto)으로 새지 않게
                  onRemove(f);
                }}
                style={favDelBtn}
                title="즐겨찾기에서 삭제"
              >
                🗑
              </button>
            </div>
            {favEdit?.id !== f.id && (f.lease_end || f.note) && (
              <div style={favDdayLine}>
                {f.lease_end && <span>🔑 {leaseLabel(f.lease_end)}</span>}
                {f.note && (
                  <span>
                    📌 {f.note}
                    {f.note_date ? ` · ${daysUntil(f.note_date) >= 0 ? "D-" + daysUntil(f.note_date) : daysUntil(f.note_date) * -1 + "일 지남"}` : ""}
                  </span>
                )}
              </div>
            )}
            {favEdit?.id === f.id && (
              <div style={favEditBox}>
                <label style={fieldRow}>
                  <span style={fieldLabel}>임대차 만기</span>
                  <input type="date" value={favEdit.leaseEnd} onChange={(e) => setFavEdit({ ...favEdit, leaseEnd: e.target.value })} style={fieldInput} />
                </label>
                <label style={fieldRow}>
                  <span style={fieldLabel}>이벤트 메모</span>
                  <input type="text" value={favEdit.note} onChange={(e) => setFavEdit({ ...favEdit, note: e.target.value })} placeholder="예: 재건축 결정" style={fieldInput} />
                </label>
                <label style={fieldRow}>
                  <span style={fieldLabel}>이벤트 날짜</span>
                  <input type="date" value={favEdit.noteDate} onChange={(e) => setFavEdit({ ...favEdit, noteDate: e.target.value })} style={fieldInput} />
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <button onClick={onSave} style={favSaveBtn}>저장</button>
                  {favDdayErr && <span style={{ fontSize: 11, color: C.red }}>{favDdayErr}</span>}
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
