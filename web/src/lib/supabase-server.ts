import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side anon-key client tied to the current request's cookies.
 *
 * Use this whenever a server component, route handler, or server action
 * needs to know who the signed-in user is. Reads/writes the session cookie
 * on every call so the session can be refreshed transparently.
 *
 * RLS applies — this client is scoped to the user. For service-role access
 * (e.g. viewer reading any deck by id) use getSupabaseAdmin() instead.
 */
export async function getSupabaseServer(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase public credentials missing — check NEXT_PUBLIC_SUPABASE_URL " +
        "and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // `cookieStore.set` throws when called from a server component
          // render pass (you can only set cookies in route handlers, server
          // actions, or proxy). The proxy refreshes the session for us, so
          // ignoring this here is safe.
        }
      },
    },
  });
}
