import { test } from "node:test";
import assert from "node:assert/strict";
import { lawdCdFromAddress } from "../app/lib/regions.js";
import {
  extractRows, normalizeLhRow, isCapitalRegion, dropRevisedDuplicates,
} from "../app/lib/lhNotice.js";

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
// ✅ 아래 REAL_ROW는 2026-08-15 승인 직후 받은 **실응답 한 행 그대로**다. 이 파서가 문서만
//    보고 짐작한 게 아니라는 근거이자, 응답 모양이 바뀌면 걸리는 회귀 가드다.
const REAL_ROW = {
  PAN_NT_ST_DT: "2026.08.14",
  PAN_ID: "0000061156",
  AIS_TP_CD_NM: "행복주택",
  CNP_CD_NM: "경기도",
  ALL_CNT: "243",
  SPL_INF_TP_CD: "060",
  AIS_TP_CD: "08",
  PAN_DT: "20260814",
  RNUM: "2",
  CCR_CNNT_SYS_DS_CD: "02",
  DTL_URL: "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=0000061156",
  CLSG_DT: "2026.08.25",
  UPP_AIS_TP_CD: "06",
  PAN_NM: "의왕고천A-1BL[리츠]·안양명학A-1BL 행복주택 예비입주자 모집",
  UPP_AIS_TP_NM: "임대주택",
  PAN_SS: "공고중",
};

test("LH 실응답 한 행이 기대대로 정규화된다", () => {
  const r = normalizeLhRow({ row: REAL_ROW, label: "임대" });
  assert.equal(r.houseManageNo, "LH:0000061156");
  assert.equal(r.detailKind, "행복주택");
  assert.equal(r.region, "경기도");
  assert.equal(r.receiptEnd, "2026-08-25"); // "2026.08.25" 점 구분 정규화
  assert.equal(r.state, "공고중");
  // ⚠️ 이 API는 주소·세대수·당첨자발표일·접수시작일을 **주지 않는다**. 없는 걸 채운 척하면
  //    카드가 "접수 08-14~"처럼 공고게시일을 접수일로 찍는다 → 전부 null이어야 한다.
  assert.equal(r.receiptStart, null);
  assert.equal(r.households, null);
  assert.equal(r.winnerDate, null);
  assert.equal(r.address, "");
});
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

// 사업자 공모가 입주자 모집과 한 목록에 섞여 온다 — 마감이 이르면 카드 맨 윗줄을 먹는다.
test("운영기관 공모는 카드에서 걸러낼 이름 규칙에 걸린다", () => {
  const NOT_FOR_TENANTS = /운영기관|운영업체|사업자\s*공모/;
  assert.ok(NOT_FOR_TENANTS.test("2026년 하반기 매입임대 공동생활가정 운영기관 모집공고"));
  // ⚠️ 진짜 입주자 공고를 삼키면 안 된다 — 규칙을 넓힐 때 여기가 걸림돌이 되어야 한다.
  assert.ok(!NOT_FOR_TENANTS.test("파주시 행복주택 예비입주자 모집공고(26.08.07)"));
  assert.ok(!NOT_FOR_TENANTS.test("[청년신혼부부매입임대리츠]_경기북부지역 입주자 모집"));
  assert.ok(!NOT_FOR_TENANTS.test("26년 2차 부산 분양전환형 든든전세 입주자 모집 공고"));
});

// 정정공고와 원공고가 둘 다 살아서 온다 — 6칸 카드에서 중복 두 쌍이면 표시 후보의 40%다.
test("정정공고가 원공고를 대체한다 (먼저 온 것 = 정정본)", () => {
  const rows = [
    // 응답은 게시일 최신순 → 정정본이 먼저 온다.
    { name: "[정정공고]남양주 장현5 2BL 행복주택 모집", receiptEnd: "2026-08-20" },
    { name: "남양주 장현5 2BL 행복주택 모집", receiptEnd: "2026-08-20" },
    { name: "김포시 행복주택 모집", receiptEnd: "2026-08-20" },
  ];
  const out = dropRevisedDuplicates(rows);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, "[정정공고]남양주 장현5 2BL 행복주택 모집");
  assert.equal(out[1].name, "김포시 행복주택 모집");
});

// ⚠️ 마감일이 다르면 다른 공고다 — 이름만 보고 합치면 진짜 공고가 사라진다.
test("같은 이름이라도 마감일이 다르면 남긴다", () => {
  const rows = [
    { name: "파주시 행복주택 모집", receiptEnd: "2026-08-19" },
    { name: "파주시 행복주택 모집", receiptEnd: "2026-09-30" },
  ];
  assert.equal(dropRevisedDuplicates(rows).length, 2);
});

test("수도권 판정", () => {
  assert.equal(isCapitalRegion("서울특별시"), true);
  assert.equal(isCapitalRegion("경기도 수원시"), true);
  assert.equal(isCapitalRegion("인천광역시"), true);
  assert.equal(isCapitalRegion("부산광역시"), false);
  assert.equal(isCapitalRegion(""), false);
});
