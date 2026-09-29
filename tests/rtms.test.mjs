import { test } from "node:test";
import assert from "node:assert/strict";
import { rtmsResponseError, fetchWithTimeout } from "../app/lib/rtms.js";

// 국토부 응답 판정. ⚠️ 오류 본문을 "거래 0건인 달"로 삼키면 캐시가 []로 덮이고, 다음 정상 수집 때
// 그 달 전체가 "오늘 신고"로 기록돼 🔥 핫플 7일을 오염시킨다(2026-09-29 리뷰 지적 — resultCode 없는
// 게이트웨이 오류·평문 오류·non-200을 그냥 통과시키고 있었다).

const OK = "<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items></items></body></response>";

test("정상 응답(resultCode 00/000)은 오류가 아니다 — 거래 0건 달도 정상", () => {
  assert.equal(rtmsResponseError(200, OK), null);
  assert.equal(rtmsResponseError(200, OK.replace("000", "00")), null);
});

test("resultCode가 00이 아니면 오류", () => {
  const xml = "<response><header><resultCode>03</resultCode><resultMsg>NO_DATA</resultMsg></header></response>";
  assert.match(rtmsResponseError(200, xml), /03/);
});

test("게이트웨이 오류(OpenAPI_ServiceResponse · returnReasonCode)는 오류", () => {
  const xml = "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
  assert.match(rtmsResponseError(200, xml), /22/);
});

test("resultCode 없는 평문 본문은 오류", () => {
  assert.ok(rtmsResponseError(200, "Unauthorized"));
  assert.ok(rtmsResponseError(200, "API rate limit exceeded"));
});

test("HTTP 상태가 2xx가 아니면 본문과 무관하게 오류", () => {
  assert.match(rtmsResponseError(502, OK), /502/);
});

test("fetchWithTimeout은 응답이 안 오면 제한 시간 뒤 실패한다", async () => {
  const hang = (_url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
  const t0 = Date.now();
  await assert.rejects(fetchWithTimeout(hang, "http://x", {}, 50));
  assert.ok(Date.now() - t0 < 1000);
});

test("fetchWithTimeout은 제때 온 응답을 그대로 돌려준다", async () => {
  const quick = async () => ({ ok: true, status: 200 });
  assert.deepEqual(await fetchWithTimeout(quick, "http://x", {}, 1000), { ok: true, status: 200 });
});
