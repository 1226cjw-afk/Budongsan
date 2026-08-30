import { test } from "node:test";
import assert from "node:assert/strict";
import { newsScore, newsPriority } from "../app/lib/news.js";

// 뉴스 중요도 = 카테고리 가중 + 제목 신호어 + 관심지역 + 자금 프로필.
// ⚠️ 카테고리와 마찬가지로 DB 컬럼 없이 제목에서 계산한다 — 룰을 고치면 과거 기사에도 소급된다.

// ── 카테고리 가중 ───────────────────────────────────────────────────────────
// 신호어가 없는 제목만 골라 가중치만 떼어본다(신호어가 섞이면 무엇이 점수를 냈는지 갈린다).
test("카테고리 가중: 대출·금리와 정책·세금이 가장 무겁다", () => {
  assert.equal(newsScore({ title: "주담대 어떻게 볼까" }), 2); // 대출·금리
  assert.equal(newsScore({ title: "종부세 어떻게 볼까" }), 2); // 정책·세금
});

test("카테고리 가중: 매매·분양·재건축은 1, 전월세·기타는 0", () => {
  assert.equal(newsScore({ title: "강남 아파트 호가 이야기" }), 1); // 매매·시세
  assert.equal(newsScore({ title: "청약 이야기" }), 1); // 분양·청약
  assert.equal(newsScore({ title: "재건축 조합 총회 연기" }), 1); // 재건축·재개발
  assert.equal(newsScore({ title: "전세 계약 이야기" }), 0); // 전월세
  assert.equal(newsScore({ title: "오늘의 날씨" }), 0); // 기타
});

// ── 제목 신호어 ─────────────────────────────────────────────────────────────
// "지금 벌어진 일"(시행·발표·확정)인지, 아니면 해설·시황인지를 가른다.
test("강한 신호어가 있으면 +2", () => {
  assert.equal(newsScore({ title: "주담대 어떻게 볼까" }), 2);
  assert.equal(newsScore({ title: "주담대 한도 축소 시행" }), 4); // 2 + 2
});

test("긴급어가 있으면 +1", () => {
  assert.equal(newsScore({ title: "[속보] 주담대 어떻게 볼까" }), 3); // 2 + 1
});

// ── 관심지역 ────────────────────────────────────────────────────────────────
// ⚠️ 즐겨찾기를 따로 조회하지 않는다 — 수집 키워드가 "분당구 아파트" 꼴이면
//    그 기사는 내 ★ 지역 때문에 수집된 것이다(이미 DB에 있는 신호).
test("관심지역 키워드로 수집된 기사는 +2", () => {
  const title = "분당 시범단지 신고가 경신";
  assert.equal(newsScore({ title }), 1); // 매매·시세만
  assert.equal(newsScore({ title, keyword: "분당구 아파트" }), 3); // + 관심지역
});

test("기본 키워드는 관심지역이 아니다", () => {
  const title = "분당 시범단지 신고가 경신";
  assert.equal(newsScore({ title, keyword: "수도권 아파트 매매" }), 1);
});

// ── 자금 프로필 ─────────────────────────────────────────────────────────────
test("소득을 입력해 둔 상태면 대출·금리 기사에만 +1", () => {
  const ctx = { hasIncome: true };
  assert.equal(newsScore({ title: "주담대 어떻게 볼까" }, ctx), 3); // 2 + 1
  assert.equal(newsScore({ title: "종부세 어떻게 볼까" }, ctx), 2); // 정책·세금엔 안 붙음
});

// ── 정치·논평 감점 ──────────────────────────────────────────────────────────
// ⚠️ classifyNews는 "부동산 정책" 두 글자만 있으면 전부 정책·세금(2점)으로 빨아들인다.
//    그래서 지지율·공방·칼럼 같은 **행동할 수 없는 기사**가 자동으로 주목이 됐다
//    (2026-08-31 실측: 감점 없이는 주목이 52.1% — 절반이 주목이면 색 구분이 죽는다).
//    "확정된 변화"만 남기려고 −2를 준다. 감점 후 필독 9.6% / 주목 18.8% / 일반 71.7%.
test("정치 공방·지지율 기사는 감점된다", () => {
  assert.equal(newsScore({ title: "부동산 대책 발표" }), 4); // 정책·세금 2 + 신호어 2
  assert.equal(newsScore({ title: "부동산 대책 발표 놓고 여당 공방" }), 2); // −2
  assert.equal(newsScore({ title: "지지율 42% 최저…부동산 정책이 결정타" }), 0);
  // 실제 헤드라인 — 감점이 없으면 신호어("확대")까지 붙어 필독(4)으로 올라간다.
  assert.equal(newsScore({ title: "부동산 정책자료 공유 확대법 발의" }), 2); // 2 + 2 − 2
  assert.equal(newsPriority({ title: "부동산 정책자료 공유 확대법 발의" }), "일반");
});

test("논평 태그와 물음표 종결은 감점된다", () => {
  assert.equal(newsScore({ title: "[칼럼] 부동산 대책 이후를 봐야 한다" }), 2);
  assert.equal(newsScore({ title: "(토마토칼럼) 부동산 대책 이후를 봐야 한다" }), 2);
  // 질문형 제목은 사실 전달이 아니라 논평이다.
  assert.equal(newsScore({ title: "부동산 규제 강화, 우리는 어떻게 체감할까?" }), 2);
  // ⚠️ 물음표가 제목 **끝**일 때만 — 인용문 안의 물음표는 평범한 기사다.
  //    (실측 반례. "입주민" 때문에 분양·청약 1점이 그대로 남아야 한다 = 감점 안 됨)
  assert.equal(newsScore({ title: "\"우리 아파트 스타벅스, 짭이라고요?\" 입주민 황당" }), 1);
});

// ── 임계값 ──────────────────────────────────────────────────────────────────
// 4점↑ 필독 / 3점 주목 / 그 아래 일반.
// ⚠️ 주목을 3점부터로 올린 이유: 2점이면 **카테고리만으로** 주목이 돼(대출·금리 기사는 전부)
//    주목이 52%까지 부푼다. 3점 = "카테고리 + 신호어나 관심지역이 하나는 더 있어야 한다".
test("임계값: 4점부터 필독, 3점부터 주목", () => {
  assert.equal(newsPriority({ title: "주담대 한도 축소 시행" }), "필독"); // 4
  assert.equal(newsPriority({ title: "[속보] 주담대 어떻게 볼까" }), "주목"); // 3
  assert.equal(newsPriority({ title: "주담대 어떻게 볼까" }), "일반"); // 2 — 카테고리만으론 부족
  assert.equal(newsPriority({ title: "재건축 조합 총회 연기" }), "일반"); // 1
  assert.equal(newsPriority({ title: "오늘의 날씨" }), "일반"); // 0
});

// 설계 시 손으로 검산한 네 줄 — 룰을 손보다 이게 깨지면 의도가 바뀐 것이다.
test("검산: 단순 시황이 필독으로 새지 않는다", () => {
  assert.equal(newsPriority({ title: "DSR 3단계 시행…주담대 한도 축소" }), "필독");
  assert.equal(
    newsPriority({ title: "분당 시범단지 신고가 경신", keyword: "분당구 아파트" }),
    "주목"
  );
  assert.equal(newsPriority({ title: "강남 재건축 조합 총회 연기" }), "일반");
  assert.equal(newsPriority({ title: "오늘의 금리 시황" }), "일반"); // 시황은 알림거리가 아님
});

test("제목이 비어도 죽지 않는다", () => {
  assert.equal(newsPriority({}), "일반");
  assert.equal(newsPriority({ title: "" }), "일반");
});
