// 국토부 공동주택 단지 정보(세대수 등) 조회. 실거래가 API엔 세대수가 없어 별도 보강.
//
// ⚠️ data.go.kr에서 아래 2개 API **활용신청** 필요(승인 후 동작). **2026-06-25 승인 확인**.
//   - 공동주택 단지 목록제공 서비스 (AptListService3/getSigunguAptList3)     → kaptCode 찾기
//   - 공동주택 기본 정보제공 서비스 (AptBasisInfoServiceV4/getAphusBassInfoV4) → 세대수/동수/사용승인일
// ⚠️ 이 계열은 실거래가 API와 달리 **응답이 JSON**(content-type application/json).
//   `_type=xml`을 줘도 JSON으로 옴 → **JSON으로 파싱**. http/User-Agent quirk·키(DATA_GO_KR_KEY)는 공용.
//   미승인/오류 시 JSON 파싱 실패(null) → graceful: { kaptCode: null }.

const LIST_ENDPOINT = "http://apis.data.go.kr/1613000/AptListService3/getSigunguAptList3";
const INFO_ENDPOINT = "http://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4";

// 서버 프로세스 수명 동안 유지되는 인메모리 캐시(서버리스 콜드스타트 시 재수집).
const dirCache = new Map(); // lawdCd → [{ kaptCode, kaptName, as3 }]
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
    headers: { "User-Agent": "RealEstate_Map/0.1" },
    cache: "no-store",
  });
  const text = await res.text();
  try {
    return JSON.parse(text); // 미승인/오류(HTML·XML 에러문서)면 파싱 실패 → null
  } catch {
    return null;
  }
}

// 시군구 단지 목록 → [{kaptCode, kaptName, as3(읍면동)}]. 결과 있을 때만 캐시.
async function fetchSigunguDir(lawdCd) {
  if (dirCache.has(lawdCd)) return dirCache.get(lawdCd);
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
  if (list.length) dirCache.set(lawdCd, list); // 미승인/오류(빈 응답)는 캐시 안 함
  return list;
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

// 공개 진입점. 매칭 실패/미승인이면 { kaptCode: null } 반환(에러 던지지 않음).
export async function getComplexInfo(lawdCd, umdNm, aptNm) {
  try {
    const kaptCode = await findKaptCode(lawdCd, umdNm, aptNm);
    if (!kaptCode) return { kaptCode: null };
    const info = await fetchKaptInfo(kaptCode);
    return { kaptCode, ...info };
  } catch (e) {
    return { kaptCode: null, error: e.message };
  }
}
