import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side admin client.
 *
 * Uses the SERVICE_ROLE_KEY, which bypasses Row Level Security. NEVER use
 * this in a client component or any code that gets shipped to the browser.
 *
 * Lazy initialisation so missing env vars produce a clear runtime error
 * only when an operation is actually attempted — not when an unrelated
 * page (e.g. the marketing home) imports a downstream module that imports
 * this one.
 */
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase credentials missing — check web/.env.local has " +
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set.",
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  return cached;
}
