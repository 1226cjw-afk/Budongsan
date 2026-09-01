import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractComplexNames,
  guessWatchRegion,
  buildNewsWatch,
  WATCH_MIN_SCORE,
  WATCH_MAX_ROWS,
} from "../app/lib/newsWatch.js";

// 📢 요주의 단지 = 최근 7일 뉴스에 반복 등장한 단지. 제목에서만 계산하므로 DB 컬럼이 없고,
// 룰을 고치면 과거 기사에도 소급된다(classifyNews·newsPriority와 같은 방침).
//
// ⚠️ 아래 제목은 대부분 실제 수집분이다(2026-09-02 news_items 2,348건 실측). 지어낸 문장으로
//    바꾸지 말 것 — 이 규칙이 막고 있는 오탐은 전부 실물에서 나왔다.

// ── 추출: 잡아야 하는 것 ────────────────────────────────────────────────────
test("이름 앞에 지역이 붙은 단지명을 잡는다", () => {
  assert.ok(extractComplexNames("구로주공 재건축 본격화 - 최고 49층·3,289세대 대단지 조성").includes("구로주공"));
});

test("'아파트' 접미가 붙은 표기도 같은 이름으로 정규화한다", () => {
  // 실측: 같은 사건을 다룬 기사들이 '구로주공'과 '구로주공아파트'를 섞어 쓴다.
  // 정규화가 없으면 한 단지가 두 그룹으로 쪼개져 둘 다 임계값에 못 미친다.
  assert.ok(
    extractComplexNames("서울 구로주공아파트, 재건축 통해 3,289세대 대단지로 탈바꿈").includes("구로주공")
  );
});

test("중점으로 나열된 단지를 전부 잡는다", () => {
  // ⚠️ 이 형태를 놓치면 피해가 크다. 설계 중 인용부호 기반으로만 추출했다가
  //    구로주공을 30건이 아닌 8건으로 과소 집계해 "신호가 없다"고 오진했다.
  const got = extractComplexNames("개포우성·구로주공·번동주공1 등…서울 5곳에 9237가구 공급");
  assert.ok(got.includes("개포우성"));
  assert.ok(got.includes("구로주공"));
  assert.ok(got.includes("번동주공1"));
});

test("인용부호 안의 공백 든 이름을 통째로 잡는다", () => {
  assert.ok(
    extractComplexNames("현대건설, 9월 송파 장지동 '힐스테이트 송파더그리드' 분양").includes(
      "힐스테이트 송파더그리드"
    )
  );
});

test("브래킷 섹션 라벨은 무시하고 본문의 단지명을 잡는다", () => {
  // '[서울아파트거래]'는 지면 라벨이지 단지가 아니다.
  const got = extractComplexNames("[서울아파트거래] 한남더힐 전용면적 208.47㎡ 110억으로 신고가");
  assert.ok(got.includes("한남더힐"));
  assert.ok(!got.includes("서울아파트거래"));
});

test("조사가 붙어도 이름만 남긴다", () => {
  assert.ok(extractComplexNames("삼환가락아파트, 최고 35층으로 재건축").includes("삼환가락"));
});

test("브랜드 토큰으로 끝나는 이름의 끝글자를 조사로 오해하지 않는다", () => {
  // ⚠️ 회귀 가드. 조사를 무조건 떼면 '이문아이파크자이'의 끝 '이'를 조사로 보고
  //    '이문아이파크자'로 망가진다(프로토타입에서 실제로 발생).
  assert.ok(extractComplexNames("이문아이파크자이 입주 시작").includes("이문아이파크자이"));
});

// ── 추출: 걸러야 하는 것 ────────────────────────────────────────────────────
test("인용문은 단지명이 아니다", () => {
  // ⚠️ '공백 ≤ 1'이 이 오탐들의 주 차단막이다. 전부 실제 수집분.
  for (const t of [
    '"9억대 송파 아파트" 매물 급증',
    "아파트 막히니 빌라로 몰린다",
    '"송파구 아파트 매물 찾아줘" AI 중개',
    "용산공원 아파트 반대 목소리",
    "서울 새 아파트 귀하다",
  ]) {
    assert.deepEqual(extractComplexNames(t), [], t);
  }
});

test("'아파트'가 이름 끝이 아니면 단지명이 아니다", () => {
  // ⚠️ 이 규칙이 없으면 '아파트값'이 243건으로 1위를 먹는다(2026-09-02 실측).
  for (const t of ["서울 아파트값 3주 연속 상승", "아파트값 강남 주도로 반등", "현대아파트지구 정비계획"]) {
    assert.deepEqual(extractComplexNames(t), [], t);
  }
});

test("건설사·기업은 단지명이 아니다", () => {
  // 브랜드 토큰('현대'·'삼성')을 품고 있어 규칙이 없으면 그대로 통과한다.
  assert.deepEqual(extractComplexNames("현대건설, 상반기 실적 발표"), []);
  assert.deepEqual(extractComplexNames("삼성전자 평택 공장 증설"), []);
});

test("정책 용어와 일반명은 단지명이 아니다", () => {
  assert.deepEqual(extractComplexNames("서울시, 모아타운 신규 지정"), []);
  assert.deepEqual(extractComplexNames("재건축 단지 규제 완화"), []);
});

test("브랜드명만 있으면 단지가 특정되지 않으므로 버린다", () => {
  assert.deepEqual(extractComplexNames("래미안 브랜드 리뉴얼"), []);
});

// ── 지역 추정 ───────────────────────────────────────────────────────────────
test("이름 자체에 든 지역 토큰을 최우선으로 쓴다", () => {
  const r = guessWatchRegion("개포우성·구로주공 등 서울 5곳 공급", "구로주공", 2);
  assert.equal(r.code, "11530"); // 구로구 — 나열 기사여도 이름이 스스로 말한다
});

test("이름에 지역이 없으면 제목에서 찾는다", () => {
  const r = guessWatchRegion("동대문구 청계한신휴플러스 전용 84㎡ 신고가", "청계한신휴플러스", 1);
  assert.equal(r.code, "11230"); // 동대문구
});

test("이름보다 뒤에 나오는 지역은 위치가 아니라 비교 대상이다", () => {
  // ⚠️ 실측 오진. "한남더힐 1년새 95억↑…서울 강남 최고가 평균"에서 '강남'은 비교 대상이지
  //    한남더힐(용산 한남동)의 위치가 아니다. 한국어 제목은 "지역 + 단지명" 순서라,
  //    이름 뒤의 지역을 집으면 엉뚱한 구로 보내게 된다.
  assert.equal(guessWatchRegion("한남더힐 1년새 95억↑…서울 강남 최고가 평균", "한남더힐", 1), null);
  assert.equal(guessWatchRegion("[서울아파트거래] 한남더힐 208.47㎡ 110억 신고가", "한남더힐", 1), null);
});

test("이름보다 앞에 나오는 지역은 위치로 본다", () => {
  // 같은 실측 묶음의 반대 사례: "강남 대치 비취타운 가로주택 시공권 확보"는 정확하다.
  assert.equal(guessWatchRegion("강남 대치 비취타운 가로주택 시공권 확보", "비취타운", 1).code, "11680");
});

test("제목에 단지가 둘 이상 나열되면 지역을 추정하지 않는다", () => {
  // ⚠️ 회귀 가드. 이 단서가 없으면 '개포우성·구로주공·번동주공1' 기사에서 제목의 '구로'를
  //    집어 개포우성(강남)·번동주공1(강북)이 통째로 구로구로 잘못 붙는다(실측 확인).
  //    틀린 지역으로 보내느니 "미상"으로 두고 지도 이동을 안 시키는 게 낫다.
  assert.equal(guessWatchRegion("개포우성·구로주공·번동주공1 등…서울 5곳에 9237가구 공급", "개포우성", 3), null);
});

// ── 집계·판정 ───────────────────────────────────────────────────────────────
const item = (title, day, source = "매체") => ({
  title,
  source,
  link: `https://x/${title}/${source}`,
  published_at: `${day}T09:00:00+09:00`,
});

test("1건짜리 기사는 어떤 경우에도 요주의가 되지 않는다", () => {
  // 점수 = 1 + 0 = 1점. 실측에서 꼬리 34개가 전부 여기 해당한다.
  const rows = buildNewsWatch([item("구로주공 재건축 본격화", "2026-09-01")]);
  assert.deepEqual(rows, []);
});

test("이틀에 걸친 2건은 요주의다", () => {
  // 점수 = 2 + (2−1)×2 = 4 → 임계 통과. 지속 보도의 최소 형태.
  const rows = buildNewsWatch([
    item("오금현대 재건축 속도", "2026-09-01", "A"),
    item("오금현대 조합 총회 개최", "2026-09-02", "B"),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "오금현대");
  assert.equal(rows[0].articles, 2);
  assert.equal(rows[0].days, 2);
  assert.equal(rows[0].score, 4);
});

test("하루에 3건이면 아직 요주의가 아니다", () => {
  // 점수 = 3 + 0 = 3점. 보도자료 한 건이 같은 날 퍼진 전형적 모양이라 한 칸 더 요구한다.
  const rows = buildNewsWatch([
    item("가락한신 재건축 A", "2026-09-01", "A"),
    item("가락한신 재건축 B", "2026-09-01", "B"),
    item("가락한신 재건축 C", "2026-09-01", "C"),
  ]);
  assert.deepEqual(rows, []);
});

test("하루에 4건이면 요주의다", () => {
  // 점수 = 4 + 0 = 4점. 개포우성(4건·하루)처럼 진짜 버스트를 살리기 위한 경계.
  const rows = buildNewsWatch([
    item("개포우성 재건축 A", "2026-09-01", "A"),
    item("개포우성 재건축 B", "2026-09-01", "B"),
    item("개포우성 재건축 C", "2026-09-01", "C"),
    item("개포우성 재건축 D", "2026-09-01", "D"),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].score, 4);
});

test("기사 수는 링크가 아니라 제목 기준 유일값이다", () => {
  // ⚠️ 같은 보도자료를 여러 매체가 글자 그대로 실어 나른 행이 실제로 있다. 링크로 세면
  //    한 건이 매체 수만큼 부풀어 점수를 지배한다(실측: 매체 수 > 기사 수인 그룹이 나온다).
  const rows = buildNewsWatch([
    item("오금현대 재건축 속도", "2026-09-01", "A"),
    item("오금현대 재건축 속도", "2026-09-01", "B"), // 제목이 완전히 같다
    item("오금현대 재건축 속도", "2026-09-01", "C"),
    item("오금현대 조합 총회", "2026-09-02", "D"),
  ]);
  assert.equal(rows[0].articles, 2); // 3건이 아니라 2건
  assert.equal(rows[0].outlets, 4); // 매체는 4곳
});

test("한 매체만 다룬 것은 요주의가 아니다", () => {
  // ⚠️ 실측 오탐. '신세계타운' 3건이 전부 **한 매체의 입찰공고 연재**였다(조합 추진위 공고를
  //    같은 신문이 날마다 실은 것) — 주목이 아니라 게시다. 진짜 주목받는 사건은 반드시
  //    여러 매체가 다룬다: 구로주공 22곳 · 마포한강삼성 13곳 · 힐스테이트 송파더그리드 11곳.
  const rows = buildNewsWatch([
    item("신세계타운 재건축조합 입찰공고", "2026-09-01", "같은신문"),
    item("신세계타운 감정평가법인 선정 공고", "2026-09-02", "같은신문"),
    item("신세계타운 도시계획 입찰공고", "2026-09-03", "같은신문"),
  ]);
  assert.deepEqual(rows, []);
});

test("짧은 이름은 그것을 품은 긴 이름으로 흡수된다", () => {
  // '더그리드' ⊂ '송파더그리드' ⊂ '힐스테이트 송파더그리드' — 셋이 한 단지다.
  const rows = buildNewsWatch([
    item("'힐스테이트 송파더그리드' 9월 분양", "2026-09-01", "A"),
    item("송파더그리드 견본주택 개관", "2026-09-02", "B"),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "힐스테이트 송파더그리드"); // 최장 이름이 대표
  assert.equal(rows[0].articles, 2);
});

test("점수순으로 정렬하고 상한을 넘지 않는다", () => {
  const items = [];
  for (let i = 0; i < WATCH_MAX_ROWS + 3; i++) {
    const nm = `구로주공${i}`;
    // i가 클수록 기사 수를 늘려 점수가 높아지게 한다
    for (let k = 0; k <= i; k++) items.push(item(`${nm} 재건축 ${k}`, "2026-09-01", `s${k}`));
    items.push(item(`${nm} 조합 총회`, "2026-09-02", "last"));
  }
  const rows = buildNewsWatch(items);
  assert.equal(rows.length, WATCH_MAX_ROWS);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].score >= rows[i].score, "점수 내림차순이어야 한다");
  }
});

test("대표 기사와 지역을 함께 돌려준다", () => {
  const rows = buildNewsWatch([
    item("구로주공 재건축 본격화", "2026-09-01", "A"),
    item("구로주공 조합 총회 개최", "2026-09-02", "B"),
  ]);
  assert.equal(rows[0].lawdCd, "11530");
  assert.equal(rows[0].regionName, "구로구");
  assert.ok(rows[0].top.link, "대표 기사 링크가 있어야 지도 이동 전에 근거를 볼 수 있다");
});

test("지역을 못 정하면 lawdCd가 null이다", () => {
  // 지도 이동 버튼을 감추는 근거가 된다.
  const rows = buildNewsWatch([
    item("한남더힐 전용 208㎡ 신고가", "2026-09-01", "A"),
    item("한남더힐 또 신고가", "2026-09-02", "B"),
  ]);
  assert.equal(rows[0].lawdCd, null);
});

test("임계값과 상한은 상수로 노출된다", () => {
  // 화면이 "N건 이상" 같은 문구를 하드코딩하지 않게 한다.
  assert.equal(WATCH_MIN_SCORE, 4);
  assert.equal(WATCH_MAX_ROWS, 6);
});

test("빈 입력·잘못된 입력에도 죽지 않는다", () => {
  assert.deepEqual(buildNewsWatch([]), []);
  assert.deepEqual(buildNewsWatch(null), []);
  assert.deepEqual(extractComplexNames(""), []);
  assert.deepEqual(extractComplexNames(undefined), []);
});
