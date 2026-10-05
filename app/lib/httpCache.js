// 공용 API 응답의 CDN(Vercel 엣지) 캐시 헤더.
//
// 왜(2026-10-05 prod 실측): 응답 헤더가 `X-Vercel-Id: icn1::iad1` — 서울 엣지로 들어와 **미국 동부
// 함수**까지 가고, Supabase도 미국 쪽이다(한국에서 직접 조회 530ms). 그래서 단순 조회도 0.5~2.2s였다
// (favorites 0.5 · trades 0.7~1.8 · hot 1.2~2.2 · news 0.9~1.4). 함수 리전을 서울로 옮기면 DB가 멀어져
// 오히려 느려진다 → 모두에게 같은 응답을 엣지(서울 POP)에 잠깐 붙잡아 두는 쪽이 맞다.
//
// ⚠️ 데이터는 하루 한 번(cron 06:00·06:30 KST, Hobby라 그 시각 ±59분) 바뀐다. 그래서 TTL을 길게 잡지 않고
//    **신선 10분 + 낡은 것 1시간 동안 즉시 응답하며 뒤에서 갱신**(SWR)으로 둔다 — 최악이 "한 번 1시간 낡은
//    응답, 다음 번엔 새것"이다. 하루를 통째로 잡으면 아침 브리핑이 어제 것으로 굳는다.
// ⚠️ 사용자별·즐겨찾기 의존 응답(favorites·briefing)과 `refresh=1`, 오류 응답엔 **붙이지 말 것** —
//    오류가 엣지에 앉으면 고쳐진 뒤에도 한 시간 동안 같은 오류가 나간다.
export const CDN_DAILY = "public, s-maxage=600, stale-while-revalidate=3600";

export function cachedJson(body, { cache = true } = {}) {
  return Response.json(body, cache ? { headers: { "Cache-Control": CDN_DAILY } } : undefined);
}
