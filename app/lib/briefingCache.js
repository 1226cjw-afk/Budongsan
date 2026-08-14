// 브리핑 페이로드 캐시의 지문(fingerprint) — 순수 함수만 둔다(테스트 대상).
// 지문이 입력 전체를 덮으므로 별도의 캐시 무효화 로직이 필요 없다: ★ 변경이 곧
// 지문 변경이라 즉시 반영이 자동으로 따라온다.
//
// ⚠️ KST 날짜는 lib/format.js의 kstDate() 하나만 쓴다 — 예전엔 이 파일이 자체 오프셋을
//    들고 있었다(marketSignal·briefing·/api/subscription도 각자 하나씩, 총 4벌).

import { createHash } from "node:crypto";

// ⚠️ **payload 모양이 바뀌면 이 값을 올릴 것.** 지문 재료는 "입력"(★·수집시각·날짜)뿐이라
//    코드 변경은 지문을 바꾸지 못한다 → buildBriefingPayload를 고쳐 배포해도 저장된 옛
//    payload가 그대로 나가고, KST 날짜가 넘어가는 다음날 06:00 cron까지 최대 하루를 기다려야
//    한다. 그 사이 "배포했는데 화면이 그대로"라 배포 실패로 오진하기 딱 좋다(캐시 도입
//    2026-08-07 ~ 2026-08-14 사이 이 탈출구가 아예 없었다).
//    올리면 전 사용자가 다음 요청 한 번만 라이브 계산(1.9~2.6s)하고 다시 캐시에 앉는다.
const PAYLOAD_VERSION = 1;

// ⚠️ 지문에 넣는 favorites 필드는 **페이로드가 실제로 읽는 것과 같아야 한다**
//    (buildBriefingPayload가 쓰는 6개). lat/lng/created_at은 브리핑 출력에 안 쓰이므로
//    넣지 않는다 — 넣으면 무관한 변경으로 캐시가 헛되이 무효화된다.
//    반대로 payload가 새 필드를 읽기 시작하면 여기에도 반드시 추가할 것.
const SEP = "\u001f"; // 필드 구분자(unit separator)

const FAV_FIELDS = ["lawd_cd", "umd_nm", "apt_nm", "lease_end", "note", "note_date"];

// U+001F(unit separator) — 단지명·메모에 나올 리 없는 문자라 필드 경계가 안전하다.
function normalizeFav(f) {
  return FAV_FIELDS.map((k) => (f[k] == null ? "" : String(f[k]))).join(SEP);
}

export function buildFingerprint({ favs = [], latestFetched = null, kstDate: day = "" }) {
  // 조회 순서(created_at desc)는 행 추가로 뒤바뀌므로 정렬해 정규화한다.
  const rows = favs.map(normalizeFav).sort();
  const material = JSON.stringify([PAYLOAD_VERSION, day, latestFetched || "", rows]);
  // sha1 16자면 충돌 확률이 무의미하게 낮고(개인용 단일 행) 로그로 보기 좋다.
  return createHash("sha1").update(material).digest("hex").slice(0, 16);
}
