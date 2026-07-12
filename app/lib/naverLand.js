// 네이버 부동산(m.land) 단지 검색 딥링크. ⚠️ 국토부 단지명엔 "동편마을(3단지)"처럼 괄호가 흔한데,
// 네이버는 검색어에 괄호가 들어가면 단지 매칭에 실패("검색결과가 없습니다")한다. 괄호 처리 2단계:
// ① 괄호 안이 동·필지번호(숫자/영문/쉼표·하이픈뿐 or "제N(상가)동")면 **통째로 제거** — 네이버가
//   모르는 토큰이라 넣으면 0건, 빼면 정확 매칭(2026-07-05 실측: 한미(A1,A2,B)·트윈팰리스(101동)·
//   대아(제101상가동) 단지 페이지 복구. 삼성(931)류는 빼도 0건이지만 나빠지진 않음).
// ② 한글이 든 괄호는 **공백으로 풀어 유지** — 단지 구분자라 빼면 오히려 0건(2026-06-30 실측:
//   동편마을(3단지)·한가람(두산) 등은 내용 포함해야 정확 매칭). best-effort — 단지 고정 URL 비공개.
export function naverLandUrl(umdNm, aptNm) {
  const cleaned = aptNm.replace(/\(([^)]*)\)/g, (_, inner) =>
    /^[0-9A-Za-z.,\-\s]*$/.test(inner) || /^제?\d+(상가)?동$/.test(inner) ? " " : ` ${inner} `
  );
  const q = `${umdNm} ${cleaned}`.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  return `https://m.land.naver.com/search/result/${encodeURIComponent(q)}`;
}
