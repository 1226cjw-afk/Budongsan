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

// 단지 좌표 (geocode_cache 사용). {lat,lng}|null.
export async function geocodeCached(lawdCd, umdNm, aptNm, jibun) {
  if (supabaseAdmin) {
    const { data: row } = await supabaseAdmin
      .from("geocode_cache")
      .select("lat, lng")
      .eq("lawd_cd", lawdCd)
      .eq("umd_nm", umdNm)
      .eq("apt_nm", aptNm)
      .maybeSingle();
    if (row) return row.lat != null ? { lat: row.lat, lng: row.lng } : null;
  }
  const kakaoKey = process.env.KAKAO_REST_API_KEY;
  if (!kakaoKey) throw new Error("KAKAO_REST_API_KEY 환경변수가 필요합니다.");
  const coord = await geocode(
    regionPrefix(lawdCd),
    regionToken(lawdCd),
    umdNm,
    aptNm,
    jibun,
    kakaoKey
  );
  if (supabaseAdmin && coord) {
    await supabaseAdmin.from("geocode_cache").upsert(
      {
        lawd_cd: lawdCd,
        umd_nm: umdNm,
        apt_nm: aptNm,
        lat: coord.lat,
        lng: coord.lng,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "lawd_cd,umd_nm,apt_nm" }
    );
  }
  return coord;
}
