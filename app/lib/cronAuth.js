// cron 라우트(/api/cron/*) 공용 인증. CRON_SECRET 설정 시 `Authorization: Bearer <secret>`
// 일치 필요(Vercel Cron이 자동 첨부). 미설정(로컬 등)이면 인증 없이 통과.
// 반환: 거부 시 401 Response, 통과 시 null — `const denied = cronUnauthorized(req); if (denied) return denied;`

export function cronUnauthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
