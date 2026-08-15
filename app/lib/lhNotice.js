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
// ⚠️ **응답 필드명은 포털 문서 기준이고 실응답으로 검증되지 않았다**(미승인이라 못 봤다).
//    그래서 아래 pick()이 후보 키를 순회하는 형태다. 승인 후 첫 cron 응답의
//    `lh.sampleKeys`(/api/cron/news가 실어 보낸다)로 실제 키를 확인하고, 어긋나면
//    후보 목록을 실제 이름으로 좁힐 것. 수확량이 0인데 error도 없으면 여기부터 의심.

const BASE = "https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1";

// 공고유형코드(UPP_AIS_TP_CD). 06 임대주택이 이 기능의 본체다 —
// 행복주택·국민임대·영구임대·매입임대·전세임대·든든전세가 전부 여기 들어온다.
const NOTICE_TYPES = [
  { code: "06", label: "임대" },
  { code: "05", label: "분양" },
  { code: "39", label: "신혼희망타운" },
];

const CAPITAL = ["서울", "경기", "인천"];

// 공고 게시일 조회 창. 접수는 공고 후 몇 주 안에 열리므로 최근 90일이면 진행 중·예정 건을 덮는다.
const LOOKBACK_DAYS = 90;
const LOOKAHEAD_DAYS = 180;
const PAGE_SIZE = 100;

// 이미 끝난 공고는 담지 않는다(조회가 receipt_end >= 오늘로 거르지만, 마감일이 결측인 행이
// 섞여 들어오면 영영 안 빠진다 → 상태값으로 한 번 더 거른다).
const CLOSED_STATES = ["접수마감", "마감", "종료"];

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
  const name = pick(row, "PAN_NM", "PAN_NM_NM", "SBD_NM");
  const id = pick(row, "PAN_ID", "PAN_NO", "PAN_SQ", "AIS_TP_CD_NM_ID");
  if (!name || !id) return null;

  const region = pick(row, "CNP_CD_NM", "CNP_NM", "AREA_NM") || "";
  const state = pick(row, "PAN_SS", "PAN_SS_NM") || "";

  return {
    // ⚠️ 청약홈 주택관리번호와 한 테이블(PK)을 쓰므로 **접두사로 네임스페이스를 나눈다**.
    //    번호 체계가 서로 무관해서 언젠가 반드시 충돌한다.
    houseManageNo: `LH:${id}`,
    agency: "LH",
    name,
    region,
    address: pick(row, "LGDONG_NM", "ADRES", "HSSPLY_ADRES") || "",
    // 임대/분양 중 어느 쪽인지(카드 구분용). 세부 유형(행복주택·든든전세 등)은 AIS_TP_CD_NM.
    kind: label,
    detailKind: pick(row, "AIS_TP_CD_NM", "UPP_AIS_TP_NM") || label,
    receiptStart: toYmd(pick(row, "RCRIT_PBLANC_DE", "PAN_NT_ST_DT", "PAN_DT")),
    // ⚠️ CLSG_DT(공고마감일)를 접수 마감으로 쓴다 — 이 API는 별도 접수기간 필드를 주지 않는다.
    receiptEnd: toYmd(pick(row, "CLSG_DT", "RCEPT_ENDDE", "PAN_ED_DT")),
    spReceiptStart: null,
    spReceiptEnd: null,
    winnerDate: toYmd(pick(row, "PRZWNER_PRESNATN_DE", "WNR_ANC_DT")),
    households: Number(pick(row, "SUM_HSH_CNT", "TOT_SUPLY_HSHLDCO")) || null,
    url: detailUrl(row),
    state,
    models: null,
    priceMin: null,
    priceMax: null,
  };
}

// DTL_URL은 상대경로로 오는 경우가 있다 → LH청약플러스 절대 URL로. 없으면 목록 페이지.
function detailUrl(row) {
  const raw = pick(row, "DTL_URL", "PAN_DTL_URL");
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
  const items = raw
    .map(normalizeLhRow)
    .filter(Boolean)
    .filter((r) => isCapitalRegion(r.region) || isCapitalRegion(r.address))
    .filter((r) => !CLOSED_STATES.some((s) => r.state.includes(s)));

  return { items, error: errors.length ? errors.join(" / ") : null, sampleKeys };
}
