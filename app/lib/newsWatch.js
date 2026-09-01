// 📢 요주의 단지 — 최근 뉴스에 반복 등장한 아파트 단지를 제목에서 뽑아 집계한다.
//
// 방침은 classifyNews·newsPriority와 같다: **DB 컬럼 없이 제목에서 계산** → 룰을 고치면
// 과거 기사에도 소급되고, 마이그레이션도 추가 요청도 필요 없다. Briefing이 이미 들고 있는
// /api/news 응답(최근 7일)을 그대로 먹는다.
//
// ⚠️ 이 파일의 규칙·임계값은 취향이 아니라 실측이다(2026-09-02, news_items 2,348건 +
//    구글 RSS 라이브). 근거와 재측정 방법은 PROGRESS.md 2026-09-02 절에 있다.
// ⚠️ supabase 미의존 유지 + `./regions.js` **확장자 import** — raw node 단독 검증 대상이다.

import { ALL_REGIONS } from "./regions.js";

// 요주의 판정. 점수 = 기사 수 + (날짜 수 − 1) × 2.
// ⚠️ 날짜 분산에 가중을 주는 이유: 매체 수로는 보도자료 신디케이션과 지속 보도가 안 갈린다.
//    실측에서 구로주공(23건·22매체·5일, 재건축 심의 통과)과 힐스테이트 송파더그리드
//    (10건·11매체·3일, 분양 보도자료)는 매체 수가 비슷했고 **날짜 분산만 둘을 갈랐다**.
export const WATCH_MIN_SCORE = 4;
export const WATCH_MAX_ROWS = 6; // 카드 한 장에 들어가는 줄 수

// ⚠️ 한 매체만 다룬 건은 제외한다. 실측 오탐: '신세계타운' 3건이 전부 **한 신문의 입찰공고
//    연재**였다(조합 추진위 공고를 날마다 실은 것) — 주목이 아니라 게시라서, 날짜만 벌어지고
//    아무도 안 본 글이 요주의 1위로 올라온다. 진짜 사건은 반드시 복수 매체가 다룬다:
//    구로주공 22곳 · 마포한강삼성 13곳 · 힐스테이트 송파더그리드 11곳 · 비취타운 2곳.
export const WATCH_MIN_OUTLETS = 2;

// ── 이름 사전 ───────────────────────────────────────────────────────────────
// 단지명은 "지역/고유어 + 브랜드나 유형"의 합성어다. 이 토큰 중 하나를 품지 않으면
// 후보로 보지 않는다 — 한국어 형태소 분석 없이 쓸 수 있는 가장 강한 단서다.
const BRAND = [
  "자이", "래미안", "푸르지오", "힐스테이트", "아이파크", "편한세상", "더샵", "롯데캐슬",
  "캐슬", "데시앙", "위브", "센트레빌", "호반", "써밋", "트리마제", "아크로", "디에이치",
  "베일리", "오티에르", "스위첸", "비발디", "하늘채", "리슈빌", "지웰", "유보라", "해모로",
  "예미지", "우미린", "파라곤", "포레나", "아너스빌", "스타힐스", "어울림", "노블레스",
  "헬리오시티", "리센츠", "트리지움", "엘스", "파크리오", "미소지움", "클라시스", "루체하임",
  "주공", "우성", "한신", "현대", "삼성", "대우", "대림", "쌍용", "두산", "코오롱",
  "한화", "금호", "삼환", "극동", "신동아", "청구", "벽산", "한라", "동부", "럭키",
];
const TYPE = [
  "아파트", "단지", "마을", "타운", "시티", "파크", "팰리스", "빌리지", "스테이트",
  "더힐", "힐스", "그리드", "센트럴", "프레스티지", "리버뷰", "스카이", "코아", "하임",
];
const TOKENS = [...new Set([...BRAND, ...TYPE])];
const HAS_TOKEN = new RegExp(`(${TOKENS.join("|")})`);
const ENDS_TOKEN = new RegExp(`(${TOKENS.join("|")})$`);

// 이름 전체가 이것이면 단지가 특정되지 않는 일반명·정책용어다.
const GENERIC = new Set([...TOKENS, "뉴타운", "신도시", "재건축", "재개발", "모아타운", "재정비"]);
// 브랜드 토큰을 품지만 단지가 아닌 것 — 건설사·기업·행정구역.
// ⚠️ '현대건설'·'삼성전자'는 규칙이 없으면 '현대'·'삼성' 때문에 그대로 통과한다.
const NOT_COMPLEX =
  /(건설|물산|산업개발|이앤씨|엔지니어링|E&C|그룹|공사|공단|조합|협회|증권|은행|자산운용|전자|자동차|카드|생명|화재|중공업|백화점|병원|지구|뉴타운|신도시|일대|권역|역세권|거점|연구소|센터|타워|사옥|본사)$/;
// 동·가·읍·면·리로 끝나면 지역명이지 단지명이 아니다(삼성동·이문동).
const DONG = /[가-힣]{2,4}(동|가|읍|면|리)$/;
const JOSA = /(으로|에서|까지|부터|보다|이라|라고|에는|에도|은|는|이|가|을|를|의|도|만|과|와|로|에)$/;

// 후보 문자열 뽑기 — 인용부호 안 + 구분자 분해, 둘 다 필요하다.
function candidates(title) {
  const out = new Set();
  const add = (s) => { const t = (s || "").trim(); if (t) out.add(t); };
  // 브래킷 안은 지면 라벨('[서울아파트거래]'·'[일일 하락가]')이라 본문에서 들어낸다.
  const body = title.replace(/[[(【<][^\])】>]{0,20}[\])】>]/g, " ");
  // ① 인용부호 안 — 공백이 든 이름을 통째로 살리는 유일한 경로('힐스테이트 송파더그리드').
  for (const m of body.matchAll(/['‘"“]([^'’"”]{2,25})['’"”]/g)) add(m[1]);
  // ② 구분자 분해 — ⚠️ 이게 없으면 나열형을 통째로 놓친다.
  //    '개포우성·구로주공·번동주공1 등…'처럼 따옴표 없이 중점으로 늘어놓는 제목이 흔하고,
  //    설계 중 ①만 썼다가 구로주공을 30건이 아닌 8건으로 세어 "신호가 없다"고 오진했다.
  for (const p of body.split(/[\s·,、/…|~\-–—:;!?"'‘’“”]+/)) add(p);
  return [...out];
}

function normalize(name) {
  let s = name.replace(/[^가-힣A-Za-z0-9 ]/g, "").trim();
  // ⚠️ 조사는 이름이 브랜드·유형 토큰으로 끝나지 **않을 때만** 뗀다. 무조건 떼면
  //    '이문아이파크자이'의 끝 '이'를 조사로 보고 '이문아이파크자'로 망가뜨린다.
  if (!ENDS_TOKEN.test(s)) s = s.replace(JOSA, "");
  s = s.replace(/(아파트|단지)$/, ""); // 구로주공 ≡ 구로주공아파트(두 표기가 섞여 온다)
  return s.trim();
}

function accept(raw) {
  const name = normalize(raw);
  if (!name) return null;
  const bare = name.replace(/ /g, "");
  // ⚠️ 공백 ≤ 1이 오탐의 주 차단막이다. 실측 인용문 오탐("9억대 송파 아파트",
  //    "아파트 막히니 빌라로", "송파구 아파트 매물 찾아줘" …)이 전부 여기서 죽는다.
  if ((name.match(/ /g) || []).length > 1) return null;
  if (bare.length < 3 || bare.length > 15) return null;
  if (!HAS_TOKEN.test(name)) return null;
  if (GENERIC.has(bare)) return null;
  if (NOT_COMPLEX.test(bare)) return null;
  if (DONG.test(bare)) return null;
  // ⚠️ '아파트'·'단지'는 이름 **끝**에서만 유효하다. 이 줄이 없으면 '아파트값'이 243건으로
  //    1위를 먹는다(실측). '아파트서'·'아파트분양'·'현대아파트지구'도 같이 죽는다.
  if (/(아파트|단지)(?!$)/.test(raw.replace(/[^가-힣A-Za-z0-9]/g, ""))) return null;
  if (/^\d+$/.test(bare)) return null;
  return name;
}

// 제목 하나에서 단지명 후보를 뽑는다. 중복 없이 반환.
export function extractComplexNames(title) {
  if (!title || typeof title !== "string") return [];
  const names = new Set();
  for (const c of candidates(title)) {
    const n = accept(c);
    if (n) names.add(n);
  }
  return [...names];
}

// ── 지역 추정 ───────────────────────────────────────────────────────────────
// 시군구 이름에서 접미(시·구·군)를 뗀 검색 키. 1글자('중구'→'중')는 아무 데나 걸려서 뺀다.
const REGION_KEYS = ALL_REGIONS.map((r) => {
  const parts = r.name.split(" ");
  const gu = parts.find((p) => p.endsWith("구")) || parts[parts.length - 1];
  return { code: r.code, name: r.name, key: gu.replace(/[시구군]$/, "") };
}).filter((r) => r.key.length >= 2);

const findRegion = (hay) =>
  REGION_KEYS.filter((r) => hay.includes(r.key)).sort((a, b) => b.key.length - a.key.length)[0] ||
  null;

// ① 이름 자체에 든 지역이 최우선 ② 없으면 제목에서 **이름 앞부분만** — 단, 제목에 단지가
//    둘 이상 나열됐으면 미상.
//
// ⚠️ ②의 "이름 앞부분만"이 핵심이다. 한국어 제목은 "지역 + 단지명" 순서로 쓰는데, 이름 뒤에
//    나오는 지역은 대개 **비교 대상**이지 위치가 아니다. 실측 오진:
//      "한남더힐 1년새 95억↑…서울 **강남** 최고가 평균" → 한남더힐은 용산인데 강남으로 붙었다.
//    반대 사례(정상): "**강남 대치** 비취타운 가로주택 시공권 확보" — 지역이 이름 앞에 있다.
// ⚠️ 나열 단서도 유지 — 빼면 '개포우성·구로주공·번동주공1 등…'에서 제목의 '구로'를 집어
//    개포우성(강남)·번동주공1(강북)이 통째로 구로구로 잘못 붙는다.
//    어느 쪽이든 틀린 지역으로 보내느니 미상으로 두고 이동 버튼을 감추는 게 낫다.
export function guessWatchRegion(title, name, namesInTitle = 1) {
  const byName = findRegion(name || "");
  if (byName) return byName;
  if (namesInTitle > 1) return null;
  const t = String(title || "");
  const at = t.indexOf(name || "");
  return findRegion(at > 0 ? t.slice(0, at) : "");
}

// ── 집계 ────────────────────────────────────────────────────────────────────
const dayOf = (it) => String(it.published_at || it.fetched_at || "").slice(0, 10);

export function buildNewsWatch(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const groups = new Map();
  for (const it of items) {
    const names = extractComplexNames(it.title);
    for (const name of names) {
      let g = groups.get(name);
      if (!g) {
        g = { name, titles: new Set(), outlets: new Set(), days: new Set(), items: [], region: null };
        groups.set(name, g);
      }
      // ⚠️ 기사 수는 **제목 기준 유일값**이다. 같은 보도자료를 여러 매체가 글자 그대로
      //    실어 나른 행이 실제로 있어, 링크로 세면 한 건이 매체 수만큼 부풀어 점수를 지배한다.
      g.titles.add(it.title);
      g.outlets.add(it.source || "?");
      const d = dayOf(it);
      if (d) g.days.add(d);
      g.items.push(it);
      // 지역이 아직 미정이면 이 기사로 다시 시도한다(나열 기사만 있으면 끝내 미상).
      if (!g.region) g.region = guessWatchRegion(it.title, name, names.length);
    }
  }

  // 병합: 짧은 이름이 긴 이름의 부분문자열이면 최장 이름으로 흡수한다.
  // '더그리드' ⊂ '송파더그리드' ⊂ '힐스테이트 송파더그리드' — 셋이 한 단지이고,
  // 안 합치면 셋으로 쪼개져 전부 임계값에 못 미친다.
  const byLength = [...groups.values()].sort(
    (a, b) => b.name.replace(/ /g, "").length - a.name.replace(/ /g, "").length
  );
  const merged = [];
  for (const g of byLength) {
    const key = g.name.replace(/ /g, "");
    const host = merged.find((m) => m.name.replace(/ /g, "").includes(key));
    if (!host) { merged.push(g); continue; }
    for (const t of g.titles) host.titles.add(t);
    for (const o of g.outlets) host.outlets.add(o);
    for (const d of g.days) host.days.add(d);
    host.items.push(...g.items);
    if (!host.region) host.region = g.region; // 흡수된 쪽이 지역을 알고 있을 수 있다
  }

  return merged
    .map((g) => {
      const articles = g.titles.size;
      const days = g.days.size;
      // 대표 기사 = 가장 최근 것. 지도로 가기 전에 "왜 요주의인지"를 볼 근거다.
      const top = [...g.items].sort((a, b) => (dayOf(a) < dayOf(b) ? 1 : -1))[0];
      return {
        name: g.name,
        lawdCd: g.region?.code ?? null,
        regionName: g.region?.name ?? null,
        articles,
        days,
        outlets: g.outlets.size,
        score: articles + (days - 1) * 2,
        top: { title: top?.title ?? "", link: top?.link ?? "" },
      };
    })
    .filter((r) => r.score >= WATCH_MIN_SCORE && r.outlets >= WATCH_MIN_OUTLETS)
    .sort((a, b) => b.score - a.score || b.days - a.days || a.name.localeCompare(b.name))
    .slice(0, WATCH_MAX_ROWS);
}
