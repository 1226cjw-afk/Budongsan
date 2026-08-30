// 데일리 부동산 뉴스 수집 — /api/cron/news 공용 lib.
//
// 소스 2단: 네이버 뉴스 검색 API(NAVER_CLIENT_ID/SECRET 있으면, 일 25,000회 무료)
//           → 없으면 구글 뉴스 RSS(키 불필요) 폴백. 어느 쪽이든 즉시 동작.
// ⚠️ supabaseServer 미의존 유지 — scripts/*.mjs 단독 import 검증 가능(trades.js와 달리).
//    DB 저장은 라우트(/api/cron/news)에서 수행.

import { ALL_REGIONS, regionToken } from "./regions.js"; // 확장자 필수 — raw node 단독 import 유지

const NAVER_ENDPOINT = "https://openapi.naver.com/v1/search/news.json";
const GOOGLE_RSS = "https://news.google.com/rss/search";

export const PER_KEYWORD = 30; // 키워드당 수집 기사 수

// 항상 수집하는 기본 키워드 — 수도권·매매 위주(2026-07-12 개편).
// 즐겨찾기 지역 키워드가 여기에 더해진다.
export const BASE_KEYWORDS = [
  "서울 아파트 매매",
  "수도권 아파트 매매",
  "서울 아파트 실거래가",
  "수도권 아파트 시세",
  "부동산 정책",
  "부동산 대출 규제",
  "수도권 아파트 분양",
  "수도권 재건축 재개발",
];

// ── 수도권(서울·경기·인천) 필터 ─────────────────────────────────────────────
// 규칙: 제목·요약에 수도권 지역이 언급되면 통과 → 비수도권 지역만 언급되면 제외
//       → 지역 언급이 아예 없으면(전국 정책·금리 뉴스 등) 통과.
// 휴리스틱이라 완벽하진 않음 — 잘못 통과(기사 하나 더 보임)가 잘못 제외보다 낫다는 방침.

// 등록 지역명에서 만들면 안 되는 축약형 — 일반 단어("동안"·"수정")거나
// 비수도권 지명과 충돌("광주"=광주광역시가 다수).
const SHORT_STOPLIST = new Set(["광주", "동안", "수정", "단원", "만세", "동작", "중원", "상록"]);

// regions.js 미등록 통용 지명 — 제목엔 구 이름 대신 동네명이 흔함. GTX는 수도권 전용 호재.
const EXTRA_CAPITAL_TOKENS = [
  "수도권", "서울", "경기", "인천",
  "여의도", "잠실", "반포", "압구정", "목동", "마곡", "위례",
  "판교", "광교", "평촌", "산본", "일산",
  "송도", "청라", "검단", "부평", "GTX",
];

const CAPITAL_TOKENS = (() => {
  const toks = new Set(EXTRA_CAPITAL_TOKENS);
  for (const r of ALL_REGIONS) {
    for (const part of r.name.split(" ")) {
      toks.add(part); // "수원시" · "장안구" 풀네임
      const short = part.replace(/[시구군]$/, ""); // "강남구"→"강남", "하남시"→"하남"
      if (short.length >= 2 && !SHORT_STOPLIST.has(short)) toks.add(short);
    }
  }
  return [...toks];
})();

// 비수도권 지명 — 이것"만" 언급된 기사를 거른다. "광주"는 경기 광주가
// "광주시"/"경기 광주"로 화이트리스트에 먼저 걸리므로 여기선 광역시로 간주.
const NON_CAPITAL_TOKENS = [
  "부산", "대구", "대전", "울산", "세종", "광주",
  "강원", "춘천", "원주", "강릉", "속초",
  "충청", "충북", "충남", "청주", "천안", "아산", "충주", "당진",
  "전라", "전북", "전남", "전주", "군산", "익산", "여수", "순천", "목포", "광양",
  "경상", "경북", "경남", "포항", "구미", "경주", "안동", "창원", "김해", "양산", "진주", "거제", "통영",
  "제주", "서귀포", "지방",
];

export function isCapitalAreaNews(title, description = "") {
  const text = `${title} ${description}`;
  if (CAPITAL_TOKENS.some((t) => text.includes(t))) return true;
  return !NON_CAPITAL_TOKENS.some((t) => text.includes(t));
}

// ── 카테고리 분류(제목 기반 룰) ─────────────────────────────────────────────
// DB 컬럼 없이 클라·서버 어디서든 제목만으로 재계산 — 과거 수집분에도 소급 적용됨.
// 순서 중요: 구체적 주제(재건축·분양·전월세·대출·정책)를 먼저 보고,
// "상승/하락" 같은 범용 시세 표현은 마지막에 매매·시세로 흡수.
export const NEWS_CATEGORIES = [
  "매매·시세", "정책·세금", "대출·금리", "분양·청약", "재건축·재개발", "전월세", "기타",
];

export function classifyNews(title = "") {
  if (/재건축|재개발|리모델링|정비사업|정비구역|안전진단/.test(title)) return "재건축·재개발";
  if (/분양|청약|입주|미분양|모델하우스|견본주택/.test(title)) return "분양·청약";
  if (/전세|전셋|월세|월셋|임대|보증금|역전세|깡통/.test(title)) return "전월세";
  if (/대출|금리|DSR|LTV|주담대|주택담보|디딤돌|보금자리론/.test(title)) return "대출·금리";
  if (/정책|규제|종부세|취득세|양도세|보유세|재산세|공시가|대책|토지거래허가|허가구역|세제/.test(title)) return "정책·세금";
  if (/매매|실거래|시세|집값|아파트값|신고가|최고가|호가|거래량|상승|하락|급등|급락|반등|매수|매도|손바뀜/.test(title)) return "매매·시세";
  return "기타";
}

// ── 중요도(필독/주목/일반) ──────────────────────────────────────────────────
// 카테고리와 같은 방침: DB 컬럼 없이 제목에서 계산 → 룰을 고치면 과거 기사에도 소급된다.
// 점수 = 카테고리 가중 + 제목 신호어 + 관심지역 + 자금 프로필.

// 카테고리 가중 — "내 대출·세금이 직접 바뀌는가"가 기준이다.
// 전월세는 이 앱의 목적(매매 자금 판정)에서 멀어 0.
const PRIORITY_CAT_WEIGHT = {
  "대출·금리": 2,
  "정책·세금": 2,
  "매매·시세": 1,
  "분양·청약": 1,
  "재건축·재개발": 1,
  "전월세": 0,
  "기타": 0,
};

// 강한 신호어 = "지금 벌어진 일"(시행·확정·수치 변경). 해설·전망·시황과 가르는 축이다.
// ⚠️ 같은 카테고리 안에서 "DSR 시행"과 "오늘의 금리 시황"을 갈라주는 게 이 정규식의 전부다 —
//    여기를 넓히면 필독이 범람해 색 구분이 죽는다(2026-08-31 실측으로 임계값을 맞춰둠).
const STRONG_SIGNAL =
  /시행|발표|확정|의결|국무회의|입법예고|시행령|개정|인상|인하|동결|중단|축소|확대|해제|지정|규제|대책|한도|금지|폐지|출시|재개/;
// 긴급어 = 오늘 내로 읽어야 하는 것. ⚠️ "오늘"만 잡으면 "오늘의 시황"이 걸린다.
const URGENT_SIGNAL = /긴급|속보|오늘부터|내일부터|마감|D-\d/;

// 정치 공방·논평 감점(−2) — "누가 뭐라고 했다"는 확정된 변화가 아니다.
// ⚠️ 이 감점이 없으면 화면이 무너진다: classifyNews는 제목에 "부동산 정책"만 있어도 전부
//    정책·세금(2점)으로 빨아들이는데, 지지율·여야 공방·칼럼이 그 카테고리에 대량으로
//    들어온다. 2026-08-31 실측(최근 7일 240건): 감점 없으면 주목 52.1% — 절반이 주목이면
//    색이 아무것도 구분하지 못한다. 감점 후 필독 9.6%(하루 3.8건)·주목 18.8%·일반 71.7%.
// ⚠️ 물음표는 **제목 끝**일 때만 논평으로 본다 — 인용문 속 물음표는 평범한 기사다
//    (실측 반례: `"우리 아파트 스타벅스, 짭이라고요?" 입주민 황당`).
const OPINION_NOISE =
  /^[[(](성명|칼럼|사설|기고|영상|만평|포토|인터뷰|집중진단|취재|르포|기자수첩|평론|맞수토론)|칼럼\)|지지율|공방|정면충돌|막말|저격|질타|해명|반박|의원|발의|여당|야당|대선|총선|국정감사|논란|비판|멀티미디어|카드\/한컷|\?\s*$/;

// 즐겨찾기 지역 키워드("분당구 아파트" 꼴)로 수집된 기사인지.
// ⚠️ 즐겨찾기를 따로 조회하지 않는다 — 수집 키워드가 곧 "내 ★ 지역 때문에 들어온 기사"라는
//    증거다(newsKeywords가 만든 값). 뉴스 페이지의 ⭐ 칩도 같은 판정을 써야 둘이 안 갈린다.
export function isRegionKeyword(keyword) {
  return /\s아파트$/.test(keyword || "");
}

export function newsScore(item = {}, { hasIncome = false } = {}) {
  const title = item.title || "";
  const cat = item.cat || classifyNews(title);
  let score = PRIORITY_CAT_WEIGHT[cat] ?? 0;
  if (STRONG_SIGNAL.test(title)) score += 2;
  if (URGENT_SIGNAL.test(title)) score += 1;
  if (isRegionKeyword(item.keyword)) score += 2;
  // 소득을 입력해 대출 계산을 쓰고 있다면 금리·한도 기사는 남의 일이 아니다.
  if (hasIncome && cat === "대출·금리") score += 1;
  if (OPINION_NOISE.test(title)) score -= 2;
  return score;
}

// ⚠️ 주목이 3점부터인 이유: 2점이면 **카테고리만으로** 주목이 된다(대출·금리 기사는 전부).
//    3점 = "카테고리 + 신호어나 관심지역이 하나는 더 있어야 한다"는 뜻이고, 그래야
//    일반이 다수로 남아 색이 실제로 무언가를 가리킨다(위 실측 분포 참조).
export function newsPriority(item = {}, ctx) {
  const score = newsScore(item, ctx);
  if (score >= 4) return "필독";
  if (score >= 3) return "주목";
  return "일반";
}

// 수집 키워드 = 기본 + 즐겨찾기 지역("분당구 아파트" 꼴). lawdCds 중복 무관.
export function newsKeywords(lawdCds = []) {
  const regions = [...new Set(lawdCds)].map((c) => `${regionToken(c)} 아파트`);
  return [...new Set([...BASE_KEYWORDS, ...regions])];
}

export function newsSource() {
  return process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET
    ? "naver"
    : "google-rss";
}

// HTML 태그 제거 + 기본 엔티티 디코드(네이버 title/description의 <b>·&quot; 등).
function cleanText(s) {
  return (s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&") // 반드시 마지막(이중 이스케이프 방지)
    .trim();
}

function toIso(dateStr) {
  const t = Date.parse(dateStr); // RFC 2822(네이버 +0900 / RSS GMT) 둘 다 파싱됨
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function pickXml(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() : "";
}

async function fetchNaver(keyword) {
  const url =
    `${NAVER_ENDPOINT}?query=${encodeURIComponent(keyword)}` +
    `&display=${PER_KEYWORD}&sort=date`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`네이버 뉴스 API ${res.status}`);
  const json = await res.json();
  return (json.items || []).map((it) => {
    let source = "";
    try {
      source = new URL(it.originallink || it.link).hostname.replace(/^www\./, "");
    } catch {}
    return {
      link: it.link || it.originallink, // n.news.naver.com 우선(모바일 열람 안정)
      title: cleanText(it.title),
      source,
      description: cleanText(it.description),
      publishedAt: toIso(it.pubDate),
    };
  });
}

async function fetchGoogleRss(keyword) {
  const url =
    `${GOOGLE_RSS}?q=${encodeURIComponent(keyword)}&hl=ko&gl=KR&ceid=KR%3Ako`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Budongsan/0.1" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`구글 뉴스 RSS ${res.status}`);
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.slice(0, PER_KEYWORD).map((b) => {
    const source = cleanText(pickXml(b, "source"));
    let title = cleanText(pickXml(b, "title"));
    // 구글 RSS 제목은 "기사제목 - 언론사" 꼴 → 언론사 접미 제거.
    // 기사 원제목에 이미 언론사가 붙어 이중인 경우가 있어 반복 제거(2026-07-08 실측).
    while (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3)).trim();
    }
    return {
      link: pickXml(b, "link"),
      title,
      source,
      description: "", // RSS description은 링크 목록 HTML이라 미사용
      publishedAt: toIso(pickXml(b, "pubDate")),
    };
  });
}

// 한 키워드의 최신 기사 목록. [{link,title,source,description,publishedAt}]
// 비수도권 기사는 여기서 걸러 DB에 아예 저장하지 않는다(2026-07-12, 수도권 온리 방침).
export async function fetchNews(keyword) {
  const items =
    newsSource() === "naver"
      ? await fetchNaver(keyword)
      : await fetchGoogleRss(keyword);
  return items.filter(
    (it) => it.link && it.title && isCapitalAreaNews(it.title, it.description)
  );
}
