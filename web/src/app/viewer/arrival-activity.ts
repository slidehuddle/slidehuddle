// Decide whether to show the floating viewer's "arrival activity" banner — the
// "Alex and Jordan added N comments since you were here" nudge for a RETURNING,
// signed-in viewer. It reuses the exact mechanism the "updated since you last
// viewed" banner relies on: compare the viewer's PREVIOUS deck_views
// .last_viewed_at (read before this visit updates it) against comment
// created_at timestamps. No new query — it runs over the comments the page
// already loaded for the signed-in viewer.
//
// Pure + framework-agnostic so it can be unit-tested, like version-banner.ts.

export type ArrivalActivity = {
  /** How many new comments arrived since the viewer's previous visit. */
  count: number;
  /** Distinct author display names of those comments (owner of the banner copy
   *  decides how many to show). Derived from email, never the raw user id. */
  names: string[];
};

type CommentLike = {
  user_id: string;
  author_email: string | null;
  created_at: string; // ISO
};

// Turn an email into a friendly first-name-ish label ("alex.smith@x.com" →
// "Alex"). Falls back to the whole email, then a generic word, so the banner
// never shows an empty name. Identity only — these are signed-in viewers who
// are part of the deck (anonymous viewers never receive comments to begin with).
function displayNameFromEmail(email: string | null): string {
  if (!email) return "A teammate";
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._+-]+/)[0] ?? local;
  if (!first) return email;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function computeArrivalActivity(args: {
  comments: CommentLike[];
  /** deck_views.last_viewed_at for this viewer, or null if never viewed. */
  lastViewedAt: string | null;
  currentUserId: string | null;
}): ArrivalActivity | null {
  const { comments, lastViewedAt, currentUserId } = args;

  // First-time viewer (no prior visit) → nothing to "catch up" on. No banner.
  if (!lastViewedAt) return null;
  const seenTs = Date.parse(lastViewedAt);
  if (Number.isNaN(seenTs)) return null;

  // New = created after the previous view, and not authored by the viewer
  // themselves (you don't need to catch up on your own comments).
  const fresh = comments.filter((c) => {
    if (currentUserId && c.user_id === currentUserId) return false;
    const ts = Date.parse(c.created_at);
    return !Number.isNaN(ts) && ts > seenTs;
  });
  if (fresh.length === 0) return null;

  // Distinct authors, in first-seen order, deduped by email (falling back to
  // user id so two missing-email authors aren't merged into one).
  const names: string[] = [];
  const seenAuthors = new Set<string>();
  for (const c of fresh) {
    const key = c.author_email ?? c.user_id;
    if (seenAuthors.has(key)) continue;
    seenAuthors.add(key);
    names.push(displayNameFromEmail(c.author_email));
  }

  return { count: fresh.length, names };
}
