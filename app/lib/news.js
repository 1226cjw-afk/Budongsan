// 데일리 부동산 뉴스 수집 — /api/cron/news 공용 lib.
//
// 소스 2단: 네이버 뉴스 검색 API(NAVER_CLIENT_ID/SECRET 있으면, 일 25,000회 무료)
//           → 없으면 구글 뉴스 RSS(키 불필요) 폴백. 어느 쪽이든 즉시 동작.
// ⚠️ supabaseServer 미의존 유지 — scripts/*.mjs 단독 import 검증 가능(trades.js와 달리).
//    DB 저장은 라우트(/api/cron/news)에서 수행.

import { regionToken } from "./regions.js"; // 확장자 필수 — raw node 단독 import 유지

const NAVER_ENDPOINT = "https://openapi.naver.com/v1/search/news.json";
const GOOGLE_RSS = "https://news.google.com/rss/search";

export const PER_KEYWORD = 30; // 키워드당 수집 기사 수

// 항상 수집하는 기본 키워드. 즐겨찾기 지역 키워드가 여기에 더해진다.
export const BASE_KEYWORDS = [
  "부동산 정책",
  "아파트 매매",
  "부동산 대출 규제",
  "재건축 재개발",
];

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
    headers: { "User-Agent": "RealEstate_Map/0.1" },
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
export async function fetchNews(keyword) {
  const items =
    newsSource() === "naver"
      ? await fetchNaver(keyword)
      : await fetchGoogleRss(keyword);
  return items.filter((it) => it.link && it.title);
}
