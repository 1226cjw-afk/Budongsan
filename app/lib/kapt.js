// 국토부 공동주택 단지 정보(세대수 등) 조회. 실거래가 API엔 세대수가 없어 별도 보강.
//
// ⚠️ data.go.kr에서 아래 2개 API **활용신청** 필요(승인 후 동작). **2026-06-25 승인 확인**.
//   - 공동주택 단지 목록제공 서비스 (AptListService3/getSigunguAptList3)     → kaptCode 찾기
//   - 공동주택 기본 정보제공 서비스 (AptBasisInfoServiceV4/getAphusBassInfoV4) → 세대수/동수/사용승인일
// ⚠️ 이 계열은 실거래가 API와 달리 **응답이 JSON**(content-type application/json).
//   `_type=xml`을 줘도 JSON으로 옴 → **JSON으로 파싱**. http/User-Agent quirk·키(DATA_GO_KR_KEY)는 공용.
//   미승인/오류 시 JSON 파싱 실패(null) → graceful: { kaptCode: null }.

import { supabaseAdmin } from "./supabaseServer";

const LIST_ENDPOINT = "http://apis.data.go.kr/1613000/AptListService3/getSigunguAptList3";
const INFO_ENDPOINT = "http://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4";

// 서버 프로세스 수명 동안 유지되는 인메모리 캐시(서버리스 콜드스타트 시 재수집).
// 확정 결과는 kapt_cache(Supabase)에 영구 캐시 — 콜드스타트에도 국토부 재호출 없음.
const dirCache = new Map(); // lawdCd → Promise<[{ kaptCode, kaptName, as3 }]> (동시 미스 중복 방지)
const infoCache = new Map(); // kaptCode → { households, dongCnt, useDate, heat }

// 단지명 정규화: 공백 제거 + 끝의 "아파트" 제거(매칭 유연화).
function norm(s) {
  return (s || "").replace(/\s+/g, "").replace(/아파트$/, "");
}

// data.go.kr JSON은 응답마다 items가 배열 / {item:[...]} / 단일 객체로 섞임 → 배열로 정규화.
function asArray(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (Array.isArray(items.item)) return items.item;
  if (items.item) return [items.item];
  return [];
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Budongsan/0.1" },
    cache: "no-store",
  });
  const text = await res.text();
  try {
    return JSON.parse(text); // 미승인/오류(HTML·XML 에러문서)면 파싱 실패 → null
  } catch {
    return null;
  }
}

// 시군구 단지 목록 → [{kaptCode, kaptName, as3(읍면동)}].
// Promise를 캐시해 일괄 조회(getComplexInfoMany)의 동시 미스에도 목록 호출은 1회.
function fetchSigunguDir(lawdCd) {
  if (dirCache.has(lawdCd)) return dirCache.get(lawdCd);
  const p = (async () => {
    const key = process.env.DATA_GO_KR_KEY;
    if (!key) throw new Error("DATA_GO_KR_KEY 환경변수가 필요합니다.");
    const url =
      `${LIST_ENDPOINT}?serviceKey=${encodeURIComponent(key)}` +
      `&sigunguCode=${lawdCd}&pageNo=1&numOfRows=10000`;
    const json = await fetchJson(url);
    const list = asArray(json?.response?.body?.items).map((x) => ({
      kaptCode: x.kaptCode || "",
      kaptName: x.kaptName || "",
      as3: x.as3 || "",
    }));
    if (!list.length) dirCache.delete(lawdCd); // 미승인/오류(빈 응답)는 캐시 안 함 → 다음 호출이 재시도
    return list;
  })();
  p.catch(() => dirCache.delete(lawdCd));
  dirCache.set(lawdCd, p);
  return p;
}

// 실거래 단지(umdNm+aptNm) → kaptCode. 같은 읍면동 우선, 이름 정규화 후 정확→부분 매칭.
async function findKaptCode(lawdCd, umdNm, aptNm) {
  const list = await fetchSigunguDir(lawdCd);
  if (!list.length) return null;
  const a = norm(aptNm);
  const inDong = list.filter((x) => x.as3 === umdNm);
  const pool = inDong.length ? inDong : list;
  let hit = pool.find((x) => norm(x.kaptName) === a);
  if (!hit) hit = pool.find((x) => norm(x.kaptName).includes(a) || a.includes(norm(x.kaptName)));
  return hit ? hit.kaptCode : null;
}

// kaptCode → 세대수 등. 세대수 있을 때만 캐시.
async function fetchKaptInfo(kaptCode) {
  if (infoCache.has(kaptCode)) return infoCache.get(kaptCode);
  const key = process.env.DATA_GO_KR_KEY;
  const url = `${INFO_ENDPOINT}?serviceKey=${encodeURIComponent(key)}&kaptCode=${kaptCode}`;
  const json = await fetchJson(url);
  const it = json?.response?.body?.item || {};
  const info = {
    households: Number(it.kaptdaCnt) || null, // 총 세대수 (예: 131.0)
    dongCnt: Number(it.kaptDongCnt) || null, // 동수 (문자열 "2")
    useDate: it.kaptUsedate ? String(it.kaptUsedate) : null, // 사용승인일 YYYYMMDD
    heat: it.codeHeatNm || null, // 난방방식
  };
  if (info.households) infoCache.set(kaptCode, info);
  return info;
}

// 공개 진입점(일괄). items=[{umdNm, aptNm}] → 같은 순서의 결과 배열.
// geocodeMany 패턴: kapt_cache 1회 일괄 조회 → 미스만 국토부 동시 조회 → 성공분 일괄 upsert.
// 테이블 미생성/Supabase 미설정이면 캐시만 건너뛰고 동작(graceful).
// 매칭 실패는 캐시 안 함(신축의 공동주택 목록 등록 지연 대비 — 비용은 목록 호출 1회뿐).
export async function getComplexInfoMany(lawdCd, items) {
  const results = new Array(items.length).fill(null);

  let cached = new Map(); // "umd|apt" → info
  if (supabaseAdmin && items.length) {
    const { data } = await supabaseAdmin
      .from("kapt_cache")
      .select("umd_nm, apt_nm, kapt_code, households, dong_cnt, use_date, heat")
      .eq("lawd_cd", lawdCd)
      .in("apt_nm", [...new Set(items.map((x) => x.aptNm))]);
    for (const r of data || []) {
      cached.set(`${r.umd_nm}|${r.apt_nm}`, {
        kaptCode: r.kapt_code,
        households: r.households,
        dongCnt: r.dong_cnt,
        useDate: r.use_date,
        heat: r.heat,
      });
    }
  }

  const missIdx = [];
  items.forEach((it, i) => {
    const hit = cached.get(`${it.umdNm}|${it.aptNm}`);
    if (hit) results[i] = hit;
    else missIdx.push(i);
  });
  if (!missIdx.length) return results;

  await Promise.all(
    missIdx.map(async (i) => {
      try {
        const kaptCode = await findKaptCode(lawdCd, items[i].umdNm, items[i].aptNm);
        results[i] = kaptCode
          ? { kaptCode, ...(await fetchKaptInfo(kaptCode)) }
          : { kaptCode: null };
      } catch (e) {
        results[i] = { kaptCode: null, error: e.message };
      }
    })
  );

  if (supabaseAdmin) {
    const rows = missIdx
      .filter((i) => results[i].kaptCode && results[i].households)
      .map((i) => ({
        lawd_cd: lawdCd,
        umd_nm: items[i].umdNm,
        apt_nm: items[i].aptNm,
        kapt_code: results[i].kaptCode,
        households: Math.round(results[i].households),
        dong_cnt: results[i].dongCnt,
        use_date: results[i].useDate,
        heat: results[i].heat,
      }));
    if (rows.length) {
      const { error } = await supabaseAdmin.from("kapt_cache").upsert(rows); // 실패해도 결과엔 무해
      if (error) console.error("[kapt_cache] batch upsert:", error.message);
    }
  }
  return results;
}

// 공개 진입점(단건, 세부패널용). 매칭 실패/미승인이면 { kaptCode: null } 반환(에러 던지지 않음).
export async function getComplexInfo(lawdCd, umdNm, aptNm) {
  const [info] = await getComplexInfoMany(lawdCd, [{ umdNm, aptNm }]);
  return info;
}
