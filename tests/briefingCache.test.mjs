import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFingerprint, kstDate } from "../app/lib/briefingCache.js";

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

// ⚠️ KST 경계 회귀 가드. UTC로 계산하면 KST 00:00~08:59에 어제 날짜가 나와
//    자정을 넘겨도 옛 30일 창·D-day를 재사용하게 된다(이 프로젝트 4번째 재발 지점).
test("UTC 15:00 = KST 익일 00:00에서 날짜가 넘어간다", () => {
  assert.equal(kstDate(Date.parse("2026-08-05T14:59:59Z")), "2026-08-05");
  assert.equal(kstDate(Date.parse("2026-08-05T15:00:00Z")), "2026-08-06");
});

test("날짜가 바뀌면 지문이 바뀐다", () => {
  assert.notEqual(fp({ kstDate: "2026-08-07" }), fp());
});
