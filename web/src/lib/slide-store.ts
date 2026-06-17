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
  /** Which AI produced this version: "claude" | "chatgpt" | "other" | null.
   *  Captured at create/update time (extension → "claude"; MCP → derived from
   *  the OAuth client). null = unknown → the feed shows a generic "AI". */
  source?: string | null;
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
    source: options.source ?? null,
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
    /** Which AI produced this version (provenance); null = unknown. */
    source?: string | null;
    tolerateMissingTable?: boolean;
  },
): Promise<void> {
  const baseRow = {
    deck_id: args.deckId,
    version: args.version,
    html_content: args.html,
    title: args.title,
    slide_count: args.slideCount,
    created_by: args.createdBy,
  };
  // Include `source` when we have one; if the column hasn't been migrated yet
  // (docs/deck-versions-source-migration.sql), retry without it so versioning
  // keeps working — same graceful pattern as the conversation-id column.
  const run = (withSource: boolean) =>
    supabase.from("deck_versions").upsert(
      // Cast keeps TS happy: the generated types don't know `source` yet (same
      // pattern as the claude_conversation_id column); it's still sent at runtime.
      (withSource
        ? { ...baseRow, source: args.source ?? null }
        : baseRow) as typeof baseRow,
      { onConflict: "deck_id,version", ignoreDuplicates: true },
    );
  let { error } = await run(args.source != null);
  if (error && args.source != null && isMissingColumnError(error)) {
    console.warn(
      "[slide-store] deck_versions.source column missing — snapshotting without " +
        "provenance. Run docs/deck-versions-source-migration.sql.",
    );
    ({ error } = await run(false));
  }
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
    source: options.source ?? null,
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
  /** Which AI produced this version ("claude" | "chatgpt" | "other"); null =
   *  unknown (pre-migration / pre-provenance versions). */
  source: string | null;
};

// Version history for a deck (newest first), WITHOUT the heavy html_content
// payload. Returns [] if the table is missing.
export async function getDeckVersions(
  deckId: string,
): Promise<ListLoad<DeckVersionRow>> {
  const supabase = getSupabaseAdmin();
  const baseCols = "id, deck_id, version, title, slide_count, created_by, created_at";
  // Select `source` when present; pre-migration the column doesn't exist, so on
  // a missing-column error retry without it (rows then carry source = null). The
  // `: string` annotation stops the typed select-parser from rejecting `source`
  // before the column lands in the generated types.
  const run = (withSource: boolean) => {
    const cols: string = withSource ? `${baseCols}, source` : baseCols;
    return supabase
      .from("deck_versions")
      .select(cols)
      .eq("deck_id", deckId)
      .order("version", { ascending: false });
  };
  let { data, error } = await run(true);
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await run(false));
  }
  if (error) {
    logDbError("versions fetch failed", error);
    return { rows: [], failed: true };
  }
  const rows = (data ?? []) as unknown as { source?: string | null }[];
  return {
    rows: rows.map((r) => ({ ...r, source: r.source ?? null })) as DeckVersionRow[],
    failed: false,
  };
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
  /** Claude conversation the deck was captured from (claude.ai/chat/<id>);
   *  null when unbound or the column hasn't been migrated yet. */
  conversation_id: string | null;
};

export async function getDeckMeta(id: string): Promise<DeckMeta | null> {
  const supabase = getSupabaseAdmin();
  // Select including the conversation binding. Pre-migration the column won't
  // exist, so on a missing-column error we retry the same query without it
  // rather than failing the whole meta load (which the viewer depends on).
  const baseCols = "id, user_id, version, title, slide_count, created_at, updated_at";
  let conversationKnown = true;
  let { data, error } = await supabase
    .from("decks")
    .select(`${baseCols}, claude_conversation_id`)
    .eq("id", id)
    .maybeSingle();
  if (error && isMissingColumnError(error)) {
    conversationKnown = false;
    ({ data, error } = await supabase
      .from("decks")
      .select(baseCols)
      .eq("id", id)
      .maybeSingle());
  }
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
    claude_conversation_id?: string | null;
  };
  return {
    id: row.id,
    user_id: row.user_id,
    version: typeof row.version === "number" && row.version > 0 ? row.version : 1,
    title: row.title,
    slide_count: row.slide_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
    conversation_id: conversationKnown ? row.claude_conversation_id ?? null : null,
  };
}

// One row of the owner's deck list (for MCP `list_decks`). A trimmed projection
// — only the columns the discovery tool surfaces — never html_content or other
// internal fields.
export type OwnedDeckRow = {
  id: string;
  title: string | null;
  version: number;
  updated_at: string | null;
  created_at: string | null;
  conversation_id: string | null;
};

// List every deck OWNED by `userId`, most-recently-updated first. Owner-scoped
// by `user_id` (the same rule the dashboard uses), via the admin client because
// MCP requests have no Supabase session. Returns the ListLoad `{ rows, failed }`
// shape so a query error is never mistaken for "no decks". Pre-migration the
// conversation column may not exist — same graceful fallback as getDeckMeta.
type OwnedDeckQueryRow = {
  id: string;
  title: string | null;
  version: number | null;
  updated_at: string | null;
  created_at: string | null;
  claude_conversation_id?: string | null;
};

// `options.limit` caps how many decks are returned (most-recent-first), which
// also bounds the per-deck feedback work the MCP list tool does downstream. When
// a cap is applied we also return `total` (the exact number of decks the user
// owns) so the caller can tell whether more exist beyond the returned page;
// without a cap, `total` equals the number of rows returned.
export async function getDecksForOwner(
  userId: string,
  options: { limit?: number } = {},
): Promise<ListLoad<OwnedDeckRow> & { total: number }> {
  const supabase = getSupabaseAdmin();
  const baseCols = "id, title, version, updated_at, created_at";
  const order = { ascending: false, nullsFirst: false } as const;
  const limit = options.limit && options.limit > 0 ? options.limit : undefined;
  let conversationKnown = true;
  // Build the owner-scoped, newest-first query, optionally capped to `limit`.
  const runQuery = (cols: string) => {
    const q = supabase
      .from("decks")
      .select(cols)
      .eq("user_id", userId)
      .order("updated_at", order);
    return limit ? q.limit(limit) : q;
  };
  // Two selects infer different row shapes, so capture each result separately
  // and normalise via OwnedDeckQueryRow rather than reassigning one binding.
  const first = await runQuery(`${baseCols}, claude_conversation_id`);
  let data = first.data as unknown as OwnedDeckQueryRow[] | null;
  let error = first.error;
  if (error && isMissingColumnError(error)) {
    conversationKnown = false;
    const fallback = await runQuery(baseCols);
    data = fallback.data as unknown as OwnedDeckQueryRow[] | null;
    error = fallback.error;
  }
  if (error) {
    logDbError("owned decks fetch failed", error);
    return { rows: [], failed: true, total: 0 };
  }
  const raw = data ?? [];
  const rows = raw.map((row) => ({
    id: row.id,
    title: row.title,
    version:
      typeof row.version === "number" && row.version > 0 ? row.version : 1,
    updated_at: row.updated_at,
    created_at: row.created_at,
    conversation_id: conversationKnown
      ? row.claude_conversation_id ?? null
      : null,
  }));

  // The exact owned-deck total. Only meaningful (and only worth a second query)
  // when a cap is in force — otherwise the returned rows ARE all of them.
  let total = rows.length;
  if (limit) {
    const countRes = await supabase
      .from("decks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (typeof countRes.count === "number") total = countRes.count;
  }

  return { rows, failed: false, total };
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

export type DeleteDeckResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" | "error" };

// Permanently delete a deck — owner only. All child rows (comments, versions,
// stubs, flags, views, and every collaborator's shared_decks link) are removed
// automatically via ON DELETE CASCADE, so this single delete clears the deck
// for everyone. Ownership is enforced here with the service-role client; the
// userId comes from the server session (never trusted from the client).
export async function deleteDeck(
  deckId: string,
  userId: string,
): Promise<DeleteDeckResult> {
  const supabase = getSupabaseAdmin();

  const { data: deck, error: readErr } = await supabase
    .from("decks")
    .select("user_id")
    .eq("id", deckId)
    .maybeSingle();
  if (readErr) {
    console.error("[slide-store] deck read failed (delete):", readErr);
    return { ok: false, reason: "error" };
  }
  if (!deck) return { ok: false, reason: "not_found" };
  // Only the owner may delete the deck itself. A collaborator who wants it gone
  // from their dashboard uses removeSharedDeck instead.
  if (deck.user_id !== userId) return { ok: false, reason: "forbidden" };

  const { error: delErr } = await supabase
    .from("decks")
    .delete()
    .eq("id", deckId);
  if (delErr) {
    console.error("[slide-store] deck delete failed:", delErr);
    return { ok: false, reason: "error" };
  }
  return { ok: true };
}

// Remove a deck from one collaborator's dashboard by deleting only THEIR
// shared_decks link. The deck and every other recipient are untouched. Scoped
// to the caller's own row (deck_id + user_id), so it can never affect others.
export async function removeSharedDeck(
  deckId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("shared_decks")
    .delete()
    .eq("deck_id", deckId)
    .eq("user_id", userId);
  if (error) {
    console.error("[slide-store] remove-shared-deck failed:", error);
    return { ok: false };
  }
  return { ok: true };
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

// One person who is part of a deck's "huddle" — the owner, anyone it's shared
// with, or anyone who has commented. Identity (`email`) is resolved server-side
// from the trustworthy `user_id` via getOwnerEmails. PRIVACY: this carries a
// real email, so it must only ever be sent to a SIGNED-IN viewer who is part of
// the deck (the caller gates this exactly as it gates stub/flag emails) — never
// serialized into the page for an anonymous link-holder.
export type DeckParticipant = {
  userId: string;
  email: string | null;
  isOwner: boolean;
  /** Whether this person has left at least one comment on the deck (drives the
   *  small comment marker on their avatar). */
  commented: boolean;
};

// Build the deduped participant list for a deck: owner (`ownerId`) +
// collaborators (shared_decks) + commenters (distinct comments.user_id). Uses
// the admin client because shared_decks/comments RLS would otherwise hide rows
// belonging to OTHER users — and the huddle is precisely "everyone involved".
// The caller passes the owner id it already loaded (getDeckMeta), so we don't
// re-query decks. Owner sorts first, then by email. Returns the ListLoad shape
// so a query error isn't mistaken for "nobody here".
export async function getDeckParticipants(
  deckId: string,
  ownerId: string | null,
): Promise<ListLoad<DeckParticipant>> {
  const supabase = getSupabaseAdmin();
  const [sharesRes, commentsRes] = await Promise.all([
    supabase.from("shared_decks").select("user_id").eq("deck_id", deckId),
    supabase.from("comments").select("user_id").eq("deck_id", deckId),
  ]);
  if (sharesRes.error) logDbError("participants shares fetch failed", sharesRes.error);
  if (commentsRes.error) {
    logDbError("participants comments fetch failed", commentsRes.error);
  }
  const failed = !!sharesRes.error || !!commentsRes.error;

  const ids = new Set<string>();
  if (ownerId) ids.add(ownerId);
  for (const r of (sharesRes.data ?? []) as { user_id: string | null }[]) {
    if (r.user_id) ids.add(r.user_id);
  }
  // Track who has actually commented (a subset of the participants) so the
  // avatar can carry a small "left a comment" marker.
  const commenterIds = new Set<string>();
  for (const r of (commentsRes.data ?? []) as { user_id: string | null }[]) {
    if (r.user_id) {
      ids.add(r.user_id);
      commenterIds.add(r.user_id);
    }
  }

  const idList = Array.from(ids);
  const emails = await getOwnerEmails(idList);
  const rows: DeckParticipant[] = idList.map((id) => ({
    userId: id,
    email: emails[id] ?? null,
    isOwner: id === ownerId,
    commented: commenterIds.has(id),
  }));
  rows.sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    return (a.email ?? "").localeCompare(b.email ?? "");
  });
  return { rows, failed };
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
  // Also fetch each deck's CURRENT version: comments are version-scoped (a
  // comment belongs to the version it was written on, and the viewer only shows
  // the current version's comments), so the dashboard count must likewise count
  // only current-version comments — not the total across every past version.
  const [viewsRes, commentsRes, decksRes] = await Promise.all([
    supabase
      .from("deck_views")
      .select("deck_id, last_viewed_at")
      .eq("user_id", userId)
      .in("deck_id", deckIds),
    supabase
      .from("comments")
      .select("deck_id, created_at, version")
      .in("deck_id", deckIds),
    supabase.from("decks").select("id, version").in("id", deckIds),
  ]);
  // The comments + decks queries drive the counts; a deck_views failure only
  // affects read/unread accuracy. Treat any as a real load failure so the
  // dashboard can warn rather than silently show a wrong/empty count.
  if (viewsRes.error) logDbError("deck_views fetch failed", viewsRes.error);
  if (commentsRes.error) {
    logDbError("comment counts fetch failed", commentsRes.error);
  }
  if (decksRes.error) logDbError("deck versions fetch failed", decksRes.error);
  const failed = !!viewsRes.error || !!commentsRes.error || !!decksRes.error;
  const lastViewed: Record<string, string> = {};
  for (const v of (viewsRes.data ?? []) as {
    deck_id: string;
    last_viewed_at: string;
  }[]) {
    lastViewed[v.deck_id] = v.last_viewed_at;
  }
  const currentVersion: Record<string, number> = {};
  for (const d of (decksRes.data ?? []) as {
    id: string;
    version: number | null;
  }[]) {
    currentVersion[d.id] =
      typeof d.version === "number" && d.version > 0 ? d.version : 1;
  }
  const counts: Record<string, { total: number; unread: number }> = {};
  for (const c of (commentsRes.data ?? []) as {
    deck_id: string;
    created_at: string;
    version: number | null;
  }[]) {
    // Only count comments on the deck's current version (matches the viewer).
    const cur = currentVersion[c.deck_id];
    if (cur == null || c.version !== cur) continue;
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
  const rows = (data ?? []) as CommentRow[];
  // Security: `author_email` is sent by the browser at insert time, so a user
  // could store someone else's address to spoof who a comment is from. Never
  // display the stored value as-is — re-resolve it from the trustworthy
  // `user_id` (which RLS forces to equal auth.uid()) via the admin auth API.
  // Only fall back to the stored snapshot when the lookup returns nothing — i.e.
  // the author later deleted their account — so a deleted user's comment keeps a
  // sensible name without letting a live user impersonate anyone.
  const authorEmails = await getOwnerEmails(
    rows.map((r) => r.user_id).filter((id): id is string => !!id),
  );
  return {
    rows: rows.map((r) => ({
      ...r,
      author_email: authorEmails[r.user_id] ?? r.author_email,
    })),
    failed: false,
  };
}

// Like getCommentsForDeck, but spanning EVERY version of the deck. The
// conversation feed (P1.2) is a single chronological stream across the whole
// deck history, so it can't be scoped to one version the way the per-slide
// comments panel is. Same explicit access check (own the deck OR a shared_decks
// row) and the same trustworthy author-email re-resolution as the version-scoped
// loader. Ordered OLDEST-first by created_at so the feed reads top → bottom like
// a chat transcript. Returns [] for anonymous / no-access viewers (a legitimate
// empty state, not a failure). Each row keeps its own `version` + `slide_index`,
// so the feed can label a comment "Slide 4 · v2".
export async function getAllCommentsForDeck(
  deckId: string,
  userId: string | null,
): Promise<ListLoad<CommentRow>> {
  if (!userId) return { rows: [], failed: false };
  const supabase = getSupabaseAdmin();
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
    .order("created_at", { ascending: true });
  if (error) {
    logDbError("all comments fetch failed", error);
    return { rows: [], failed: true };
  }
  const rows = (data ?? []) as CommentRow[];
  const authorEmails = await getOwnerEmails(
    rows.map((r) => r.user_id).filter((id): id is string => !!id),
  );
  return {
    rows: rows.map((r) => ({
      ...r,
      author_email: authorEmails[r.user_id] ?? r.author_email,
    })),
    failed: false,
  };
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

// Owner-only curation of a requested (stub) slide: dismiss and/or set the
// owner's edited description. Deck-owner only (note: unlike deleteStub, the
// requester cannot curate — curation shapes the owner's outgoing prompt).
export async function setStubCuration(
  deckId: string,
  stubId: string,
  userId: string,
  patch: { dismissed?: boolean; owner_edited_body?: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  const supabase = getSupabaseAdmin();

  const { data: stub, error: readErr } = await supabase
    .from("slide_stubs")
    .select("id, deck_id")
    .eq("id", stubId)
    .maybeSingle();
  if (readErr) {
    console.error("[slide-store] stub read failed:", readErr);
    return { ok: false, reason: "error" };
  }
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
  if (!deck || deck.user_id !== userId) {
    return { ok: false, reason: "forbidden" };
  }

  const update: { dismissed?: boolean; owner_edited_body?: string | null } = {};
  if (typeof patch.dismissed === "boolean") update.dismissed = patch.dismissed;
  if ("owner_edited_body" in patch) {
    update.owner_edited_body = patch.owner_edited_body;
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const { error: updErr } = await supabase
    .from("slide_stubs")
    .update(update)
    .eq("id", stubId);
  if (updErr) {
    console.error("[slide-store] stub curation update failed:", updErr);
    return { ok: false, reason: "error" };
  }
  return { ok: true };
}

// Owner-only curation of a removal flag: dismiss and/or set the owner's edited
// reason. Deck-owner only; the original flagger's `reason` is never touched.
export async function setFlagCuration(
  deckId: string,
  flagId: string,
  userId: string,
  patch: { dismissed?: boolean; owner_edited_reason?: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  const supabase = getSupabaseAdmin();

  const { data: flag, error: readErr } = await supabase
    .from("slide_flags")
    .select("id, deck_id")
    .eq("id", flagId)
    .maybeSingle();
  if (readErr) {
    console.error("[slide-store] flag read failed:", readErr);
    return { ok: false, reason: "error" };
  }
  if (!flag || flag.deck_id !== deckId) {
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

  const update: { dismissed?: boolean; owner_edited_reason?: string | null } =
    {};
  if (typeof patch.dismissed === "boolean") update.dismissed = patch.dismissed;
  if ("owner_edited_reason" in patch) {
    update.owner_edited_reason = patch.owner_edited_reason;
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const { error: updErr } = await supabase
    .from("slide_flags")
    .update(update)
    .eq("id", flagId);
  if (updErr) {
    console.error("[slide-store] flag curation update failed:", updErr);
    return { ok: false, reason: "error" };
  }
  return { ok: true };
}

// When a new version is saved in response to feedback (the MCP update_deck
// flow), the feedback that was acted on should stop showing as outstanding.
// Comments are already version-scoped — they don't carry into the new version —
// but requested slides (stubs) and removal flags are per-deck, so they'd
// otherwise linger on every version (e.g. a fulfilled "add a title slide"
// placeholder sitting next to the slide that now fulfils it).
//
// This marks the INCLUDED (non-dismissed) stubs and flags for the deck as
// RESOLVED — i.e. exactly the items that were sent to the assistant as feedback.
// Resolving sets `resolved_at` (non-destructive: the record is kept for audit
// and could be re-opened by clearing the field); they stop showing as open via
// the resolved_at filter in getStubsForDeck/getFlagsForDeck. Dismissed items
// (parked, never sent) and already-resolved items are left untouched, so this is
// idempotent. Comments need no handling here — they're version-scoped and fall
// out of the next version automatically.
//
// Graceful fallback: before the resolved_at migration is applied, the update
// errors with a missing-column code; we then fall back to the previous
// destructive DELETE so behaviour is identical to before the migration.
//
// Best-effort: returns how many of each were resolved; failures are logged, not
// thrown, so a resolution hiccup can never undo an already-saved revision. The
// caller is responsible for having verified the user owns the deck.
export async function clearAddressedFeedback(
  deckId: string,
): Promise<{ stubs: number; flags: number }> {
  const supabase = getSupabaseAdmin();
  const result = { stubs: 0, flags: 0 };
  const now = new Date().toISOString();

  for (const table of ["slide_stubs", "slide_flags"] as const) {
    const key = table === "slide_stubs" ? "stubs" : "flags";
    const { data, error } = await supabase
      .from(table)
      .update({ resolved_at: now })
      .eq("deck_id", deckId)
      .eq("dismissed", false)
      .is("resolved_at", null)
      .select("id");
    if (error && isMissingColumnError(error)) {
      // Pre-migration fallback: the old destructive behaviour.
      const del = await supabase
        .from(table)
        .delete()
        .eq("deck_id", deckId)
        .eq("dismissed", false)
        .select("id");
      if (del.error) {
        console.error(
          `[slide-store] clear addressed ${key} (delete fallback) failed:`,
          del.error,
        );
      } else {
        result[key] = del.data?.length ?? 0;
      }
    } else if (error) {
      console.error(`[slide-store] resolve addressed ${key} failed:`, error);
    } else {
      result[key] = data?.length ?? 0;
    }
  }

  return result;
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
  /** Owner curation: excluded from the Claude prompt (still shown). */
  dismissed: boolean;
  /** Owner curation: owner's edited description sent to Claude (overrides the
   *  composed title/subtitle/body line). null = unedited. */
  owner_edited_body: string | null;
  /** When a deck revision addressed this request (set by clearAddressedFeedback).
   *  null = still open. Optional because most callers don't select it. Loaded by
   *  getStubsForDeck only when `includeResolved` is set (the feed). */
  resolved_at?: string | null;
};

export async function getStubsForDeck(
  deckId: string,
  opts: { includeResolved?: boolean } = {},
): Promise<ListLoad<StubRow>> {
  const supabase = getSupabaseAdmin();
  const baseCols =
    "id, deck_id, position, title, subtitle, body, requested_by, created_at, dismissed, owner_edited_body";
  // By default only OPEN requested slides (resolved_at IS NULL) — resolved ones
  // are kept for audit. The FEED passes includeResolved to ALSO load resolved
  // ones (shown struck-through "✓ Addressed in vN"). `withResolved` selects +
  // filters on the column; on a missing-column error (pre-migration) we retry
  // without it — graceful, and then everything reads as open.
  const run = (withResolved: boolean) => {
    const cols: string = withResolved ? `${baseCols}, resolved_at` : baseCols;
    let q = supabase.from("slide_stubs").select(cols).eq("deck_id", deckId);
    if (withResolved && !opts.includeResolved) q = q.is("resolved_at", null);
    return q
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
  };
  let { data, error } = await run(true);
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await run(false));
  }
  if (error) {
    // Any error here — including a missing slide_stubs table (migration not
    // run) — is a real failure. Surface it instead of returning a fake empty.
    logDbError("stubs fetch failed", error);
    return { rows: [], failed: true };
  }
  const rows = (data ?? []) as unknown as (Omit<StubRow, "requested_by_email"> & {
    resolved_at?: string | null;
  })[];
  const emails = await getOwnerEmails(
    rows.map((r) => r.requested_by).filter((id): id is string => !!id),
  );
  return {
    rows: rows.map((r) => ({
      ...r,
      resolved_at: r.resolved_at ?? null,
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

// Edit a requested slide's structured fields (title / subtitle / body). Unlike
// the owner-only dismiss/curation path (setStubCuration), editing is allowed for
// the REQUESTER or the deck OWNER — same access rule as deleteStub — because the
// request is now a shared, directly-editable draft (no separate owner override).
// Writing fields also clears any legacy owner_edited_body so the structured
// fields are the single source of truth for what's shown and sent to Claude.
export async function editStubFields(
  deckId: string,
  stubId: string,
  userId: string,
  fields: { title: string; subtitle: string; body: string },
): Promise<{ ok: boolean; reason?: string }> {
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

  // Need at least a title or some content — mirror the create-form validation.
  const title = fields.title.trim();
  const subtitle = fields.subtitle.trim();
  const body = fields.body.trim();
  if (!title && !body) {
    return { ok: false, reason: "empty" };
  }

  const { error: updErr } = await supabase
    .from("slide_stubs")
    .update({
      title: title || null,
      subtitle: subtitle || null,
      body: body || null,
      owner_edited_body: null,
    })
    .eq("id", stubId);
  if (updErr) {
    console.error("[slide-store] stub edit failed:", updErr);
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
  /** Owner curation: excluded from the Claude prompt (still shown). */
  dismissed: boolean;
  /** Owner curation: owner's edited removal reason sent to Claude. null =
   *  unedited (the original flagger's reason stays in `reason`). */
  owner_edited_reason: string | null;
  /** When a deck revision addressed this flag (set by clearAddressedFeedback).
   *  null = still open. Optional; loaded by getFlagsForDeck only when
   *  `includeResolved` is set (the feed). */
  resolved_at?: string | null;
};

export async function getFlagsForDeck(
  deckId: string,
  opts: { includeResolved?: boolean } = {},
): Promise<ListLoad<FlagRow>> {
  const supabase = getSupabaseAdmin();
  const baseCols =
    "id, deck_id, slide_index, reason, flagged_by, created_at, dismissed, owner_edited_reason";
  // By default only OPEN flags; the FEED passes includeResolved to ALSO load
  // resolved ones (shown struck-through). Drop the column entirely if it isn't
  // migrated yet (graceful fallback → everything reads as open).
  const run = (withResolved: boolean) => {
    const cols: string = withResolved ? `${baseCols}, resolved_at` : baseCols;
    let q = supabase.from("slide_flags").select(cols).eq("deck_id", deckId);
    if (withResolved && !opts.includeResolved) q = q.is("resolved_at", null);
    return q.order("created_at", { ascending: true });
  };
  let { data, error } = await run(true);
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await run(false));
  }
  if (error) {
    // Any error here — including a missing slide_flags table (migration not
    // run) — is a real failure, not "no flags".
    logDbError("flags fetch failed", error);
    return { rows: [], failed: true };
  }
  const rows = (data ?? []) as unknown as (Omit<FlagRow, "flagged_by_email"> & {
    resolved_at?: string | null;
  })[];
  const emails = await getOwnerEmails(
    rows.map((r) => r.flagged_by).filter((id): id is string => !!id),
  );
  return {
    rows: rows.map((r) => ({
      ...r,
      resolved_at: r.resolved_at ?? null,
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
