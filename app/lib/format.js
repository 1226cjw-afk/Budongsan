// 표시용 포맷터·날짜 헬퍼 (클라이언트 공용, 의존성 없음).

// ⚠️ **KST 달력 날짜의 단일 지점.** Vercel 함수는 UTC로 돌기 때문에 toISOString()을 그대로
//    쓰면 KST 00:00~08:59(= UTC 전날 15:00~23:59) 구간에 어제 날짜가 나온다. 이 앱의 cron은
//    06:00·06:30 KST라 **매일 이 구간에서 돈다** — 그래서 "오늘"을 UTC로 세면 매일 틀린다.
//    이 프로젝트에서 같은 버그가 네 번 재발했다(marketSignal 창 / briefing cutoff·D-day /
//    /api/subscription 마감 판정 / 지도 보유주택 스냅샷 날짜). 넷이 각자 오프셋을 더하고
//    있었기에 하나를 고쳐도 나머지가 남았다 → 2026-08-14에 여기로 모았다.
//    ⚠️ **날짜 비교·표시는 전부 이 함수를 거칠 것.** 새로 `+ 9*60*60*1000`을 적고 있다면
//       그건 다섯 번째 재발이다. 의존성이 없는 이 파일에 둔 이유는 서버(라우트·집계)와
//       클라(지도) 양쪽이 같은 함수를 써야 두 화면의 날짜가 어긋나지 않기 때문이다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 주어진 시각(기본 지금)의 KST 달력 날짜 "YYYY-MM-DD".
export function kstDate(nowMs = Date.now()) {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// D-day 계산(양수 = 남음). ymd "YYYY-MM-DD".
export function daysUntil(ymd) {
  return Math.ceil((new Date(ymd + "T00:00:00") - Date.now()) / 86400000);
}

// 두 "YYYY-MM-DD" 사이의 달력 일수. ⚠️ 서버는 UTC로 돌기 때문에 new Date(ymd)로 파싱하면
// 기준일이 런타임 타임존에 끌려간다 — 문자열을 직접 쪼개 UTC로 고정해 타임존을 배제한다.
// (브라우저 전용인 daysUntil과 달리, 이건 서버가 KST 날짜를 받아 세는 용도다.)
export function daysBetweenYmd(fromYmd, toYmd) {
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const a = parse(fromYmd);
  const b = parse(toYmd);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86400000);
}

// "YYYY-MM-DD"에 n년을 더한 달력 날짜. 양도세 비과세(보유 2년) 같은 "n년 뒤" 계산용.
// ⚠️ Date 객체로 더하면 안 된다 — 두 가지가 동시에 틀어진다:
//    ① new Date("2026-08-30")은 **UTC 자정**이라 setFullYear가 런타임 타임존에 끌려간다.
//    ② 2/29에 2년을 더하면 그 해엔 2/29가 없어 3/1로 조용히 넘어간다(말일 클램프가 맞다).
//    문자열로 더하고 말일을 클램프해 타임존과 무관하게 만든다. 결과를 daysUntil에 넘기면
//    D-day도 로컬 자정 기준으로 일관된다(kstDate 계열과 같은 원칙 — 날짜는 문자열로 다룬다).
export function addYearsYmd(ymd, years) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!m) return null;
  const y = +m[1] + years;
  const mo = +m[2];
  if (mo < 1 || mo > 12) return null;
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // 그 해 그 달의 말일
  const d = Math.min(+m[3], lastDay);
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// 임대차 만기 라벨. 갱신청구 가능기간 = 만기 6~2개월 전(주택임대차보호법 §6의3, 2020-07-31 시행,
// 6개월~2개월 구간은 2020-12-10 이후 계약 기준. 확인일 2026-07-05).
export function leaseLabel(leaseEnd) {
  const dd = daysUntil(leaseEnd);
  const end = new Date(leaseEnd + "T00:00:00");
  const winA = new Date(end); winA.setMonth(winA.getMonth() - 6);
  const winB = new Date(end); winB.setMonth(winB.getMonth() - 2);
  const now = new Date();
  let s = dd >= 0 ? `만기 D-${dd}` : `만기 ${-dd}일 지남`;
  if (now >= winA && now <= winB) s += " · ⚠️ 갱신청구 가능기간";
  return s;
}

// 만원 → "N억 M,MMM" 표기.
export function formatManwon(manwon) {
  const v = Math.round(manwon);
  const eok = Math.floor(v / 10000);
  const rest = v % 10000;
  if (eok && rest) return `${eok}억 ${rest.toLocaleString()}`;
  if (eok) return `${eok}억`;
  return rest.toLocaleString();
}

// "YYYY-MM-DD" → "YY.MM.DD".
export function shortDate(ymd) {
  return ymd ? ymd.slice(2).replace(/-/g, ".") : "";
}

// 갱신 시각(ISO) → "방금 / N분 전 / N시간 전 / N일 전".
export function formatAgo(iso) {
  if (!iso) return null;
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "방금";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

// 개월 수 → 사람이 읽는 기간. 10년을 넘으면 숫자가 무의미해 뭉뚱그린다.
export function monthsToLabel(months) {
  if (!Number.isFinite(months) || months <= 0) return null;
  const m = Math.ceil(months);
  if (m > 120) return "10년 이상";
  if (m < 12) return `약 ${m}개월`;
  const y = Math.floor(m / 12);
  const rest = m % 12;
  return rest ? `약 ${y}년 ${rest}개월` : `약 ${y}년`;
}
