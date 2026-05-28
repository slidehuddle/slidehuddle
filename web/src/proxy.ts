import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  // Track whether @supabase/ssr asked us to write new auth cookies during
  // this request — i.e. whether a refresh actually happened. Used by the
  // temporary diagnostic log below.
  let cookiesSet = false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesSet = true;
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touching getUser() here is what triggers @supabase/ssr to refresh the
  // session cookie if it's about to expire. We don't actually care about
  // the result in the proxy — but during the session-lifetime debugging
  // pass we log meaningful events (refreshes and errors) so we can read
  // them out of Vercel logs.
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.log(
        "[proxy] getUser error on",
        request.nextUrl.pathname,
        "-",
        error.message,
      );
    } else if (cookiesSet) {
      console.log(
        "[proxy] session rotated on",
        request.nextUrl.pathname,
        "for",
        data.user?.email ?? "(no email)",
      );
    }
  } catch (err) {
    console.log(
      "[proxy] getUser threw on",
      request.nextUrl.pathname,
      "-",
      err instanceof Error ? err.message : String(err),
    );
  }

  return response;
}

export const config = {
  // Run on everything except Next.js internals and static assets. We
  // intentionally include /api so authenticated POSTs to /api/slides can
  // also refresh their session.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
