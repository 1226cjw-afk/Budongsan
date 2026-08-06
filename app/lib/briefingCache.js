// 브리핑 페이로드 캐시의 지문(fingerprint) — 순수 함수만 둔다(테스트 대상).
// 지문이 입력 전체를 덮으므로 별도의 캐시 무효화 로직이 필요 없다: ★ 변경이 곧
// 지문 변경이라 즉시 반영이 자동으로 따라온다.

import { createHash } from "node:crypto";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// ⚠️ KST 달력 날짜. Vercel은 UTC로 돌아 toISOString()을 그대로 쓰면 KST 00:00~08:59에
//    어제가 나온다 → 자정을 넘겨도 옛 30일 창·D-day를 재사용하게 된다.
//    marketSignal.ymd()·briefing cutoff·/api/subscription과 같은 계열의 보정.
export function kstDate(nowMs = Date.now()) {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// ⚠️ 지문에 넣는 favorites 필드는 **페이로드가 실제로 읽는 것과 같아야 한다**
//    (buildBriefingPayload가 쓰는 6개). lat/lng/created_at은 브리핑 출력에 안 쓰이므로
//    넣지 않는다 — 넣으면 무관한 변경으로 캐시가 헛되이 무효화된다.
//    반대로 payload가 새 필드를 읽기 시작하면 여기에도 반드시 추가할 것.
const SEP = ""; // 필드 구분자(unit separator)

const FAV_FIELDS = ["lawd_cd", "umd_nm", "apt_nm", "lease_end", "note", "note_date"];

// U+001F(unit separator) — 단지명·메모에 나올 리 없는 문자라 필드 경계가 안전하다.
function normalizeFav(f) {
  return FAV_FIELDS.map((k) => (f[k] == null ? "" : String(f[k]))).join(SEP);
}

export function buildFingerprint({ favs = [], latestFetched = null, kstDate: day = "" }) {
  // 조회 순서(created_at desc)는 행 추가로 뒤바뀌므로 정렬해 정규화한다.
  const rows = favs.map(normalizeFav).sort();
  const material = JSON.stringify([day, latestFetched || "", rows]);
  // sha1 16자면 충돌 확률이 무의미하게 낮고(개인용 단일 행) 로그로 보기 좋다.
  return createHash("sha1").update(material).digest("hex").slice(0, 16);
}
