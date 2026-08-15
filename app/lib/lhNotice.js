// LH 분양·임대 공고 수집 — 든든전세·행복주택·국민임대·매입/전세임대·신혼희망타운.
//
// ⚠️ **왜 별도 소스인가**: 청약홈(applyhome.js)에는 공공임대가 사실상 없다. 2026-08-15 실측으로
//    APT 공고 100건의 RENT_SECD_NM 분포가 "분양주택 99 / 분양전환 가능임대 1"이었다.
//    행복주택·든든전세는 청약홈이 아니라 LH청약플러스에 올라오므로 이 API가 유일한 정공법이다.
//    (SH·GH는 2026-08-15 조사 결과 모집공고 오픈API가 **없다** — SH는 관리현황 정적파일뿐,
//     GH는 "GH주택청약 모집정보"가 있으나 갱신주기가 연간이라 임박순 레이더에 못 쓴다.
//     그래서 두 기관은 수집하지 않고 카드에서 공고 게시판으로 링크만 건다.)
//
// ⚠️ **활용신청이 별도로 필요하다**(data.go.kr 15058530, 자동승인). 청약홈 키와 같은
//    DATA_GO_KR_KEY를 쓰지만 서비스별 승인이라, 미승인 상태에선 403
//    SERVICE_KEY_IS_NOT_REGISTERED_ERROR가 온다(2026-08-15 실측). kapt/applyhome과 같은
//    graceful 방침 — 실패하면 []를 돌려주고 카드에서 LH 줄만 빠진다.
//
// ✅ **필드명은 2026-08-15 승인 직후 실응답으로 검증됐다.** 응답 모양은
//    `[{dsSch:[…]}, {dsList:[…]}]`이고, 한 행의 키는 다음이 전부다:
//      PAN_ID · PAN_NM · PAN_SS · PAN_NT_ST_DT · PAN_DT · CLSG_DT · CNP_CD_NM ·
//      AIS_TP_CD · AIS_TP_CD_NM · UPP_AIS_TP_CD · UPP_AIS_TP_NM · SPL_INF_TP_CD ·
//      CCR_CNNT_SYS_DS_CD · DTL_URL · DTL_URL_MOB · ALL_CNT · RNUM
//    ⚠️ **주소·세대수·당첨자발표일은 이 API에 아예 없다**(청약홈엔 있어서 헷갈리기 쉽다).
//    그래서 수도권 판정은 주소가 아니라 `CNP_CD_NM`("경기도"/"서울특별시"/"인천광역시")으로 한다.
//    ⚠️ 날짜는 "2026.08.14" 점 구분이다 — toYmd가 숫자만 남겨 정규화한다.

const BASE = "https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1";

// 공고유형코드(UPP_AIS_TP_CD). 2026-08-15 승인 직후 전량 실측한 분포:
//   06 임대주택(243) = 행복주택 92 · 국민임대 78 · 영구임대 48 · 공공임대 18 · 통합공공임대 5 · 6년공공임대 2
//   13 주거복지(124) = 매입임대 121 · 집주인임대 3
//   05 분양주택(24)  ·  39 신혼희망타운(25) = 행복주택(신혼희망) 13 · 공공분양(신혼희망) 12
//   01 토지(199) · 22 임대상가(89) → 주택이 아니라 이 앱의 범위 밖. 넣지 말 것.
// ⚠️ **든든전세는 06이 아니라 13에 있다**(매입임대로 분류). 06만 보면 통째로 놓친다 —
//    실측 14건이 전부 13에서 나왔다("26년 2차 부산 분양전환형 든든전세 입주자 모집 공고" 등).
//    이름만 보고 "임대주택 = 06"이라 짐작했다가 틀린 자리다.
const NOTICE_TYPES = [
  { code: "06", label: "임대" },
  { code: "13", label: "임대" }, // 매입임대 — 든든전세가 여기 있다
  { code: "05", label: "분양" },
  { code: "39", label: "신혼희망타운" },
];

const CAPITAL = ["서울", "경기", "인천"];

// 공고 게시일 조회 창. 접수는 공고 후 몇 주 안에 열리므로 최근 90일이면 진행 중·예정 건을 덮는다.
const LOOKBACK_DAYS = 90;
const LOOKAHEAD_DAYS = 180;
// ⚠️ 100이면 잘린다 — 이 창에서 06 유형만 **243건**이다(2026-08-15 실측). PG_SZ=300부터
//    전량이 한 번에 오고 1000도 정상 동작한다. 청약홈처럼 "page 1이면 충분"이 아니라,
//    여기선 크게 잡아 페이징 자체를 없애는 쪽이 맞다(유형 4종 × 요청 1회로 끝난다).
//    ⚠️ 응답 첫 행의 ALL_CNT가 전체 건수다 — 받은 건수와 어긋나면 이 값부터 올릴 것.
const PAGE_SIZE = 1000;

// 이미 끝난 공고는 담지 않는다(조회가 receipt_end >= 오늘로 거르지만, 마감일이 결측인 행이
// 섞여 들어오면 영영 안 빠진다 → 상태값으로 한 번 더 거른다).
// ⚠️ "정정공고중"은 진행 중이다 — includes("마감")에 걸리지 않으니 그대로 통과한다.
const CLOSED_STATES = ["접수마감", "마감", "종료"];

// ⚠️ 이 API는 **입주자 모집과 사업자 공모를 한 목록에 섞어 준다**. 구분해 주는 필드가 없어
//    공고명으로 거를 수밖에 없다. 2026-08-15 실측: "2026년 하반기 매입임대 공동생활가정
//    운영기관 모집공고"(매입임대)가 마감 임박순 **1위**로 올라와 6칸 카드의 맨 윗줄을 먹었다.
//    집을 찾는 사람에게 운영기관 공모를 첫 줄로 보여주는 건 명백한 오배치다.
//    ⚠️ 이름 규칙은 본질적으로 취약하니 **좁게** 유지할 것 — 넓히면 진짜 공고까지 삼킨다.
const NOT_FOR_TENANTS = /운영기관|운영업체|사업자\s*공모/;

// ⚠️ **정정공고와 원공고가 둘 다 살아서 온다.** 2026-08-15 실측: "남양주 장현5 2BL 행복주택
//    예비입주자 입주자격완화 모집"이 `[정정공고]` 붙은 것과 안 붙은 것 두 줄로 왔고,
//    구리·남양주도 마찬가지라 **표시 후보 10줄 중 4줄이 중복**이었다(6칸 카드에 치명적).
//    응답이 게시일 최신순이라 정정본이 먼저 온다 → **먼저 온 것을 남기면** 정정본이 살아남는다.
//    표시 이름에서 `[정정공고]`를 떼지는 않는다 — 조건이 바뀐 공고라는 정보 자체는 유효하다.
const dedupeKey = (r) => `${r.name.replace(/^\s*\[[^\]]*\]\s*/, "")}|${r.receiptEnd}`;

export function dropRevisedDuplicates(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    const k = dedupeKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const ymdCompact = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

// 후보 키를 순서대로 훑어 첫 유효값. 위 ⚠️ 참조 — 실응답 미검증이라 이 형태가 필요하다.
function pick(row, ...keys) {
  for (const k of keys) {
    const v = row?.[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

// "20260815" / "2026-08-15" / "2026.08.15" → "2026-08-15". 그 외는 null.
function toYmd(v) {
  if (!v) return null;
  const digits = String(v).replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function isCapitalRegion(region) {
  return CAPITAL.some((r) => (region || "").includes(r));
}

// LH 계열 API는 [{resHeader}, {dsList:[...]}] 꼴로 감싸 주는 경우가 흔하고, 표준
// {response:{body:{items:[...]}}} 꼴도 섞인다. 어느 쪽이든 행 배열을 끄집어낸다.
// ⚠️ export인 이유는 테스트 때문이다 — 실응답을 못 본 파서라 모양별 회귀 가드가 특히 중요하다.
export function extractRows(json) {
  if (Array.isArray(json)) {
    for (const part of json) {
      const rows = part?.dsList ?? part?.dsSbdSt ?? part?.items;
      if (Array.isArray(rows)) return rows;
    }
    // 배열 안이 곧 행일 수도 있다(객체이면서 dsList가 없을 때).
    if (json.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
      const flat = json.filter((x) => !x.resHeader && !x.RS_CODE);
      if (flat.length && (flat[0].PAN_NM || flat[0].PAN_ID)) return flat;
    }
    return [];
  }
  const body = json?.response?.body ?? json?.body;
  const items = body?.items?.item ?? body?.items ?? json?.dsList;
  if (Array.isArray(items)) return items;
  if (items && typeof items === "object") return [items];
  return [];
}

async function fetchType({ code, label }, key) {
  const today = new Date();
  const params = new URLSearchParams({
    serviceKey: key,
    PG_SZ: String(PAGE_SIZE),
    PAGE: "1",
    PAN_NT_ST_DT: ymdCompact(new Date(today.getTime() - LOOKBACK_DAYS * 86400000)),
    CLSG_DT: ymdCompact(new Date(today.getTime() + LOOKAHEAD_DAYS * 86400000)),
    UPP_AIS_TP_CD: code,
  });
  const r = await fetch(`${BASE}?${params}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`LH ${label} HTTP ${r.status}`);
  const text = await r.text();
  // 미승인·쿼터초과는 200에 XML 에러 본문으로 오는 경우도 있다 → JSON 파싱 실패를 에러로.
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`LH ${label} 응답이 JSON이 아님: ${text.slice(0, 120)}`);
  }
  const errMsg = json?.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg;
  if (errMsg) throw new Error(`LH ${label} ${errMsg}`);
  return extractRows(json).map((row) => ({ row, label }));
}

// ⚠️ export인 이유는 위 extractRows와 같다(실응답 미검증 → 테스트로 모양을 고정).
export function normalizeLhRow({ row, label }) {
  const name = pick(row, "PAN_NM");
  const id = pick(row, "PAN_ID");
  if (!name || !id) return null;

  const region = pick(row, "CNP_CD_NM") || "";
  const state = pick(row, "PAN_SS") || "";

  return {
    // ⚠️ 청약홈 주택관리번호와 한 테이블(PK)을 쓰므로 **접두사로 네임스페이스를 나눈다**.
    //    번호 체계가 서로 무관해서 언젠가 반드시 충돌한다.
    houseManageNo: `LH:${id}`,
    agency: "LH",
    name,
    region,
    address: "", // 이 API는 주소를 주지 않는다(위 ✅ 참조)
    // 임대/분양 중 어느 쪽인지(카드 구분용). 세부 유형은 AIS_TP_CD_NM —
    // 실측값: 행복주택 · 국민임대 · 영구임대 · 공공임대 · 통합공공임대 · 매입임대 ·
    //         집주인임대 · 분양주택 · 행복주택(신혼희망) · 공공분양(신혼희망) · 6년 공공임대주택
    kind: label,
    detailKind: pick(row, "AIS_TP_CD_NM") || label,
    // ⚠️ **접수 시작일이 없다.** PAN_NT_ST_DT는 접수일이 아니라 **공고게시일**이라, 여기에
    //    넣으면 카드가 "접수 08-14~08-25"처럼 없는 사실을 찍는다 → null로 두고 카드는
    //    마감(D-day)만 보여준다. 청약홈은 접수기간을 주므로 그쪽만 "접수 …~…"가 뜬다.
    receiptStart: null,
    // ⚠️ CLSG_DT(공고마감일)를 접수 마감으로 쓴다 — 이 API는 별도 접수기간 필드를 주지 않는다.
    receiptEnd: toYmd(pick(row, "CLSG_DT")),
    spReceiptStart: null,
    spReceiptEnd: null,
    winnerDate: null, // 이 API는 당첨자발표일을 주지 않는다
    households: null, // 이 API는 세대수를 주지 않는다
    url: detailUrl(row),
    state,
    models: null,
    priceMin: null,
    priceMax: null,
  };
}

// DTL_URL은 실측상 절대 URL로 오지만(apply.lh.or.kr/…selectWrtancInfo.do?panId=…),
// 상대경로로 바뀌어도 깨지지 않게 보정한다. 없으면 공고 목록 페이지로.
function detailUrl(row) {
  const raw = pick(row, "DTL_URL");
  if (!raw) return "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do";
  if (/^https?:\/\//.test(raw)) return raw;
  return `https://apply.lh.or.kr${raw.startsWith("/") ? "" : "/"}${raw}`;
}

// 수도권 LH 공고 목록. 반환 {items, error, sampleKeys}.
// ⚠️ error/sampleKeys는 진단용이다 — 실응답 필드명을 못 봤으므로(위 ⚠️) 승인 후 첫 cron이
//    이걸 실어 보내야 키가 맞는지 확인할 수 있다. 지우지 말 것.
export async function fetchLhNotices() {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) return { items: [], error: "DATA_GO_KR_KEY 없음", sampleKeys: null };

  const settled = await Promise.allSettled(NOTICE_TYPES.map((t) => fetchType(t, key)));
  const raw = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  const errors = settled.filter((s) => s.status === "rejected").map((s) => s.reason?.message);

  // 전부 실패면 에러를 올려 보낸다(부분 실패는 살린 것만 쓴다 — fetchRawMonths와 같은 방침).
  if (!raw.length) {
    return {
      items: [],
      error: errors[0] || "LH 공고 0건",
      sampleKeys: null,
    };
  }

  const sampleKeys = Object.keys(raw[0].row || {});
  const items = dropRevisedDuplicates(raw
    .map(normalizeLhRow)
    .filter(Boolean)
    // 수도권 판정은 CNP_CD_NM 하나로 한다 — 주소 필드가 아예 없다(위 ✅ 참조).
    .filter((r) => isCapitalRegion(r.region))
    .filter((r) => !CLOSED_STATES.some((s) => r.state.includes(s)))
    .filter((r) => !NOT_FOR_TENANTS.test(r.name)));

  return { items, error: errors.length ? errors.join(" / ") : null, sampleKeys };
}
