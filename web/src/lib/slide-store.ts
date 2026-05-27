// Slide store backed by Supabase. Replaces the earlier in-memory Map so
// slides survive server restarts and the app works on serverless platforms
// like Vercel (where each invocation gets a fresh process).
//
// Public.decks columns this module touches:
//   id            text         primary key (we generate a short random id)
//   html_content  text         the captured slide HTML
//   user_id       uuid|null    auth.users.id of the creator (null = orphan)
//   title         text|null    derived from <title> or first <h1>
//   slide_count   integer|null derived count of <section> / .slide elements
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

const MAX_TITLE_LENGTH = 200;

function extractTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const t = titleMatch[1].replace(/\s+/g, " ").trim();
    if (t) return t.slice(0, MAX_TITLE_LENGTH);
  }
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const t = h1Match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (t) return t.slice(0, MAX_TITLE_LENGTH);
  }
  return null;
}

function countSlides(html: string): number | null {
  // Match the same shapes Claude tends to emit. We pick the higher count
  // so that whichever convention the deck uses, we get a sensible number.
  const sectionCount = (html.match(/<section\b/gi) || []).length;
  const slideDivCount = (html.match(/class\s*=\s*"[^"]*\bslide\b[^"]*"/gi) || [])
    .length;
  const count = Math.max(sectionCount, slideDivCount);
  return count > 0 ? count : null;
}

export type StoreSlidesOptions = {
  userId?: string | null;
};

export async function storeSlides(
  html: string,
  options: StoreSlidesOptions = {},
): Promise<string> {
  const id = generateDeckId();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("decks").insert({
    id,
    html_content: html,
    user_id: options.userId ?? null,
    title: extractTitle(html),
    slide_count: countSlides(html),
  });
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
