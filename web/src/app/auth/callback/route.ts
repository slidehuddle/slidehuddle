import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * Magic-link landing route.
 *
 * Supabase emails the user a URL like
 *   https://slidehuddleapp.vercel.app/auth/callback?code=<one-time-code>
 *
 * We swap that code for a session (which writes the auth cookies), then send
 * the user to /dashboard. If anything goes wrong, send them back to /login.
 */
// Only relative paths starting with a single "/" are accepted as a `next`
// redirect target. Anything else (absolute URLs, protocol-relative "//evil")
// is rejected to prevent open-redirect attacks via crafted magic links.
function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const origin = request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[/auth/callback] exchange failed:", error);
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}${next ?? "/dashboard"}`);
}
