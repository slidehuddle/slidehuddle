// Slide store backed by Supabase. Replaces the earlier in-memory Map so
// slides survive server restarts and the app works on serverless platforms
// like Vercel (where each invocation gets a fresh process).
//
// Public.decks columns this module touches:
//   id            text         primary key (we generate a short random id)
//   html_content  text         the captured slide HTML
//   created_at    timestamptz  filled by Postgres default
//   updated_at    timestamptz  filled by Postgres default
//   version       integer      defaults to 1 (room for future revisions)

import { getSupabaseAdmin } from "./supabase";

function generateDeckId(): string {
  // Cryptographically random, ~128 bits of entropy, base36 ≈ 25 chars.
  // Math.random() is predictable enough that an attacker observing a few
  // IDs could narrow the search space for adjacent decks; crypto.randomUUID
  // closes that.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 22);
}

export async function storeSlides(html: string): Promise<string> {
  const id = generateDeckId();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("decks")
    .insert({ id, html_content: html });
  if (error) {
    console.error("[slide-store] insert failed:", error);
    throw new Error(`Failed to store deck: ${error.message}`);
  }
  return id;
}

export async function getStoredSlides(id: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("decks")
    .select("html_content")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[slide-store] fetch failed:", error);
    return null;
  }
  return data?.html_content ?? null;
}
