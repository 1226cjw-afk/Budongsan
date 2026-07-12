// 서버 전용 Supabase 클라이언트.
// SUPABASE_SECRET_KEY(sb_secret_...)는 RLS를 우회하므로 서버 코드에서만 import할 것.
// 클라이언트 번들에 절대 들어가면 안 됨 (NEXT_PUBLIC_ 접두사 없음 → Next가 노출 차단).

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

// 키가 없으면 null → 호출부에서 캐시 없이 동작하도록 graceful degrade.
export const supabaseAdmin =
  url && secret
    ? createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

// DB가 필수인 라우트의 supabaseAdmin 부재 응답(공용).
export function noDbResponse() {
  return Response.json({ error: "Supabase 미설정" }, { status: 500 });
}
