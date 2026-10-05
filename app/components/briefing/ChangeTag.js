// "직전 대비 ±N%" 배지 — ⭐ 관심 단지·🆕 새 거래가 공유.
// ⚠️ 소수 1자리로 반올림한 뒤 0이면 "같음"으로 쓴다. 예전엔 노란 상승 배지에 "+0.0%"를 찍었고
//    (2026-10-05 prod 홍제한양 실측), −0.04%는 부호 판정(`chg >= 0`)과 toFixed가 갈려 "-0.0%"가 됐다.

import { formatManwon } from "../../lib/format";
import { upTag, downTag, flatTag } from "./styles";

export default function ChangeTag({ chg, prev }) {
  if (chg == null || !Number.isFinite(chg)) return null;
  const r = Math.round(chg * 10) / 10;
  const base = prev ? `직전 ${formatManwon(prev)}` : "직전";
  // 조사(과/와)는 금액 끝소리에 따라 갈려 붙이지 않는다.
  if (r === 0) return <span style={flatTag}>{prev ? `보합 · ${base}` : "직전과 같음"}</span>;
  return (
    <span style={r > 0 ? upTag : downTag}>
      {base} 대비 {r > 0 ? "+" : ""}
      {r.toFixed(1)}%
    </span>
  );
}
