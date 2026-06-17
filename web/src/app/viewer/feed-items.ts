import type {
  CommentRow,
  DeckVersionRow,
  FlagRow,
  StubRow,
} from "@/lib/slide-store";

// The conversation feed (P1.2) is a single chronological stream for a deck,
// composed from data we ALREADY store — no new tables. Four event kinds flow
// into one ordered list:
//   • version — "Deck v2 shared · 12 slides" (deck_versions)
//   • comment — a comment left on a slide (comments, across all versions)
//   • stub    — a requested new slide (slide_stubs)
//   • flag    — a slide flagged for removal (slide_flags)
//
// This module is PURE (no React, no I/O) so it's trivially testable — same shape
// as display-items.ts / arrival-activity.ts. Ordering is OLDEST-first so the
// feed reads top → bottom like a chat transcript (founder's choice, 2026-06-16).

/** The version that resolved a feedback item ("✓ Addressed in v3"). */
export type AddressedRef = { version: number; at: string };

export type FeedItem =
  | {
      kind: "version";
      key: string;
      at: string;
      version: number;
      slideCount: number | null;
      title: string | null;
      /** Who published this version (user id) — resolved to a name by the feed. */
      createdBy: string | null;
      /** Which AI produced it ("claude" | "chatgpt" | …); null = unknown. */
      source: string | null;
    }
  | {
      kind: "comment";
      key: string;
      at: string;
      comment: CommentRow;
      /** Comments have no resolution column → always null. */
      addressedIn: AddressedRef | null;
    }
  | {
      kind: "stub";
      key: string;
      at: string;
      stub: StubRow;
      /** The version that addressed this request, if any (from resolved_at). */
      addressedIn: AddressedRef | null;
    }
  | {
      kind: "flag";
      key: string;
      at: string;
      flag: FlagRow;
      addressedIn: AddressedRef | null;
    };

// When two events share a timestamp, fall back to this order so a version event
// sorts before the feedback written against it, and the sequence is stable.
const KIND_ORDER: Record<FeedItem["kind"], number> = {
  version: 0,
  comment: 1,
  stub: 2,
  flag: 3,
};

export function buildFeedItems(input: {
  versions: DeckVersionRow[];
  comments: CommentRow[];
  stubs: StubRow[];
  flags: FlagRow[];
}): FeedItem[] {
  const items: FeedItem[] = [];

  // Collapse any duplicate version NUMBERS (defensive — a re-publish glitch
  // could leave two rows for the same version; the feed should show one line).
  const seenVersions = new Set<number>();
  for (const v of input.versions) {
    if (seenVersions.has(v.version)) continue;
    seenVersions.add(v.version);
    items.push({
      kind: "version",
      key: `version:${v.id}`,
      at: v.created_at,
      version: v.version,
      slideCount: v.slide_count,
      title: v.title,
      createdBy: v.created_by,
      source: v.source,
    });
  }
  for (const c of input.comments) {
    items.push({ kind: "comment", key: `comment:${c.id}`, at: c.created_at, comment: c, addressedIn: null });
  }
  for (const s of input.stubs) {
    items.push({ kind: "stub", key: `stub:${s.id}`, at: s.created_at, stub: s, addressedIn: null });
  }
  for (const f of input.flags) {
    items.push({ kind: "flag", key: `flag:${f.id}`, at: f.created_at, flag: f, addressedIn: null });
  }

  const sorted = items.sort(
    (a, b) =>
      a.at.localeCompare(b.at) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.key.localeCompare(b.key),
  );

  // Final dedupe by key (defensive): the same row id must never produce two
  // cards, whatever the input arrays contain.
  const seenKeys = new Set<string>();
  return sorted.filter((it) => {
    if (seenKeys.has(it.key)) return false;
    seenKeys.add(it.key);
    return true;
  });
}

// Whether two adjacent feed items fall on different calendar days, so the feed
// can drop a date divider between them (the "Yesterday" / "Jun 14" separators).
// Compares LOCAL calendar days — the same frame the relative-time labels use.
export function isNewDay(prevIso: string | null, currentIso: string): boolean {
  if (!prevIso) return true;
  const a = new Date(prevIso);
  const b = new Date(currentIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return (
    a.getFullYear() !== b.getFullYear() ||
    a.getMonth() !== b.getMonth() ||
    a.getDate() !== b.getDate()
  );
}

// A friendly day label for a divider: "Today", "Yesterday", else a short date
// like "Jun 14". `now` is injected for testability.
export function dayLabel(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date(now);
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  const startOfThatDay = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
  ).getTime();
  if (startOfThatDay === startOfToday) return "Today";
  if (startOfThatDay === startOfToday - oneDay) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Version spine (P1.2 round structure) ─────────────────────────────────────
// Versions are the BACKBONE of the feed: each version is a "round break", and
// the conversation that happened DURING that round (comments/requests/flags)
// belongs under it. A round = one version + the items whose created_at falls in
// [thisVersion.created_at, nextVersion.created_at). Rounds are oldest-first so
// the spine reads top → bottom; the UI opens scrolled to the current round.

export type ConvItem = Extract<FeedItem, { kind: "comment" | "stub" | "flag" }>;

export type FeedRound = {
  version: DeckVersionRow;
  isCurrent: boolean;
  /** Conversation items during this round, oldest-first. */
  items: ConvItem[];
};

// The version that addressed a feedback item: the LATEST version created at/
// before its resolved_at (clearAddressedFeedback stamps resolved_at just AFTER
// the addressing version's snapshot, so "<=" picks that version, not the next).
function addressedRefFor(
  resolvedAt: string | null | undefined,
  versionsAsc: DeckVersionRow[],
): AddressedRef | null {
  if (!resolvedAt) return null;
  const t = Date.parse(resolvedAt);
  if (Number.isNaN(t)) return null;
  let ref: AddressedRef | null = null;
  for (const v of versionsAsc) {
    if (Date.parse(v.created_at) <= t) ref = { version: v.version, at: v.created_at };
    else break;
  }
  // Resolved before any known version (shouldn't happen) → attribute to the first.
  if (!ref && versionsAsc.length)
    ref = { version: versionsAsc[0].version, at: versionsAsc[0].created_at };
  return ref;
}

function buildConvItems(
  input: { comments: CommentRow[]; stubs: StubRow[]; flags: FlagRow[] },
  versionsAsc: DeckVersionRow[],
): ConvItem[] {
  const items: ConvItem[] = [];
  for (const c of input.comments)
    items.push({ kind: "comment", key: `comment:${c.id}`, at: c.created_at, comment: c, addressedIn: null });
  for (const s of input.stubs)
    items.push({ kind: "stub", key: `stub:${s.id}`, at: s.created_at, stub: s, addressedIn: addressedRefFor(s.resolved_at, versionsAsc) });
  for (const f of input.flags)
    items.push({ kind: "flag", key: `flag:${f.id}`, at: f.created_at, flag: f, addressedIn: addressedRefFor(f.resolved_at, versionsAsc) });
  const sorted = items.sort(
    (a, b) =>
      a.at.localeCompare(b.at) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.key.localeCompare(b.key),
  );
  const seen = new Set<string>();
  return sorted.filter((it) => (seen.has(it.key) ? false : (seen.add(it.key), true)));
}

export function buildVersionSpine(input: {
  versions: DeckVersionRow[];
  comments: CommentRow[];
  stubs: StubRow[];
  flags: FlagRow[];
}): FeedRound[] {
  // De-dupe version numbers, oldest-first.
  const seenV = new Set<number>();
  const versionsAsc = [...input.versions]
    .sort((a, b) => a.version - b.version || a.created_at.localeCompare(b.created_at))
    .filter((v) => (seenV.has(v.version) ? false : (seenV.add(v.version), true)));
  if (versionsAsc.length === 0) return [];

  const currentVersion = versionsAsc[versionsAsc.length - 1].version;
  const rounds: FeedRound[] = versionsAsc.map((v) => ({
    version: v,
    isCurrent: v.version === currentVersion,
    items: [],
  }));

  const lastIdx = versionsAsc.length - 1;
  const items = buildConvItems(input, versionsAsc);
  for (const item of items) {
    const t = Date.parse(item.at);
    // Latest version whose created_at <= the item's time → the round it happened
    // during; items before v1 fall into v1's round (index 0).
    let idx = 0;
    for (let i = 0; i < versionsAsc.length; i++) {
      if (Date.parse(versionsAsc[i].created_at) <= t) idx = i;
      else break;
    }
    // COMMENTS have no resolved_at column, but a comment made during a PAST round
    // was responded to by the NEXT version the AI published — so it's "addressed
    // in v(idx+1)" (the read-only twin of resolution, derived from the version
    // timeline). Comments in the current round, or dismissed ones, stay as-is.
    if (
      item.kind === "comment" &&
      !item.comment.dismissed &&
      idx < lastIdx
    ) {
      const next = versionsAsc[idx + 1];
      item.addressedIn = { version: next.version, at: next.created_at };
    }
    rounds[idx].items.push(item);
  }
  return rounds;
}
