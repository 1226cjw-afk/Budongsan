// 국토부 아파트 실거래가 → 카카오 지오코딩 → JSON 응답 API 라우트.
//
// 호출 quirk (CLAUDE.md 검증됨, 반드시 준수):
//   - http:// 만 동작 (https → Unauthorized)
//   - User-Agent 헤더 필수 (없으면 400)
//   - XML 전용 (_type=json → Unauthorized)
// 실거래 응답엔 좌표가 없으므로 단지명+법정동을 카카오 로컬 API로 지오코딩한다.

import { supabaseAdmin } from "../../lib/supabaseServer";

const RTMS_ENDPOINT =
  "http://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade";
const KAKAO_KEYWORD = "https://dapi.kakao.com/v2/local/search/keyword.json";
const KAKAO_ADDRESS = "https://dapi.kakao.com/v2/local/search/address.json";

// 캐시 신선도: 지난 달까지의 실거래는 확정값이라 사실상 영구.
// 이번 달 데이터는 거래가 계속 신고되므로 12시간만 캐시.
const CURRENT_MONTH_TTL_MS = 12 * 60 * 60 * 1000;

function isCurrentMonth(dealYmd) {
  const now = new Date();
  const cur = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return dealYmd === cur;
}

// <tag>value</tag> 한 개를 item 블록에서 뽑아낸다.
function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : "";
}

// 실거래가 XML을 거래 객체 배열로 파싱.
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

// 단지 하나를 카카오 로컬 API로 지오코딩. 좌표 {lat,lng} 또는 null.
async function geocode(umdNm, aptNm, jibun, kakaoKey) {
  const headers = { Authorization: `KakaoAK ${kakaoKey}` };

  // 1순위: 키워드 검색 "법정동 단지명" (예: "역삼동 개나리아파트")
  const kw = await fetch(
    `${KAKAO_KEYWORD}?query=${encodeURIComponent(`${umdNm} ${aptNm}`)}`,
    { headers }
  ).then((r) => r.json());
  if (kw.documents?.length) {
    const d = kw.documents[0];
    return { lat: Number(d.y), lng: Number(d.x) };
  }

  // 2순위: 지번 주소 검색 "법정동 지번"
  const ad = await fetch(
    `${KAKAO_ADDRESS}?query=${encodeURIComponent(`${umdNm} ${jibun}`)}`,
    { headers }
  ).then((r) => r.json());
  if (ad.documents?.length) {
    const d = ad.documents[0];
    return { lat: Number(d.y), lng: Number(d.x) };
  }

  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lawdCd = searchParams.get("lawdCd"); // 법정동 5자리
  const dealYmd = searchParams.get("dealYmd"); // YYYYMM
  const refresh = searchParams.get("refresh") === "1"; // 캐시 무시 강제 갱신

  if (!lawdCd || !dealYmd) {
    return Response.json(
      { error: "lawdCd(법정동5자리)와 dealYmd(YYYYMM)가 필요합니다." },
      { status: 400 }
    );
  }

  // 0) 캐시 조회 — 히트하면 국토부/지오코딩(~9초) 건너뛰고 즉시 반환.
  if (supabaseAdmin && !refresh) {
    const { data: row } = await supabaseAdmin
      .from("trade_cache")
      .select("payload, fetched_at")
      .eq("lawd_cd", lawdCd)
      .eq("deal_ymd", dealYmd)
      .maybeSingle();
    if (row) {
      const ageMs = Date.now() - new Date(row.fetched_at).getTime();
      const stale = isCurrentMonth(dealYmd) && ageMs > CURRENT_MONTH_TTL_MS;
      if (!stale) {
        return Response.json({ ...row.payload, cached: true });
      }
    }
  }

  const dataKey = process.env.DATA_GO_KR_KEY;
  const kakaoKey = process.env.KAKAO_REST_API_KEY;
  if (!dataKey || !kakaoKey) {
    return Response.json(
      { error: "DATA_GO_KR_KEY / KAKAO_REST_API_KEY 환경변수가 필요합니다." },
      { status: 500 }
    );
  }

  // 1) 국토부 실거래가 호출 (http / UA 필수 / XML)
  const url =
    `${RTMS_ENDPOINT}?serviceKey=${encodeURIComponent(dataKey)}` +
    `&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}&numOfRows=1000&pageNo=1`;
  let xml;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RealEstate_Map/0.1" },
      cache: "no-store",
    });
    xml = await res.text();
  } catch (e) {
    return Response.json({ error: `국토부 API 호출 실패: ${e.message}` }, { status: 502 });
  }

  const resultCode = (xml.match(/<resultCode>([^<]*)<\/resultCode>/) || [])[1];
  if (resultCode && resultCode !== "00" && resultCode !== "000") {
    const msg = (xml.match(/<resultMsg>([^<]*)<\/resultMsg>/) || [])[1] || "unknown";
    return Response.json({ error: `국토부 API 오류 ${resultCode}: ${msg}` }, { status: 502 });
  }

  // 12억(120,000만원) 이상 거래는 대상 외 → 수집 단계에서 제외 (지오코딩·캐시 부담도 감소).
  const trades = parseTrades(xml).filter((t) => t.dealAmount < 120000);

  // 2) 단지명 기준으로 묶어서 지오코딩 횟수를 줄인다.
  const byApt = new Map();
  for (const t of trades) {
    const key = `${t.umdNm}|${t.aptNm}`;
    if (!byApt.has(key)) byApt.set(key, []);
    byApt.get(key).push(t);
  }

  // 3) 단지별 지오코딩 (순차 — 카카오 rate limit 보호)
  const complexes = [];
  for (const [, group] of byApt) {
    const { aptNm, umdNm, jibun } = group[0];
    const coord = await geocode(umdNm, aptNm, jibun, kakaoKey);
    complexes.push({
      aptNm,
      umdNm,
      lat: coord?.lat ?? null,
      lng: coord?.lng ?? null,
      trades: group,
      // 표시용 요약: 최고/최저/최근 거래가(만원)
      maxAmount: Math.max(...group.map((g) => g.dealAmount)),
      minAmount: Math.min(...group.map((g) => g.dealAmount)),
      count: group.length,
    });
  }

  const payload = {
    lawdCd,
    dealYmd,
    total: trades.length,
    complexCount: complexes.length,
    geocoded: complexes.filter((c) => c.lat != null).length,
    complexes,
  };

  // 4) 캐시에 저장(upsert) — 다음 호출부터 지오코딩 생략. 실패해도 응답엔 영향 없음.
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from("trade_cache").upsert(
      { lawd_cd: lawdCd, deal_ymd: dealYmd, payload, fetched_at: new Date().toISOString() },
      { onConflict: "lawd_cd,deal_ymd" }
    );
    if (error) console.error("[trade_cache] upsert 실패:", error.message);
  }

  return Response.json({ ...payload, cached: false });
}
