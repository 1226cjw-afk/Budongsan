// 국토부 실거래가 수집 + 카카오 지오코딩 + 캐시. /api/trades, /api/trend 공용.
//
// 국토부 호출 quirk (CLAUDE.md 검증됨): http만 / User-Agent 필수 / XML 전용.

import { supabaseAdmin } from "./supabaseServer";
import { regionPrefix, regionToken } from "./regions";

const RTMS_ENDPOINT =
  "http://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade";
const KAKAO_KEYWORD = "https://dapi.kakao.com/v2/local/search/keyword.json";
const KAKAO_ADDRESS = "https://dapi.kakao.com/v2/local/search/address.json";

const MAX_AMOUNT = 120000; // 12억 이상 거래 제외(만원)
const CURRENT_MONTH_TTL_MS = 12 * 60 * 60 * 1000; // 이번달 캐시 12시간

export function currentYmd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isCurrentMonth(ymd) {
  return ymd === currentYmd();
}

// 종료월(YYYYMM)부터 과거로 n개월 YYYYMM 배열(내림차순).
export function monthsBack(endYmd, n) {
  const d = new Date(+endYmd.slice(0, 4), +endYmd.slice(4) - 1, 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : "";
}

function parseTrades(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.map((b) => ({
    aptNm: pick(b, "aptNm"),
    umdNm: pick(b, "umdNm"),
    jibun: pick(b, "jibun"),
    dealAmount: Number(pick(b, "dealAmount").replace(/[^0-9]/g, "")) || 0, // 만원
    area: Number(pick(b, "excluUseAr")) || 0, // 전용면적 m²
    floor: Number(pick(b, "floor")) || 0,
    buildYear: pick(b, "buildYear"),
    dealYmd: `${pick(b, "dealYear")}-${pick(b, "dealMonth").padStart(2, "0")}-${pick(b, "dealDay").padStart(2, "0")}`,
  }));
}

// 한 단지 지오코딩 (지역 prefix 부여 + 결과 지역 검증). {lat,lng}|null.
async function geocode(prefix, token, umdNm, aptNm, jibun, kakaoKey) {
  const headers = { Authorization: `KakaoAK ${kakaoKey}` };
  const search = async (base, query) => {
    const res = await fetch(`${base}?query=${encodeURIComponent(query)}`, {
      headers,
    }).then((r) => r.json());
    return res.documents || [];
  };
  const inRegion = (docs) =>
    docs.find((d) =>
      `${d.address_name || ""} ${d.road_address_name || ""}`.includes(token)
    );
  const toCoord = (d) => (d ? { lat: Number(d.y), lng: Number(d.x) } : null);
  const attempts = [
    [KAKAO_KEYWORD, `${prefix} ${umdNm} ${aptNm}`],
    [KAKAO_KEYWORD, `${prefix} ${aptNm}`],
    [KAKAO_ADDRESS, `${prefix} ${umdNm} ${jibun}`],
    [KAKAO_KEYWORD, `${umdNm} ${aptNm}`],
  ];
  for (const [base, query] of attempts) {
    const hit = inRegion(await search(base, query));
    if (hit) return toCoord(hit);
  }
  return null;
}

// 한 달 원본 거래(<12억) 반환. trade_raw_cache 사용(이번달 12h TTL).
export async function fetchRawMonth(lawdCd, ymd, { refresh = false } = {}) {
  if (supabaseAdmin && !refresh) {
    const { data: row } = await supabaseAdmin
      .from("trade_raw_cache")
      .select("trades, fetched_at")
      .eq("lawd_cd", lawdCd)
      .eq("deal_ymd", ymd)
      .maybeSingle();
    if (row) {
      const ageMs = Date.now() - new Date(row.fetched_at).getTime();
      const stale = isCurrentMonth(ymd) && ageMs > CURRENT_MONTH_TTL_MS;
      if (!stale) return row.trades;
    }
  }

  const dataKey = process.env.DATA_GO_KR_KEY;
  if (!dataKey) throw new Error("DATA_GO_KR_KEY 환경변수가 필요합니다.");
  const url =
    `${RTMS_ENDPOINT}?serviceKey=${encodeURIComponent(dataKey)}` +
    `&LAWD_CD=${lawdCd}&DEAL_YMD=${ymd}&numOfRows=1000&pageNo=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "RealEstate_Map/0.1" },
    cache: "no-store",
  });
  const xml = await res.text();
  const code = (xml.match(/<resultCode>([^<]*)<\/resultCode>/) || [])[1];
  if (code && code !== "00" && code !== "000") {
    const msg = (xml.match(/<resultMsg>([^<]*)<\/resultMsg>/) || [])[1] || "unknown";
    throw new Error(`국토부 API 오류 ${code}: ${msg}`);
  }
  const trades = parseTrades(xml).filter((t) => t.dealAmount < MAX_AMOUNT);

  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from("trade_raw_cache").upsert(
      { lawd_cd: lawdCd, deal_ymd: ymd, trades, fetched_at: new Date().toISOString() },
      { onConflict: "lawd_cd,deal_ymd" }
    );
    if (error) console.error("[trade_raw_cache] upsert:", error.message);
  }
  return trades;
}

const GEOCODE_CONCURRENCY = 8; // 미캐시 단지 동시 지오코딩 수

// 여러 단지 좌표를 한 번에 구한다 → 캐시는 1회 일괄 조회, 미스만 병렬 지오코딩 후 일괄 저장.
// items: [{umdNm, aptNm, jibun}]. 반환: Map(`umd|apt` → {lat,lng}|null).
export async function geocodeMany(lawdCd, items) {
  const result = new Map();

  // 1) 이 시군구의 캐시 좌표를 한 번에 읽는다 (순차 N회 조회 → 1회).
  const cached = new Map();
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from("geocode_cache")
      .select("umd_nm, apt_nm, lat, lng")
      .eq("lawd_cd", lawdCd);
    for (const r of data || []) {
      cached.set(`${r.umd_nm}|${r.apt_nm}`, r.lat != null ? { lat: r.lat, lng: r.lng } : null);
    }
  }

  const misses = [];
  for (const it of items) {
    const key = `${it.umdNm}|${it.aptNm}`;
    if (cached.has(key)) result.set(key, cached.get(key));
    else misses.push(it);
  }
  if (!misses.length) return result;

  // 2) 미캐시 단지만 병렬(동시 GEOCODE_CONCURRENCY개) 지오코딩.
  const kakaoKey = process.env.KAKAO_REST_API_KEY;
  if (!kakaoKey) throw new Error("KAKAO_REST_API_KEY 환경변수가 필요합니다.");
  const prefix = regionPrefix(lawdCd);
  const token = regionToken(lawdCd);
  const toUpsert = [];
  for (let i = 0; i < misses.length; i += GEOCODE_CONCURRENCY) {
    const batch = misses.slice(i, i + GEOCODE_CONCURRENCY);
    const coords = await Promise.all(
      batch.map((it) =>
        geocode(prefix, token, it.umdNm, it.aptNm, it.jibun, kakaoKey).catch(() => null)
      )
    );
    batch.forEach((it, j) => {
      const key = `${it.umdNm}|${it.aptNm}`;
      result.set(key, coords[j]);
      if (coords[j]) {
        toUpsert.push({
          lawd_cd: lawdCd,
          umd_nm: it.umdNm,
          apt_nm: it.aptNm,
          lat: coords[j].lat,
          lng: coords[j].lng,
          fetched_at: new Date().toISOString(),
        });
      }
    });
  }

  // 3) 새로 구한 좌표는 한 번에 저장.
  if (supabaseAdmin && toUpsert.length) {
    const { error } = await supabaseAdmin
      .from("geocode_cache")
      .upsert(toUpsert, { onConflict: "lawd_cd,umd_nm,apt_nm" });
    if (error) console.error("[geocode_cache] batch upsert:", error.message);
  }
  return result;
}
