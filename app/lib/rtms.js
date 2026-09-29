// 국토부 실거래 API 응답 판정 + 타임아웃 fetch (순수 함수, supabase 미의존 — raw node 테스트 대상).
// trades.js(서버 전용, 단독 import 불가)에서 판정만 떼어냈다.
//
// ⚠️ **오류 본문을 "거래 0건인 달"로 통과시키지 말 것.** 예전엔 <resultCode>가 있고 00이 아닐 때만
//    던졌다 — resultCode가 없는 게이트웨이 오류(<OpenAPI_ServiceResponse>… returnReasonCode 22 =
//    일일 한도 초과), 평문("Unauthorized"), non-200은 parseTrades가 []를 돌려 "정상인 빈 달"이 됐다.
//    그러면 trade_raw_cache가 []로 덮이고, 다음 정상 수집 때 그 달 전체가 "오늘 신고"로 기록돼 🔥 핫플을
//    7일간 오염시킨다(2026-09-29 리뷰 지적). cron이 하루 ~136회 호출하게 되면서 노출이 커졌다.

// 오류면 사유 문자열, 정상이면 null. 정상 = 2xx + <resultCode>00|000.
export function rtmsResponseError(status, body) {
  if (!(status >= 200 && status < 300)) return `국토부 API HTTP ${status}`;
  const text = String(body || "");
  const reason = (text.match(/<returnReasonCode>([^<]*)<\/returnReasonCode>/) || [])[1];
  if (reason) {
    const msg = (text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/) || [])[1] || "gateway";
    return `국토부 API 게이트웨이 오류 ${reason}: ${msg}`;
  }
  const code = (text.match(/<resultCode>([^<]*)<\/resultCode>/) || [])[1];
  if (code == null) return `국토부 API 응답 형식 이상: ${text.slice(0, 60)}`;
  if (code !== "00" && code !== "000") {
    const msg = (text.match(/<resultMsg>([^<]*)<\/resultMsg>/) || [])[1] || "unknown";
    return `국토부 API 오류 ${code}: ${msg}`;
  }
  return null;
}

// 제한 시간 안에 응답이 없으면 실패하는 fetch. fetchImpl은 테스트 주입용(기본 전역 fetch).
// ⚠️ cron 전역 수집은 청크당 24건을 동시에 기다린다 — 한 건이 멈추면 maxDuration(60s)을 다 먹고
//    프루닝·브리핑 워밍을 조용히 건너뛴다(2026-09-29 리뷰 지적). 실패는 allSettled가 그 달만 버린다.
export function fetchWithTimeout(fetchImpl, url, opts = {}, ms = 8000) {
  return (fetchImpl || fetch)(url, { ...opts, signal: AbortSignal.timeout(ms) });
}
