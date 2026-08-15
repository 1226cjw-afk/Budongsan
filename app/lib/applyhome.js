// 청약홈 분양정보 수집 — 참조 사이트(koreamonitor)의 "청약 레이더"를 우리 수도권 범위로.
//
// ⚠️ 이 API는 data.go.kr 서비스별 **활용신청**이 필요하다(2026-08-03 승인 완료).
//    미승인이면 401 {"code":-4,"msg":"등록되지 않은 인증키 입니다."}가 온다.
//    kapt.js와 같은 graceful 방침: 실패하면 빈 배열을 돌려주고 카드를 숨긴다 —
//    쿼터 초과·장애로 청약이 죽어도 브리핑의 나머지는 그대로 떠야 한다.
// ⚠️ 실거래가 API(XML 전용·http만)와 달리 이 계열은 **https + JSON**이다.

import { kstDate } from "./format.js";
import { lawdCdFromAddress } from "./regions.js";

const BASE = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1";
// ⚠️ page=1의 100건이면 충분하다 — 응답이 **공고일 최신순**이라 page 1이 최근 공고다
//    (2026-08-04 실측: APT는 공고일 2026-07-31~04-29, 무순위는 07-31~05-13이 한 페이지에
//    들어온다). 접수는 공고 후 몇 주 안에 열리므로 이 범위면 진행 중·예정 건을 다 덮는다.
//    ⚠️ 정렬이 오래된 순으로 바뀌면 page 1이 2015년 공고가 되어 카드가 통째로 빈다 —
//    수확량이 0이 되면 이 가정부터 의심할 것.
const PER_PAGE = 100;
const CAPITAL = ["서울", "경기", "인천"];

// 앱 전체가 수도권 범위다(regions.js 서울25+경기, news의 isCapitalAreaNews와 같은 정신).
export function isCapitalRegion(region) {
  return CAPITAL.some((r) => (region || "").includes(r));
}

async function fetchOne(path, extraQuery = "") {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) return [];
  const url = `${BASE}/${path}?page=1&perPage=${PER_PAGE}${extraQuery}&serviceKey=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return []; // 401(미승인) 포함 — 조용히 생략
    const j = await r.json();
    return Array.isArray(j?.data) ? j.data : [];
  } catch {
    return [];
  }
}

const pickDate = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

// ⚠️ 필드명은 2026-08-04 실제 응답에서 확인한 것(APT 2,836건 / 무순위 1,647건).
//    키는 전부 대문자 스네이크. 추측하지 말 것 — 아래 접수일 차이가 특히 함정이다.
function normalize(row, kind) {
  const name = row.HOUSE_NM;
  const no = row.HOUSE_MANAGE_NO;
  if (!name || !no) return null;
  return {
    houseManageNo: String(no),
    name,
    region: row.SUBSCRPT_AREA_CODE_NM || "",
    address: row.HSSPLY_ADRES || "",
    kind,
    // ⚠️ 접수일 필드명이 두 엔드포인트에서 **다르다**(2026-08-04 실측 확인):
    //    APT 분양 = RCEPT_BGNDE/RCEPT_ENDDE
    //    무순위    = SUBSCRPT_RCEPT_BGNDE/SUBSCRPT_RCEPT_ENDDE
    //              (RCEPT_BGNDE 키 자체가 없고, GNRL_RCEPT_BGNDE는 있지만 값이 null)
    //    한쪽만 읽으면 무순위 접수일이 전부 null이 되어 "접수 임박순" 정렬이 무너진다.
    receiptStart: pickDate(row.RCEPT_BGNDE || row.SUBSCRPT_RCEPT_BGNDE || row.GNRL_RCEPT_BGNDE),
    receiptEnd: pickDate(row.RCEPT_ENDDE || row.SUBSCRPT_RCEPT_ENDDE || row.GNRL_RCEPT_ENDDE),
    // 특별공급은 일반공급보다 **먼저 마감**한다(2026-08-15 실측: 쌍용 더 플래티넘 서대문 —
    // 일반 08-24~08-27인데 특공은 08-24 하루). 생애최초·신혼 대상이면 이쪽이 실질 마감이라
    // 일반공급 날짜만 보여주면 사흘을 더 있는 줄 안다. 100건 중 86건이 이 필드를 갖고 있다.
    spReceiptStart: pickDate(row.SPSPLY_RCEPT_BGNDE),
    spReceiptEnd: pickDate(row.SPSPLY_RCEPT_ENDDE),
    winnerDate: pickDate(row.PRZWNER_PRESNATN_DE),
    households: Number(row.TOT_SUPLY_HSHLDCO) || null,
    url: row.PBLANC_URL || null,
    agency: "청약홈",
    // 민영/국민(APT) · 오피스텔 등(그 외). 카드에서 LH 세부유형과 같은 자리에 쓴다.
    detailKind: row.HOUSE_DTL_SECD_NM || row.HOUSE_SECD_NM || kind,
    // 규제지역 판정(loanPolicy.isRegulated)에 필요 — 공고는 시군구 코드를 주지 않는다.
    lawdCd: lawdCdFromAddress(row.HSSPLY_ADRES),
    models: null,
    priceMin: null,
    priceMax: null,
  };
}

// 평형별 공급정보(분양가·공급면적·세대수). 공고번호로 좁혀 받는다.
// ⚠️ 이 엔드포인트는 전체 14,570행(2026-08-15)이라 통째로 받으면 안 된다 —
//    cond[HOUSE_MANAGE_NO::EQ]로 공고 단위 조회가 되는 것을 실측으로 확인했다.
// ⚠️ 응답의 totalCount는 필터를 반영하지 않고 전체(14,570)를 그대로 준다. 수확량 판정은
//    data.length로 할 것(totalCount를 믿으면 페이징을 잘못 돈다).
async function fetchModels(houseManageNo) {
  const cond = `&${encodeURIComponent("cond[HOUSE_MANAGE_NO::EQ]")}=${encodeURIComponent(houseManageNo)}`;
  const rows = await fetchOne("getAPTLttotPblancMdl", cond);
  return rows
    .map((m) => ({
      // HOUSE_TY "084.9458A" → 전용 84.9458 (뒤 알파벳은 타입 구분). 농특세 판정에 쓰인다.
      houseTy: m.HOUSE_TY || null,
      exclusiveAr: Number.parseFloat(m.HOUSE_TY) || null,
      supplyAr: Number(m.SUPLY_AR) || null,
      price: Number(m.LTTOT_TOP_AMOUNT) || null, // 만원
      general: Number(m.SUPLY_HSHLDCO) || 0,
      special: Number(m.SPSPLY_HSHLDCO) || 0,
    }))
    .filter((m) => m.price && m.exclusiveAr);
}

// 수도권 분양·무순위 목록. 실패하면 [] — 호출부는 카드를 숨긴다.
export async function fetchSubscriptions() {
  const [apt, remndr] = await Promise.all([
    fetchOne("getAPTLttotPblancDetail"),
    fetchOne("getRemndrLttotPblancDetail"),
  ]);
  const rows = [
    ...apt.map((r) => normalize(r, "APT")),
    ...remndr.map((r) => normalize(r, "무순위")),
  ].filter(Boolean);
  const capital = rows.filter((r) => isCapitalRegion(r.region));

  // 분양가는 **아직 접수가 안 끝난 공고에만** 붙인다. 공고 하나당 요청 1회라 전량에 붙이면
  // 수도권 57건이 매일 도는데, 지난 공고의 분양가는 화면에 뜨지도 않는다(조회가
  // receipt_end >= 오늘로 거른다). 실제 대상은 하루 수 건 수준이다.
  const today = kstDate();
  const open = capital.filter((r) => r.receiptEnd && r.receiptEnd >= today);
  const fetched = await Promise.allSettled(open.map((r) => fetchModels(r.houseManageNo)));
  open.forEach((r, i) => {
    const res = fetched[i];
    if (res.status !== "fulfilled" || !res.value.length) return; // 실패는 분양가만 생략
    const prices = res.value.map((m) => m.price);
    r.models = res.value;
    r.priceMin = Math.min(...prices);
    r.priceMax = Math.max(...prices);
  });

  return capital;
}
