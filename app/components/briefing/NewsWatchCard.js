"use client";

// 📢 요주의 단지 — 최근 뉴스에 반복 등장한 단지. ★를 담을 후보를 자동으로 골라준다.
//
// 이 앱의 순환은 "★를 담는 행위가 브리핑을 만든다"인데(cron이 그 지역을 매일 갱신),
// **첫 ★를 담게 만드는 입구**가 지금껏 비어 있었다. 이 카드가 그 입구다.
//
// ⚠️ **★를 여기서 직접 담지 않는다 — 지도로 보내기만 한다.** 뉴스가 쓰는 이름과 국토부
//    실거래명이 일치하지 않기 때문이다(실측: 뉴스 '구로주공' ↔ 실거래 '주공1'·'주공2',
//    문자열 일치 0건). 이름을 짐작해 ★를 만들면 즐겨찾기 키(lawd_cd·umd_nm·apt_nm)가
//    어긋나 ⭐관심단지·새 거래 피드가 영원히 비는 죽은 행이 된다. 판단은 지도에서 눈으로.
// ⚠️ 같은 이유로 "★ 담김" 표시도 하지 않는다 — 몰래 이름 매칭을 하는 셈이라 위 전제를 배신한다.

import { card, cardHead, headSub, row, rowDivider, rowTop, rowName, rowMeta, tagBase } from "./styles";
import { C } from "../../lib/palette";

export default function NewsWatchCard({ rows, days = 7 }) {
  return (
    <section>
      <div style={cardHead}>
        📢 뉴스가 주목한 단지
        <span style={headSub}> · 최근 {days}일 반복 등장</span>
      </div>
      <div style={card}>
        {rows.map((r, i) => (
          <div key={r.name} style={{ ...row, ...(i > 0 ? rowDivider : null) }}>
            <div style={rowTop}>
              <div style={rowName}>
                {r.name}
                {r.regionName && <span style={regionText}> · {r.regionName}</span>}
              </div>
              <span style={countTag}>
                기사 {r.articles}건 · {r.days}일
              </span>
            </div>

            {r.top.link && (
              <a href={r.top.link} target="_blank" rel="noreferrer" style={topLink}>
                {r.top.title}
              </a>
            )}

            {/* ⚠️ 지역을 못 정한 행은 이동 버튼을 감춘다. 나열 기사('개포우성·구로주공·
                번동주공1 등…')에서 제목의 지역을 집으면 엉뚱한 구로 보내게 되는데,
                틀린 곳으로 보내느니 기사만 보여주는 게 낫다. */}
            {r.lawdCd ? (
              <a
                href={`/?lawdCd=${r.lawdCd}&q=${encodeURIComponent(r.name)}`}
                style={gotoBtn}
              >
                지도에서 보기 →
              </a>
            ) : (
              <div style={{ ...rowMeta, marginTop: 6 }}>지역이 특정되지 않아 기사로만 확인돼요</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const regionText = { fontSize: 11.5, fontWeight: 500, color: C.muted };
const countTag = { ...tagBase, color: "#9a3412", background: "#ffedd5" };
const topLink = {
  display: "block", marginTop: 5, fontSize: 11.5, color: C.sub,
  textDecoration: "none", lineHeight: 1.45,
};
const gotoBtn = {
  display: "inline-block", marginTop: 7, padding: "4px 9px",
  fontSize: 11, fontWeight: 700, color: "#1d4ed8", background: C.blueSoft,
  borderRadius: 7, textDecoration: "none",
};
