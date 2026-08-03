// 국토부 실거래가 수집 + 카카오 지오코딩 + 캐시. /api/trades, /api/trend 공용.
//
// 국토부 호출 quirk (CLAUDE.md 검증됨): http만 / User-Agent 필수 / XML 전용.

import { supabaseAdmin } from "./supabaseServer";
import { regionPrefix, regionToken } from "./regions";
import { excludeAbnormal } from "./tradeStats";

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
    // 시세 왜곡 거래 판별용(tradeStats.excludeAbnormal). 해제="O"/정상=공백, 거래유형=중개거래|직거래.
    cdealType: pick(b, "cdealType"),
    dealingGbn: pick(b, "dealingGbn"),
    // 법인 거래 판별용(marketSignal). 개인|법인|공공기관|기타 — 2026-08-03 원본 확인.
    buyerGbn: pick(b, "buyerGbn"),
    slerGbn: pick(b, "slerGbn"),
    // 해제일. 해제는 계약보다 나중에 발생해 "언제 취소됐나"는 이 값이라야 맞다.
    cdealDay: pick(b, "cdealDay"),
    dealYmd: `${pick(b, "dealYear")}-${pick(b, "dealMonth").padStart(2, "0")}-${pick(b, "dealDay").padStart(2, "0")}`,
  }));
}

// 해제/거래유형/매수자 구분 필드가 없는 옛 캐시 행 판별 → 미스로 취급해 재수집시킨다.
// (마이그레이션 없이 자가 치유. 빈 달은 판별 불가지만 거래가 없어 무해하다.)
// ⚠️ buyerGbn 검사를 빼면 안 된다 — 2026-07-29에 cdealType만 보고 재수집한 캐시엔
//    buyerGbn이 없어서, 이 검사가 없으면 법인 지표가 영영 빈 채로 남는다(2026-08-03).
function lacksDealFlags(trades) {
  if (!Array.isArray(trades) || trades.length === 0) return false;
  return !("cdealType" in trades[0]) || !("buyerGbn" in trades[0]);
}

const APT_CATEGORY = /주거시설\s*>\s*아파트/; // 카카오 category_name

// 한 단지 지오코딩 (지역 prefix 부여 + 결과 지역 검증). {lat,lng,placeName}|null.
// placeName = 카카오가 아는 정식 단지명 — 아파트로 확인된 경우만 채운다(네이버 딥링크용).
async function geocode(prefix, token, umdNm, aptNm, jibun, kakaoKey) {
  const headers = { Authorization: `KakaoAK ${kakaoKey}` };
  const search = async (base, query) => {
    const res = await fetch(`${base}?query=${encodeURIComponent(query)}`, {
      headers,
    }).then((r) => r.json());
    return res.documents || [];
  };
  // 지역 안 결과 중 **아파트 카테고리 우선**. 단지 안의 전기차충전소·관리사무소·어린이집이
  // 상위에 오는 일이 잦아, 첫 결과를 그대로 쓰면 핀이 단지가 아닌 부속시설에 꽂힌다
  // (2026-07-29 안양 동안구 60곳 실측: 7곳이 비아파트 POI에 매칭).
  const pickInRegion = (docs) => {
    const inR = docs.filter((d) =>
      `${d.address_name || ""} ${d.road_address_name || ""}`.includes(token)
    );
    return inR.find((d) => APT_CATEGORY.test(d.category_name || "")) || inR[0] || null;
  };
  const toResult = (d) => ({
    lat: Number(d.y),
    lng: Number(d.x),
    placeName: APT_CATEGORY.test(d.category_name || "") ? d.place_name || null : null,
  });
  const attempts = [
    [KAKAO_KEYWORD, `${prefix} ${umdNm} ${aptNm}`],
    [KAKAO_KEYWORD, `${prefix} ${aptNm}`],
    [KAKAO_ADDRESS, `${prefix} ${umdNm} ${jibun}`],
    [KAKAO_KEYWORD, `${umdNm} ${aptNm}`],
  ];
  for (const [base, query] of attempts) {
    const hit = pickInRegion(await search(base, query));
    if (hit) return toResult(hit);
  }
  return null;
}

// 국토부에서 한 달 원본 거래를 직접 수집(캐시 미사용). 내부용.
async function fetchMonthFromApi(lawdCd, ymd) {
  const dataKey = process.env.DATA_GO_KR_KEY;
  if (!dataKey) throw new Error("DATA_GO_KR_KEY 환경변수가 필요합니다.");
  const url =
    `${RTMS_ENDPOINT}?serviceKey=${encodeURIComponent(dataKey)}` +
    `&LAWD_CD=${lawdCd}&DEAL_YMD=${ymd}&numOfRows=1000&pageNo=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Budongsan/0.1" },
    cache: "no-store",
  });
  const xml = await res.text();
  const code = (xml.match(/<resultCode>([^<]*)<\/resultCode>/) || [])[1];
  if (code && code !== "00" && code !== "000") {
    const msg = (xml.match(/<resultMsg>([^<]*)<\/resultMsg>/) || [])[1] || "unknown";
    throw new Error(`국토부 API 오류 ${code}: ${msg}`);
  }
  return parseTrades(xml).filter((t) => t.dealAmount < MAX_AMOUNT);
}

// 미캐시 달 동시 국토부 호출 상한. 실측(2026-07, 36개월 콜드): 동시6=15.7s / 12=12.1s / 36=4.7s
// — 국토부는 동시 호출 스로틀이 없어 전량 동시가 최속. months 상한이 36이라 사실상 무제한.
const RTMS_CONCURRENCY = 36;

// 여러 달 원본 거래를 한 번에 → 캐시 1회 일괄 조회, 미스만 제한 병렬 수집 + 배치 저장.
// 반환: { byYmd: Map(ymd → trades[]), fetchedYmds: 국토부에서 새로 받은 달들,
//         latestFetched: 가장 최근 fetched_at(ISO)|null — 신선도 표시용, 추가 조회 없이 산출,
//         excluded: {cancelled, direct} — 시세 왜곡으로 걸러낸 건수 }
// ⚠️ 캐시에는 **원본 그대로** 저장하고 걸러내기는 읽을 때 한다 — 제외 기준이 바뀌어도 재수집이
//    필요 없고, 이 함수를 거치는 네 라우트(/trades·/trend·/rank·/briefing)가 같은 기준을 공유한다.
export async function fetchRawMonths(lawdCd, ymds, { refresh = false, cacheOnly = false } = {}) {
  const byYmd = new Map();
  let latestFetched = null; // 캐시 신선도(가장 최근 fetched_at) — 별도 조회 없이 여기서 산출.

  // 저장된 원본에서 시세 왜곡 거래(해제·직거래)를 걷어낸 결과로 바꿔 반환한다.
  const finish = (fetchedYmds) => {
    const excluded = { cancelled: 0, direct: 0 };
    for (const [ymd, raw] of byYmd) {
      const { trades, cancelled, direct } = excludeAbnormal(raw);
      byYmd.set(ymd, trades);
      excluded.cancelled += cancelled;
      excluded.direct += direct;
    }
    return { byYmd, fetchedYmds, latestFetched, excluded };
  };

  if (supabaseAdmin && !refresh) {
    const { data } = await supabaseAdmin
      .from("trade_raw_cache")
      .select("deal_ymd, trades, fetched_at")
      .eq("lawd_cd", lawdCd)
      .in("deal_ymd", ymds);
    for (const row of data || []) {
      const ageMs = Date.now() - new Date(row.fetched_at).getTime();
      const stale = isCurrentMonth(row.deal_ymd) && ageMs > CURRENT_MONTH_TTL_MS;
      if (!stale && !lacksDealFlags(row.trades)) {
        byYmd.set(row.deal_ymd, row.trades);
        if (!latestFetched || row.fetched_at > latestFetched) latestFetched = row.fetched_at;
      }
    }
  }

  const misses = ymds.filter((ymd) => !byYmd.has(ymd));

  // 캐시 전용 모드: 미스가 있어도 국토부를 호출하지 않는다. 브리핑처럼
  // "이미 cron이 채워둔 것만 빠르게 읽는" 용도 — 응답 지연·API 쿼터 소모를 막는다.
  if (cacheOnly) return finish([]);

  const fetchedYmds = [];
  let firstError = null;
  for (let i = 0; i < misses.length; i += RTMS_CONCURRENCY) {
    const batch = misses.slice(i, i + RTMS_CONCURRENCY);
    // 한 달이 실패해도 나머지 달은 살린다 — Promise.all은 한 달만 터져도 전량 실패(502)라
    // 일시적 국토부 오류가 전체 응답을 죽였다. 성공분만 반영하고, 전량 실패일 때만 던진다.
    const settled = await Promise.allSettled(
      batch.map((ymd) => fetchMonthFromApi(lawdCd, ymd))
    );
    const now = new Date().toISOString();
    const okRows = [];
    batch.forEach((ymd, j) => {
      const r = settled[j];
      if (r.status === "fulfilled") {
        byYmd.set(ymd, r.value);
        fetchedYmds.push(ymd);
        okRows.push({ lawd_cd: lawdCd, deal_ymd: ymd, trades: r.value, fetched_at: now });
      } else if (!firstError) {
        firstError = r.reason;
      }
    });
    if (okRows.length) {
      latestFetched = now; // 방금 받은 게 가장 신선.
      if (supabaseAdmin) {
        const { error } = await supabaseAdmin
          .from("trade_raw_cache")
          .upsert(okRows, { onConflict: "lawd_cd,deal_ymd" });
        if (error) console.error("[trade_raw_cache] batch upsert:", error.message);
      }
    }
  }
  // 성공한 달이 하나도 없는데 미스가 있었다면 원인 에러를 그대로 올린다(키 누락·국토부 장애 노출).
  if (!byYmd.size && misses.length && firstError) throw firstError;

  return finish(fetchedYmds);
}

// 한 달 원본 거래(<12억) 반환. trade_raw_cache 사용(이번달 12h TTL).
export async function fetchRawMonth(lawdCd, ymd, opts) {
  const { byYmd } = await fetchRawMonths(lawdCd, [ymd], opts);
  return byYmd.get(ymd);
}

const GEOCODE_CONCURRENCY = 8; // 미캐시 단지 동시 지오코딩 수
// 정식 단지명(place_name)이 비어 있는 옛 캐시 행을 한 요청에서 다시 조회할 최대 개수.
// ⚠️ 상한이 없으면 0006 적용 직후 첫 방문에서 지역 전체(수백 곳)를 재지오코딩하다
//    함수 타임아웃(Vercel 기본 10s)에 걸린다. 좌표는 이미 캐시에 있으므로 나눠 채워도
//    화면은 정상이고, 몇 번 방문하는 사이 자연히 다 채워진다.
const PLACE_NAME_BACKFILL_LIMIT = 40;

// 여러 단지 좌표를 한 번에 구한다 → 캐시는 1회 일괄 조회, 미스만 병렬 지오코딩 후 일괄 저장.
// items: [{umdNm, aptNm, jibun}]. 반환: Map(`umd|apt` → {lat,lng,placeName}|null).
export async function geocodeMany(lawdCd, items) {
  const result = new Map();

  // 1) 이 시군구의 캐시 좌표를 한 번에 읽는다 (순차 N회 조회 → 1회).
  // place_name이 NULL = "정식명을 확인한 적 없는 옛 행". 좌표는 쓸 수 있으므로 캐시로 두되
  // 백필 후보로 표시해 두고, 이번 요청에서 상한만큼만 다시 조회한다.
  // 확인했지만 아파트 매칭이 없던 단지는 빈 문자열로 저장해 매번 재조회되지 않게 한다.
  const cached = new Map();
  const needsName = new Set();
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from("geocode_cache")
      .select("umd_nm, apt_nm, lat, lng, place_name")
      .eq("lawd_cd", lawdCd);
    for (const r of data || []) {
      const key = `${r.umd_nm}|${r.apt_nm}`;
      if (r.lat != null && r.place_name == null) needsName.add(key);
      cached.set(
        key,
        r.lat != null ? { lat: r.lat, lng: r.lng, placeName: r.place_name || null } : null
      );
    }
  }

  const misses = [];
  let backfillLeft = PLACE_NAME_BACKFILL_LIMIT;
  for (const it of items) {
    const key = `${it.umdNm}|${it.aptNm}`;
    if (!cached.has(key)) {
      misses.push(it);
    } else if (needsName.has(key) && backfillLeft > 0) {
      backfillLeft -= 1;
      misses.push(it); // 좌표는 있지만 정식명이 없는 행 → 이번 차례에 채운다
    } else {
      result.set(key, cached.get(key));
    }
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
      // ⚠️ 백필(좌표는 이미 있는 행) 재조회가 실패하면 캐시 좌표를 유지한다 —
      //    null로 덮으면 멀쩡히 보이던 핀이 사라진다.
      const coord = coords[j] || cached.get(key) || null;
      result.set(key, coord);
      if (coords[j]) {
        toUpsert.push({
          lawd_cd: lawdCd,
          umd_nm: it.umdNm,
          apt_nm: it.aptNm,
          lat: coords[j].lat,
          lng: coords[j].lng,
          place_name: coords[j].placeName || "", // ""=확인했으나 아파트 매칭 없음(재조회 방지)
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
