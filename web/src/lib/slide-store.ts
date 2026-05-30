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

// Does the HTML depend on CSS variables / utility classes that only exist
// inside claude.ai itself? Claude's chat UI defines a compound-Tailwind
// design system (bg-bg-100, text-text-100, font-ui, etc.) where the inner
// token is the Claude design-system *name*, not a standard Tailwind color.
// Artifacts authored against that design system render correctly in the
// chat preview but break outside it — colors, fonts, and spacing all fall
// back to nothing. Such artifacts shouldn't be accepted by SlideHuddle
// because they'll display broken regardless of how we render them.
//
// Genuinely standalone HTML artifacts (the kind Claude lets you download
// as a .html file) don't use these classes — they have all their CSS
// inline.
export function dependsOnClaudeDesignSystem(html: string): boolean {
  // Compound Tailwind utilities where the color name is "bg" / "text" /
  // "border" — extremely unusual outside Claude's design system.
  if (/\b(?:bg-bg-|text-text-|border-border-)\d/.test(html)) return true;
  // Claude's font utilities.
  if (/\bfont-(?:ui|copernicus|tiempos|claude|styrene)\b/.test(html)) {
    return true;
  }
  // Claude's interface root class.
  if (/\bchat-ui-core\b/.test(html)) return true;
  return false;
}

export function countSlides(html: string): number | null {
  // Mirror SlideViewer's strategy priority: prefer .slide elements; fall
  // back to bare <section> only when there are no .slide elements at all.
  // (Claude decks frequently include non-slide <section>s for navigation,
  // headers, etc., so Math.max() would over-count.)
  //
  // We also match "slide" as an exact class token, not via \bslide\b, so
  // we don't pick up class="slide-number", class="slide-title", etc.
  const classAttrs = html.match(/class\s*=\s*"([^"]*)"/gi) || [];
  let slideClassCount = 0;
  for (const attr of classAttrs) {
    const inner = attr.match(/"([^"]*)"/)?.[1] ?? "";
    const tokens = inner.split(/\s+/);
    if (tokens.includes("slide")) slideClassCount++;
  }
  if (slideClassCount > 0) return slideClassCount;

  const sectionCount = (html.match(/<section\b/gi) || []).length;
  return sectionCount > 0 ? sectionCount : null;
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

export type DeckMeta = {
  id: string;
  user_id: string | null;
};

export async function getDeckMeta(id: string): Promise<DeckMeta | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("decks")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[slide-store] meta fetch failed:", error);
    return null;
  }
  return data as DeckMeta | null;
}

// Set user_id on an orphan deck. Only succeeds while the deck is unclaimed
// (user_id IS NULL) — that's the guard against accidentally re-owning a
// deck someone else already claimed. Returns true if the row was updated.
export async function claimOrphanDeck(
  deckId: string,
  userId: string,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("decks")
    .update({ user_id: userId })
    .eq("id", deckId)
    .is("user_id", null)
    .select("id");
  if (error) {
    console.error("[slide-store] claim failed:", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

// Record that a signed-in user has accessed a deck they don't own, so it
// appears in their dashboard under "Shared with me". Idempotent — repeat
// visits don't add duplicate rows (primary key is (deck_id, user_id)).
export async function trackSharedDeck(
  deckId: string,
  userId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("shared_decks")
    .upsert(
      { deck_id: deckId, user_id: userId, role: "viewer" },
      { onConflict: "deck_id,user_id", ignoreDuplicates: true },
    );
  if (error) {
    console.error("[slide-store] track-share failed:", error);
  }
}

// Count how many shared_decks rows exist per deck, keyed by deck_id.
// Uses the admin client because RLS on shared_decks restricts a signed-in
// user to their own rows — but the dashboard wants the aggregate count
// across all recipients of each deck.
export async function getDeckShareCounts(
  deckIds: string[],
): Promise<Record<string, number>> {
  if (deckIds.length === 0) return {};
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("shared_decks")
    .select("deck_id")
    .in("deck_id", deckIds);
  if (error) {
    console.error("[slide-store] share counts fetch failed:", error);
    return {};
  }
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { deck_id: string }[]) {
    counts[row.deck_id] = (counts[row.deck_id] ?? 0) + 1;
  }
  return counts;
}

// Re-derive title and slide_count for every deck owned by `userId` and
// write back any rows where the freshly-computed values differ from what
// was stored. Useful as a one-off backfill when the derivation logic
// changes (e.g. the slide_count counting fix). Idempotent — running it
// again on an already-correct dataset is a no-op.
export async function recomputeOwnedDeckMeta(userId: string): Promise<{
  scanned: number;
  updated: number;
}> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("decks")
    .select("id, html_content, title, slide_count")
    .eq("user_id", userId);
  if (error || !data) {
    console.error("[slide-store] recount fetch failed:", error);
    return { scanned: 0, updated: 0 };
  }
  let updated = 0;
  await Promise.all(
    (data as { id: string; html_content: string; title: string | null; slide_count: number | null }[]).map(
      async (deck) => {
        const newTitle = extractTitle(deck.html_content);
        const newSlideCount = countSlides(deck.html_content);
        if (
          newTitle === deck.title &&
          newSlideCount === deck.slide_count
        ) {
          return;
        }
        const { error: updateErr } = await supabase
          .from("decks")
          .update({ title: newTitle, slide_count: newSlideCount })
          .eq("id", deck.id);
        if (updateErr) {
          console.error(
            "[slide-store] recount update failed for",
            deck.id,
            updateErr,
          );
          return;
        }
        updated++;
      },
    ),
  );
  return { scanned: data.length, updated };
}

// Upsert the (deck_id, user_id) row in deck_views with the current
// timestamp. Used by the viewer page to record "this user has now seen
// the deck up to this point" so the dashboard can compute unread
// comment counts.
export async function recordDeckView(
  deckId: string,
  userId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("deck_views")
    .upsert(
      {
        deck_id: deckId,
        user_id: userId,
        last_viewed_at: new Date().toISOString(),
      },
      { onConflict: "deck_id,user_id" },
    );
  if (error) {
    console.error("[slide-store] record-view failed:", error);
  }
}

// Total / unread comment counts per deck for the dashboard. "Unread"
// means a comment whose created_at is newer than the user's
// deck_views.last_viewed_at (or any comment, if the user has never
// viewed the deck). Uses the admin client because:
//   - the comments RLS would only return rows on decks the user can
//     access via select_on_accessible_decks, which is what we want, but
//   - we also want to count comments by *other* users, and a single
//     admin query over both deck_views and comments is simpler and
//     cheaper than two RLS-scoped queries.
export async function getDeckCommentCountsForUser(
  deckIds: string[],
  userId: string,
): Promise<Record<string, { total: number; unread: number }>> {
  if (deckIds.length === 0) return {};
  const supabase = getSupabaseAdmin();
  const [viewsRes, commentsRes] = await Promise.all([
    supabase
      .from("deck_views")
      .select("deck_id, last_viewed_at")
      .eq("user_id", userId)
      .in("deck_id", deckIds),
    supabase
      .from("comments")
      .select("deck_id, created_at")
      .in("deck_id", deckIds),
  ]);
  if (viewsRes.error) {
    console.error(
      "[slide-store] deck_views fetch failed:",
      viewsRes.error,
    );
  }
  if (commentsRes.error) {
    console.error(
      "[slide-store] comment counts fetch failed:",
      commentsRes.error,
    );
  }
  const lastViewed: Record<string, string> = {};
  for (const v of (viewsRes.data ?? []) as {
    deck_id: string;
    last_viewed_at: string;
  }[]) {
    lastViewed[v.deck_id] = v.last_viewed_at;
  }
  const counts: Record<string, { total: number; unread: number }> = {};
  for (const c of (commentsRes.data ?? []) as {
    deck_id: string;
    created_at: string;
  }[]) {
    const entry =
      counts[c.deck_id] ?? (counts[c.deck_id] = { total: 0, unread: 0 });
    entry.total++;
    const last = lastViewed[c.deck_id];
    if (!last || c.created_at > last) entry.unread++;
  }
  return counts;
}

export type CommentRow = {
  id: string;
  deck_id: string;
  user_id: string;
  author_email: string | null;
  slide_index: number;
  body: string;
  created_at: string;
};

// Fetch every comment the signed-in user can see for a deck, ordered by
// slide and then by time. Uses the admin client because we need to read
// all comments on accessible decks regardless of RLS strictness — the
// caller is expected to have already verified deck access for the user
// (or we pass userId NULL for an anonymous viewer and return []).
export async function getCommentsForDeck(
  deckId: string,
  userId: string | null,
): Promise<CommentRow[]> {
  if (!userId) return [];
  const supabase = getSupabaseAdmin();
  // Double-check access: own the deck OR have a shared_decks row. This
  // mirrors the comments RLS but is enforced explicitly here because we're
  // using the admin client (which bypasses RLS).
  const [{ data: ownsDeck }, { data: hasShare }] = await Promise.all([
    supabase
      .from("decks")
      .select("id")
      .eq("id", deckId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("shared_decks")
      .select("deck_id")
      .eq("deck_id", deckId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (!ownsDeck && !hasShare) return [];

  const { data, error } = await supabase
    .from("comments")
    .select("id, deck_id, user_id, author_email, slide_index, body, created_at")
    .eq("deck_id", deckId)
    .order("slide_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[slide-store] comments fetch failed:", error);
    return [];
  }
  return (data ?? []) as CommentRow[];
}

// A Supabase error that just means "this table hasn't been created yet"
// (the migration hasn't been run). We treat that as an expected empty
// result rather than a real error, so it doesn't spam the server console
// or surface as a Next.js dev-overlay issue before the migrations land.
function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // PGRST205 = PostgREST "table not found in schema cache";
  // 42P01     = Postgres "undefined_table".
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  return /could not find the table|does not exist/i.test(error.message ?? "");
}

// --- Slide stubs ("requested slides") ---------------------------------
//
// A stub is a placeholder slide a collaborator asks to be added. It sits at
// a `position` (number of real slides before it) without modifying the
// captured HTML. Read with the admin client so anonymous link-viewers still
// see requested slides in the strip; writes go through the browser client
// under RLS. `requested_by_email` is resolved server-side for display and
// is not a stored column.
export type StubRow = {
  id: string;
  deck_id: string;
  position: number;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  requested_by: string | null;
  requested_by_email: string | null;
  created_at: string;
};

export async function getStubsForDeck(deckId: string): Promise<StubRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("slide_stubs")
    .select("id, deck_id, position, title, subtitle, body, requested_by, created_at")
    .eq("deck_id", deckId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    // Pre-migration the table may not exist yet; that's an expected empty
    // result, not an error worth logging. Log anything else.
    if (!isMissingTableError(error)) {
      console.error("[slide-store] stubs fetch failed:", error);
    }
    return [];
  }
  const rows = (data ?? []) as Omit<StubRow, "requested_by_email">[];
  const emails = await getOwnerEmails(
    rows.map((r) => r.requested_by).filter((id): id is string => !!id),
  );
  return rows.map((r) => ({
    ...r,
    requested_by_email: r.requested_by ? emails[r.requested_by] ?? null : null,
  }));
}

// --- Slide flags ("flag for removal") ---------------------------------
//
// A flag marks a real slide (by stable 0-based index) for removal, with a
// reason. Same access pattern as stubs. `flagged_by_email` is resolved for
// display and is not a stored column.
export type FlagRow = {
  id: string;
  deck_id: string;
  slide_index: number;
  reason: string | null;
  flagged_by: string | null;
  flagged_by_email: string | null;
  created_at: string;
};

export async function getFlagsForDeck(deckId: string): Promise<FlagRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("slide_flags")
    .select("id, deck_id, slide_index, reason, flagged_by, created_at")
    .eq("deck_id", deckId)
    .order("created_at", { ascending: true });
  if (error) {
    if (!isMissingTableError(error)) {
      console.error("[slide-store] flags fetch failed:", error);
    }
    return [];
  }
  const rows = (data ?? []) as Omit<FlagRow, "flagged_by_email">[];
  const emails = await getOwnerEmails(
    rows.map((r) => r.flagged_by).filter((id): id is string => !!id),
  );
  return rows.map((r) => ({
    ...r,
    flagged_by_email: r.flagged_by ? emails[r.flagged_by] ?? null : null,
  }));
}

// Look up auth.users.email for a set of user ids using the admin API.
// The anon-key Supabase client can't read auth.users, so this has to use
// service-role. Returns a {user_id → email} map; missing entries mean
// either the user no longer exists or has no email recorded.
export async function getOwnerEmails(
  userIds: string[],
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const supabase = getSupabaseAdmin();
  const unique = Array.from(new Set(userIds));
  const result: Record<string, string> = {};
  await Promise.all(
    unique.map(async (uid) => {
      const { data, error } = await supabase.auth.admin.getUserById(uid);
      if (error) {
        console.warn(
          "[slide-store] owner email lookup failed for",
          uid,
          error,
        );
        return;
      }
      if (data.user?.email) {
        result[uid] = data.user.email;
      }
    }),
  );
  return result;
}
