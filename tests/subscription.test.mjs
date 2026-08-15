import { test } from "node:test";
import assert from "node:assert/strict";
import { lawdCdFromAddress } from "../app/lib/regions.js";
import { extractRows, normalizeLhRow, isCapitalRegion } from "../app/lib/lhNotice.js";

// ── 공고 주소 → LAWD_CD ────────────────────────────────────
// 청약 공고는 시군구 코드를 주지 않고 주소 문자열만 준다. 이 역매칭이 틀리면 규제지역
// 판정(LTV)이 뒤집혀 카드의 "자금 여유"가 통째로 거짓말이 된다.
test("서울 자치구 주소를 코드로 되돌린다", () => {
  assert.equal(lawdCdFromAddress("서울특별시 구로구 오리로1165"), "11530");
  assert.equal(lawdCdFromAddress("서울특별시 강남구 삼성동 1-1"), "11680");
});

// ⚠️ 한 시에 여러 구가 있으면 짧은 이름이 먼저 걸려 엉뚱한 구로 붙는다 → 긴 이름 우선.
test("같은 시의 다른 구를 구별한다", () => {
  assert.equal(lawdCdFromAddress("경기도 수원시 장안구 정자동"), "41111");
  assert.equal(lawdCdFromAddress("경기도 수원시 권선구 곡반정동"), "41113");
  assert.equal(lawdCdFromAddress("경기도 안양시 동안구 비산동"), "41173");
});

// ⚠️ 시도까지 봐야 타 시도의 동명 자치구가 서울 중구(11140)로 잘못 붙지 않는다.
test("목록 밖 지역은 null (임의의 코드로 붙지 않는다)", () => {
  assert.equal(lawdCdFromAddress("인천광역시 중구 신흥동"), null);
  assert.equal(lawdCdFromAddress("부산광역시 해운대구"), null);
  assert.equal(lawdCdFromAddress(""), null);
  assert.equal(lawdCdFromAddress(null), null);
});

// ── LH 응답 파서 ───────────────────────────────────────────
// ⚠️ 이 파서는 **실응답을 못 본 채** 작성됐다(활용신청 전이라 403). 그래서 응답 모양이
//    바뀌어도 죽지 않는지를 테스트로 고정한다. 승인 후 실제 키가 확인되면 이 테스트에
//    실제 샘플을 한 건 추가할 것.
test("LH 응답: dsList 래핑을 벗긴다", () => {
  const json = [{ resHeader: { RS_CODE: "00" } }, { dsList: [{ PAN_NM: "행복주택" }] }];
  assert.deepEqual(extractRows(json), [{ PAN_NM: "행복주택" }]);
});

test("LH 응답: 표준 items 래핑도 받는다", () => {
  const json = { response: { body: { items: [{ PAN_NM: "든든전세" }] } } };
  assert.deepEqual(extractRows(json), [{ PAN_NM: "든든전세" }]);
});

test("LH 응답: 알 수 없는 모양이면 빈 배열 (throw 금지)", () => {
  assert.deepEqual(extractRows(null), []);
  assert.deepEqual(extractRows({ nope: 1 }), []);
  assert.deepEqual(extractRows([{ resHeader: {} }]), []);
});

test("LH 정규화: PK에 기관 접두사가 붙는다", () => {
  // ⚠️ 청약홈 주택관리번호와 한 테이블(PK)을 쓰므로 접두사가 없으면 언젠가 덮어쓴다.
  const r = normalizeLhRow({
    row: { PAN_ID: "12345", PAN_NM: "수원 행복주택", CNP_CD_NM: "경기", CLSG_DT: "20260901" },
    label: "임대",
  });
  assert.equal(r.houseManageNo, "LH:12345");
  assert.equal(r.agency, "LH");
});

test("LH 정규화: 날짜 형식이 뭐가 오든 YYYY-MM-DD", () => {
  const mk = (clsg) =>
    normalizeLhRow({ row: { PAN_ID: "1", PAN_NM: "n", CLSG_DT: clsg }, label: "임대" }).receiptEnd;
  assert.equal(mk("20260901"), "2026-09-01");
  assert.equal(mk("2026-09-01"), "2026-09-01");
  assert.equal(mk("2026.09.01"), "2026-09-01");
  assert.equal(mk(""), null);
  assert.equal(mk(undefined), null);
});

test("LH 정규화: 이름이나 번호가 없으면 버린다", () => {
  assert.equal(normalizeLhRow({ row: { PAN_NM: "이름만" }, label: "임대" }), null);
  assert.equal(normalizeLhRow({ row: { PAN_ID: "1" }, label: "임대" }), null);
});

// url이 없으면 목록 페이지로라도 보낸다 — 카드가 "#"를 걸어 죽은 링크가 되지 않게.
test("LH 정규화: 상세 URL이 없어도 유효한 링크를 준다", () => {
  const r = normalizeLhRow({ row: { PAN_ID: "1", PAN_NM: "n" }, label: "임대" });
  assert.match(r.url, /^https:\/\/apply\.lh\.or\.kr\//);
  const rel = normalizeLhRow({
    row: { PAN_ID: "1", PAN_NM: "n", DTL_URL: "/lhapply/x.do" },
    label: "임대",
  });
  assert.equal(rel.url, "https://apply.lh.or.kr/lhapply/x.do");
});

test("수도권 판정", () => {
  assert.equal(isCapitalRegion("서울특별시"), true);
  assert.equal(isCapitalRegion("경기도 수원시"), true);
  assert.equal(isCapitalRegion("인천광역시"), true);
  assert.equal(isCapitalRegion("부산광역시"), false);
  assert.equal(isCapitalRegion(""), false);
});
