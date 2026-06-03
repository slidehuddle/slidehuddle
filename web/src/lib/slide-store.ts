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

// Result of a collection fetch. We must NOT conflate a genuine empty result
// (the query worked, there's just no data) with a real failure (the table is
// missing because a migration never ran, the query errored, permission was
// denied, …). `rows` is always present (empty on failure, so callers can still
// render), and `failed` lets the UI show a "couldn't load" indicator instead of
// silently pretending there's no data.
export type ListLoad<T> = { rows: T[]; failed: boolean };

export type StoreSlidesOptions = {
  userId?: string | null;
  /** Claude conversation the deck was captured from (claude.ai/chat/<id>). */
  conversationId?: string | null;
};

export type StoreSlidesResult = { id: string; title: string | null };

export async function storeSlides(
  html: string,
  options: StoreSlidesOptions = {},
): Promise<StoreSlidesResult> {
  const id = generateDeckId();
  const supabase = getSupabaseAdmin();
  const title = extractTitle(html);
  const slideCount = countSlides(html);
  const conversationId = options.conversationId ?? null;
  const baseRow = {
    id,
    html_content: html,
    user_id: options.userId ?? null,
    title,
    slide_count: slideCount,
  };

  // Cast keeps TS happy when the generated types don't yet know about the
  // claude_conversation_id column; the property is still sent at runtime.
  const insertRow = conversationId
    ? { ...baseRow, claude_conversation_id: conversationId }
    : baseRow;
  let { error } = await supabase
    .from("decks")
    .insert(insertRow as typeof baseRow);
  if (error && conversationId && isMissingColumnError(error)) {
    // Pre-migration: the conversation column doesn't exist yet. Still create
    // the deck — just without the binding — so capture keeps working.
    console.warn(
      "[slide-store] claude_conversation_id column missing — storing deck " +
        "without conversation binding. Run docs/deck-conversation-migration.sql.",
    );
    ({ error } = await supabase.from("decks").insert(baseRow));
  }
  if (error) {
    console.error("[slide-store] insert failed:", error);
    throw new Error(`Failed to store deck: ${error.message}`);
  }
  // Snapshot v1 into deck_versions so history is complete from the start.
  // Best-effort: if the migration hasn't been run yet, creating decks must
  // still work — so a missing deck_versions table is swallowed, not fatal.
  await snapshotVersion(supabase, {
    deckId: id,
    version: 1,
    html,
    title,
    slideCount,
    createdBy: options.userId ?? null,
    tolerateMissingTable: true,
  });
  return { id, title };
}

// Insert one immutable snapshot row into deck_versions. Idempotent on
// (deck_id, version): a duplicate is ignored rather than erroring, which makes
// the v1 snapshot and the update backfill safe to re-attempt.
async function snapshotVersion(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  args: {
    deckId: string;
    version: number;
    html: string;
    title: string | null;
    slideCount: number | null;
    createdBy: string | null;
    tolerateMissingTable?: boolean;
  },
): Promise<void> {
  const { error } = await supabase.from("deck_versions").upsert(
    {
      deck_id: args.deckId,
      version: args.version,
      html_content: args.html,
      title: args.title,
      slide_count: args.slideCount,
      created_by: args.createdBy,
    },
    { onConflict: "deck_id,version", ignoreDuplicates: true },
  );
  if (error) {
    if (args.tolerateMissingTable && isMissingTableError(error)) {
      console.warn(
        "[slide-store] deck_versions table missing — skipping v1 snapshot. " +
          "Run docs/deck-versions-migration.sql to enable version history.",
      );
      return;
    }
    throw new Error(`Failed to snapshot deck version: ${error.message}`);
  }
}

export type UpdateDeckResult = {
  id: string;
  version: number;
  title: string | null;
};

// Save `html` as the next version of an EXISTING deck, keeping the same id
// (and therefore the same share link). Increments decks.version, replaces the
// "latest pointer" columns on decks, and writes an immutable snapshot row.
// Throws if the deck doesn't exist or the deck_versions table is missing
// (versioning genuinely can't proceed without it).
export async function updateDeck(
  deckId: string,
  html: string,
  options: StoreSlidesOptions = {},
): Promise<UpdateDeckResult> {
  const supabase = getSupabaseAdmin();

  const { data: deck, error: readErr } = await supabase
    .from("decks")
    .select("id, version, html_content, title, slide_count")
    .eq("id", deckId)
    .maybeSingle();
  if (readErr) {
    console.error("[slide-store] update read failed:", readErr);
    throw new Error(`Failed to read deck: ${readErr.message}`);
  }
  if (!deck) {
    throw new Error("Deck not found");
  }

  const currentVersion: number =
    typeof deck.version === "number" && deck.version > 0 ? deck.version : 1;

  // Backfill: ensure the CURRENT version is snapshotted before we move past
  // it. Decks created before versioning existed (or whose v1 snapshot was
  // skipped pre-migration) would otherwise lose their pre-update HTML.
  await snapshotVersion(supabase, {
    deckId,
    version: currentVersion,
    html: deck.html_content,
    title: deck.title ?? null,
    slideCount: deck.slide_count ?? null,
    createdBy: null,
  });

  const nextVersion = currentVersion + 1;
  const newTitle = extractTitle(html);
  const newSlideCount = countSlides(html);

  // Write the new immutable snapshot first, then advance the pointer. If the
  // snapshot insert fails we haven't mutated the live deck.
  await snapshotVersion(supabase, {
    deckId,
    version: nextVersion,
    html,
    title: newTitle,
    slideCount: newSlideCount,
    createdBy: options.userId ?? null,
  });

  const { error: updErr } = await supabase
    .from("decks")
    .update({
      html_content: html,
      title: newTitle,
      slide_count: newSlideCount,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deckId);
  if (updErr) {
    console.error("[slide-store] update pointer failed:", updErr);
    throw new Error(`Failed to update deck: ${updErr.message}`);
  }

  return { id: deckId, version: nextVersion, title: newTitle };
}

export type DeckVersionRow = {
  id: string;
  deck_id: string;
  version: number;
  title: string | null;
  slide_count: number | null;
  created_by: string | null;
  created_at: string;
};

// Version history for a deck (newest first), WITHOUT the heavy html_content
// payload. For the future history UI. Returns [] if the table is missing.
export async function getDeckVersions(
  deckId: string,
): Promise<ListLoad<DeckVersionRow>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("deck_versions")
    .select("id, deck_id, version, title, slide_count, created_by, created_at")
    .eq("deck_id", deckId)
    .order("version", { ascending: false });
  if (error) {
    logDbError("versions fetch failed", error);
    return { rows: [], failed: true };
  }
  return { rows: (data ?? []) as DeckVersionRow[], failed: false };
}

// Load a deck's stored HTML. Distinguishes three cases so the viewer can tell a
// real failure apart from a deck that simply isn't there:
//   { html: "<…>", failed: false }  → found
//   { html: null,  failed: false }  → genuinely not found (no such deck)
//   { html: null,  failed: true  }  → the query errored (don't show "empty")
export async function getStoredSlides(
  id: string,
): Promise<{ html: string | null; failed: boolean }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("decks")
    .select("html_content")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logDbError("deck html fetch failed", error);
    return { html: null, failed: true };
  }
  return { html: data?.html_content ?? null, failed: false };
}

export type DeckMeta = {
  id: string;
  user_id: string | null;
  version: number;
  title: string | null;
  slide_count: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function getDeckMeta(id: string): Promise<DeckMeta | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("decks")
    .select("id, user_id, version, title, slide_count, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logDbError("deck meta fetch failed", error);
    return null;
  }
  if (!data) return null;
  const row = data as {
    id: string;
    user_id: string | null;
    version: number | null;
    title: string | null;
    slide_count: number | null;
    created_at: string | null;
    updated_at: string | null;
  };
  return {
    id: row.id,
    user_id: row.user_id,
    version: typeof row.version === "number" && row.version > 0 ? row.version : 1,
    title: row.title,
    slide_count: row.slide_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Fetch the stored HTML for one historical version of a deck (for viewing a
// past version in the viewer). Returns null if not found / table missing.
export async function getDeckVersionHtml(
  deckId: string,
  version: number,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("deck_versions")
    .select("html_content")
    .eq("deck_id", deckId)
    .eq("version", version)
    .maybeSingle();
  if (error) {
    logDbError("version html fetch failed", error);
    return null;
  }
  return data?.html_content ?? null;
}

// Read a user's existing deck_views row (the last time they viewed this deck),
// used to decide whether to show the "updated since you last saw it" banner.
// Returns null if there's no prior view. Read BEFORE recordDeckView updates it.
export async function getDeckView(
  deckId: string,
  userId: string,
): Promise<{ last_viewed_at: string | null } | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("deck_views")
    .select("last_viewed_at")
    .eq("deck_id", deckId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logDbError("deck view fetch failed", error);
    return null;
  }
  return data ? { last_viewed_at: data.last_viewed_at ?? null } : null;
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
export type DeckCommentCounts = {
  counts: Record<string, { total: number; unread: number }>;
  failed: boolean;
};

export async function getDeckCommentCountsForUser(
  deckIds: string[],
  userId: string,
): Promise<DeckCommentCounts> {
  if (deckIds.length === 0) return { counts: {}, failed: false };
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
  // The comments query is what drives the counts; a deck_views failure only
  // affects read/unread accuracy. Treat either as a real load failure so the
  // dashboard can warn rather than silently show "no comments".
  if (viewsRes.error) logDbError("deck_views fetch failed", viewsRes.error);
  if (commentsRes.error) {
    logDbError("comment counts fetch failed", commentsRes.error);
  }
  const failed = !!viewsRes.error || !!commentsRes.error;
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
  return { counts, failed };
}

export type CommentRow = {
  id: string;
  deck_id: string;
  user_id: string;
  author_email: string | null;
  slide_index: number;
  body: string;
  created_at: string;
  /** Which deck version this comment was written on. Comments are shown only
   *  while viewing the version they belong to. */
  version: number;
  /** Owner curation: excluded from the Claude prompt (still shown in panel). */
  dismissed: boolean;
  /** Owner curation: owner's edited text sent to Claude. null = unedited; the
   *  original author's words always remain in `body`. */
  owner_edited_body: string | null;
};

// Fetch every comment the signed-in user can see for a deck, ordered by
// slide and then by time. Uses the admin client because we need to read
// all comments on accessible decks regardless of RLS strictness — the
// caller is expected to have already verified deck access for the user
// (or we pass userId NULL for an anonymous viewer and return []).
export async function getCommentsForDeck(
  deckId: string,
  userId: string | null,
  version: number,
): Promise<ListLoad<CommentRow>> {
  // No signed-in user / no access are legitimate empty states, not failures.
  if (!userId) return { rows: [], failed: false };
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
  if (!ownsDeck && !hasShare) return { rows: [], failed: false };

  const { data, error } = await supabase
    .from("comments")
    .select(
      "id, deck_id, user_id, author_email, slide_index, body, created_at, version, dismissed, owner_edited_body",
    )
    .eq("deck_id", deckId)
    .eq("version", version)
    .order("slide_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    logDbError("comments fetch failed", error);
    return { rows: [], failed: true };
  }
  return { rows: (data ?? []) as CommentRow[], failed: false };
}

// Owner-only curation of a comment: toggle `dismissed` and/or set the owner's
// edited text. Only the DECK OWNER may do this (the original author's `body` is
// never touched). Mirrors deleteStub's "verify deck, enforce ownership with the
// service-role client" shape. deckId comes from the client, so the comment is
// re-checked to belong to it.
export async function setCommentCuration(
  deckId: string,
  commentId: string,
  userId: string,
  patch: { dismissed?: boolean; owner_edited_body?: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  const supabase = getSupabaseAdmin();

  const { data: comment, error: readErr } = await supabase
    .from("comments")
    .select("id, deck_id")
    .eq("id", commentId)
    .maybeSingle();
  if (readErr) {
    console.error("[slide-store] comment read failed:", readErr);
    return { ok: false, reason: "error" };
  }
  if (!comment || comment.deck_id !== deckId) {
    return { ok: false, reason: "not_found" };
  }

  const { data: deck, error: deckErr } = await supabase
    .from("decks")
    .select("user_id")
    .eq("id", deckId)
    .maybeSingle();
  if (deckErr) {
    console.error("[slide-store] deck read failed:", deckErr);
    return { ok: false, reason: "error" };
  }
  if (!deck || deck.user_id !== userId) {
    return { ok: false, reason: "forbidden" };
  }

  // Whitelist curation fields only — never write the original `body`.
  const update: { dismissed?: boolean; owner_edited_body?: string | null } = {};
  if (typeof patch.dismissed === "boolean") update.dismissed = patch.dismissed;
  if ("owner_edited_body" in patch) {
    update.owner_edited_body = patch.owner_edited_body;
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const { error: updErr } = await supabase
    .from("comments")
    .update(update)
    .eq("id", commentId);
  if (updErr) {
    console.error("[slide-store] comment curation update failed:", updErr);
    return { ok: false, reason: "error" };
  }
  return { ok: true };
}

type DbError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
} | null;

// Render a Supabase/Postgres error into a single readable log line (code +
// message + hint), so a real failure is legible in the server logs rather than
// "[object Object]".
function describeDbError(error: DbError): string {
  if (!error) return "unknown error";
  const parts: string[] = [];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.message) parts.push(error.message);
  if (error.details) parts.push(`details: ${error.details}`);
  if (error.hint) parts.push(`hint: ${error.hint}`);
  return parts.join(" | ") || "unknown error";
}

// Log a data-fetch failure loudly and clearly. A missing table is the classic
// "a migration never got run" case the empty-vs-error distinction is meant to
// catch, so we call that out explicitly instead of letting it look routine.
function logDbError(context: string, error: DbError): void {
  if (isMissingTableError(error)) {
    console.error(
      `[slide-store] ${context}: database table is missing — a required ` +
        `migration likely hasn't been run. ${describeDbError(error)}`,
    );
  } else {
    console.error(`[slide-store] ${context}: ${describeDbError(error)}`);
  }
}

// A Supabase error that just means "this table hasn't been created yet"
// (the migration hasn't been run). Historically we swallowed this as an
// expected empty result; we now surface it as a real failure (see logDbError /
// the ListLoad `failed` flag) because a never-run migration must not look
// identical to "no data yet".
function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // PGRST205 = PostgREST "table not found in schema cache";
  // 42P01     = Postgres "undefined_table".
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  return /could not find the table|does not exist/i.test(error.message ?? "");
}

// A Supabase error meaning "this column hasn't been added yet" (the relevant
// ALTER TABLE migration hasn't run). Lets create degrade gracefully — store
// the deck without the new column rather than failing the whole insert.
function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // PGRST204 = PostgREST "column not found in schema cache";
  // 42703     = Postgres "undefined_column".
  if (error.code === "PGRST204" || error.code === "42703") return true;
  return /could not find the .* column|column .* does not exist/i.test(
    error.message ?? "",
  );
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

export async function getStubsForDeck(
  deckId: string,
): Promise<ListLoad<StubRow>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("slide_stubs")
    .select("id, deck_id, position, title, subtitle, body, requested_by, created_at")
    .eq("deck_id", deckId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    // Any error here — including a missing slide_stubs table (migration not
    // run) — is a real failure. Surface it instead of returning a fake empty.
    logDbError("stubs fetch failed", error);
    return { rows: [], failed: true };
  }
  const rows = (data ?? []) as Omit<StubRow, "requested_by_email">[];
  const emails = await getOwnerEmails(
    rows.map((r) => r.requested_by).filter((id): id is string => !!id),
  );
  return {
    rows: rows.map((r) => ({
      ...r,
      requested_by_email: r.requested_by ? emails[r.requested_by] ?? null : null,
    })),
    failed: false,
  };
}

export type DeleteStubResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" | "error" };

// Delete a requested (stub) slide outright (stubs have no real content, so
// there's nothing to regenerate — removal is immediate, not a "flag").
// Permitted for the person who requested it OR the deck owner. We enforce this
// here with the service-role client because the owner deleting *someone else's*
// stub is beyond what the browser RLS policy allows. The caller is responsible
// for passing the authenticated user's id (see the server action).
export async function deleteStub(
  deckId: string,
  stubId: string,
  userId: string,
): Promise<DeleteStubResult> {
  const supabase = getSupabaseAdmin();

  const { data: stub, error: readErr } = await supabase
    .from("slide_stubs")
    .select("id, deck_id, requested_by")
    .eq("id", stubId)
    .maybeSingle();
  if (readErr) {
    console.error("[slide-store] stub read failed:", readErr);
    return { ok: false, reason: "error" };
  }
  // Guard against a stub id from a different deck (deckId comes from the client).
  if (!stub || stub.deck_id !== deckId) {
    return { ok: false, reason: "not_found" };
  }

  const { data: deck, error: deckErr } = await supabase
    .from("decks")
    .select("user_id")
    .eq("id", deckId)
    .maybeSingle();
  if (deckErr) {
    console.error("[slide-store] deck read failed:", deckErr);
    return { ok: false, reason: "error" };
  }

  const isRequester = !!stub.requested_by && stub.requested_by === userId;
  const isOwner = !!deck && deck.user_id === userId;
  if (!isRequester && !isOwner) {
    return { ok: false, reason: "forbidden" };
  }

  const { error: delErr } = await supabase
    .from("slide_stubs")
    .delete()
    .eq("id", stubId);
  if (delErr) {
    console.error("[slide-store] stub delete failed:", delErr);
    return { ok: false, reason: "error" };
  }
  return { ok: true };
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

export async function getFlagsForDeck(
  deckId: string,
): Promise<ListLoad<FlagRow>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("slide_flags")
    .select("id, deck_id, slide_index, reason, flagged_by, created_at")
    .eq("deck_id", deckId)
    .order("created_at", { ascending: true });
  if (error) {
    // Any error here — including a missing slide_flags table (migration not
    // run) — is a real failure, not "no flags".
    logDbError("flags fetch failed", error);
    return { rows: [], failed: true };
  }
  const rows = (data ?? []) as Omit<FlagRow, "flagged_by_email">[];
  const emails = await getOwnerEmails(
    rows.map((r) => r.flagged_by).filter((id): id is string => !!id),
  );
  return {
    rows: rows.map((r) => ({
      ...r,
      flagged_by_email: r.flagged_by ? emails[r.flagged_by] ?? null : null,
    })),
    failed: false,
  };
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
