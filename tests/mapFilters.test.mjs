import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesComplexName } from "../app/lib/mapFilters.js";

// 단지 리스트의 이름 검색. 사람이 직접 치기도 하지만, 📢 요주의 단지 카드의
// "지도에서 보기"가 넘겨주는 뉴스 단지명을 받아내는 게 주 용도다.

test("빈 검색어는 전부 통과시킨다", () => {
  assert.equal(matchesComplexName("주공1", ""), true);
  assert.equal(matchesComplexName("주공1", "   "), true);
});

test("부분 일치로 찾는다", () => {
  assert.equal(matchesComplexName("래미안대치팰리스", "래미안"), true);
  assert.equal(matchesComplexName("래미안대치팰리스", "힐스테이트"), false);
});

test("공백·괄호·중점은 무시하고 맞춘다", () => {
  // 실거래명에 '한미(A1,A2,B)'처럼 필지 표기가 붙어 오는 일이 잦다.
  assert.equal(matchesComplexName("한미(A1,A2,B)", "한미"), true);
  assert.equal(matchesComplexName("힐스테이트 송파더그리드", "힐스테이트송파더그리드"), true);
});

test("뉴스 이름의 지역 접두어를 떼고도 맞춰본다", () => {
  // ⚠️ 이 기능이 이 함수의 존재 이유다. 뉴스는 지역을 앞에 붙여 쓰고(구로주공)
  //    국토부 실거래명은 지역을 뺀 형태가 많다(주공1·주공2) — 2026-09-02 실측으로
  //    확인된 어긋남이고, 이게 없으면 요주의 카드의 지도 착지가 대부분 "0곳"이 된다.
  assert.equal(matchesComplexName("주공1", "구로주공", "구로구"), true);
  assert.equal(matchesComplexName("주공2", "구로주공", "구로구"), true);
});

test("지역 접두어를 떼도 남는 게 너무 짧으면 맞추지 않는다", () => {
  // '구로구'를 뗀 나머지가 한 글자면 아무 단지에나 걸린다.
  assert.equal(matchesComplexName("주공1", "구로주", "구로구"), false);
});

test("지역이 다르면 접두어를 떼지 않는다", () => {
  // 송파구를 보고 있는데 '구로주공'을 검색하면 걸리면 안 된다.
  assert.equal(matchesComplexName("주공1", "구로주공", "송파구"), false);
});

test("검색어가 실거래명을 품는 경우도 맞춘다", () => {
  // 뉴스 '송파삼성래미안' ↔ 실거래 '삼성래미안'
  assert.equal(matchesComplexName("삼성래미안", "송파삼성래미안"), true);
});

test("두 글자 실거래명이 긴 검색어에 아무렇게나 걸리지 않는다", () => {
  // '삼성'이 '송파삼성래미안' 검색에 걸리면 목록이 오염된다.
  assert.equal(matchesComplexName("삼성", "송파삼성래미안"), false);
});
