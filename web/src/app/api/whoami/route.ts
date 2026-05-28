import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// Debug endpoint for diagnosing session lifetime issues.
//
// Hit from the browser console while signed in:
//   fetch("/api/whoami").then(r => r.json()).then(console.log)
//
// Returns the current user (if any), when the access token expires, and
// the names of the sb-* cookies the request actually carried. Combined
// with proxy.ts's session-rotation log, this is enough to tell whether
// refresh is happening on schedule.
export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();

  const sbCookies = request.cookies
    .getAll()
    .filter((c) => c.name.startsWith("sb-"))
    .map((c) => c.name);

  const session = sessionData.session;
  const nowSec = Math.floor(Date.now() / 1000);

  return NextResponse.json({
    signed_in: !!userData.user,
    user: userData.user
      ? { id: userData.user.id, email: userData.user.email }
      : null,
    session: session
      ? {
          expires_at: session.expires_at
            ? new Date(session.expires_at * 1000).toISOString()
            : null,
          seconds_until_expiry: session.expires_at
            ? session.expires_at - nowSec
            : null,
          expires_in: session.expires_in ?? null,
        }
      : null,
    sb_cookie_names: sbCookies,
    user_error: userErr?.message ?? null,
    session_error: sessErr?.message ?? null,
    server_time: new Date().toISOString(),
  });
}
