import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFingerprint } from "../app/lib/briefingCache.js";

const FAVS = [
  { id: 1, lawd_cd: "41173", umd_nm: "호계동", apt_nm: "평촌어바인퍼스트",
    lat: 37.39, lng: 126.96, lease_end: null, note: null, note_date: null },
  { id: 2, lawd_cd: "11710", umd_nm: "거여동", apt_nm: "거여1단지",
    lat: 37.49, lng: 127.14, lease_end: "2026-11-30", note: "메모", note_date: null },
];
const BASE = { favs: FAVS, latestFetched: "2026-08-06T21:00:00.000Z", kstDate: "2026-08-06" };
const fp = (over = {}) => buildFingerprint({ ...BASE, ...over });

test("지문은 hex 문자열", () => {
  assert.match(fp(), /^[0-9a-f]{16}$/);
});

// 즐겨찾기 조회 순서(created_at desc)는 행 추가로 뒤바뀐다 — 순서만 달라진 것을
// 변경으로 오인하면 매번 재계산이라 캐시가 죽는다.
test("favorites 순서가 달라도 같은 지문", () => {
  assert.equal(fp({ favs: [...FAVS].reverse() }), fp());
});

test("★ 추가하면 지문이 바뀐다", () => {
  const added = [...FAVS, { lawd_cd: "11680", umd_nm: "대치동", apt_nm: "은마" }];
  assert.notEqual(fp({ favs: added }), fp());
});

test("★ 삭제하면 지문이 바뀐다", () => {
  assert.notEqual(fp({ favs: [FAVS[0]] }), fp());
});

test("메모·임대차 만기 수정하면 지문이 바뀐다", () => {
  const edited = [FAVS[0], { ...FAVS[1], note: "다른 메모" }];
  assert.notEqual(fp({ favs: edited }), fp());
  const lease = [FAVS[0], { ...FAVS[1], lease_end: "2027-01-31" }];
  assert.notEqual(fp({ favs: lease }), fp());
});

// 지도의 /api/trades가 캐시를 채워도 fetched_at이 올라간다 — cron만이 아니다.
test("max(fetched_at)이 바뀌면 지문이 바뀐다", () => {
  assert.notEqual(fp({ latestFetched: "2026-08-07T21:00:00.000Z" }), fp());
});

test("캐시가 비어 latestFetched가 null이어도 터지지 않는다", () => {
  assert.match(fp({ latestFetched: null }), /^[0-9a-f]{16}$/);
});

// KST 경계 자체의 회귀 가드는 tests/format.test.mjs(kstDate)로 옮겼다 —
// 오프셋이 lib/format.js 한 곳으로 모이면서 여기 있을 이유가 없어졌다(2026-08-14).
test("날짜가 바뀌면 지문이 바뀐다", () => {
  assert.notEqual(fp({ kstDate: "2026-08-07" }), fp());
});

// 지문 재료 고정(golden). 재료는 "입력"(★·수집시각·날짜) + PAYLOAD_VERSION 넷뿐이고,
// 그 조합이 바뀌면 이 값이 바뀐다.
// ⚠️ 이 테스트가 깨졌다면 둘 중 하나다:
//    ① PAYLOAD_VERSION을 의도적으로 올렸다 → 아래 기대값을 새 값으로 갱신하면 된다.
//    ② 재료를 실수로 바꿨다(특히 **PAYLOAD_VERSION을 재료에서 빼는 것**) → 되돌릴 것.
//    ②를 놓치면 payload 모양을 바꿔 배포해도 저장된 옛 payload가 그대로 나가고, KST 날짜가
//    넘어가는 다음날 06:00 cron까지 최대 하루 동안 "배포했는데 화면이 그대로"가 된다
//    (캐시 도입 2026-08-07 ~ 2026-08-14 사이 이 탈출구가 아예 없었다).
test("지문 재료가 고정돼 있다 (PAYLOAD_VERSION 포함)", () => {
  assert.equal(fp(), "3ead067992b1adea"); // PAYLOAD_VERSION = 1
});
