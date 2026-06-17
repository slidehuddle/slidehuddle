"use client";

// ONE reusable horizontal feed card, type-aware (comment / requested-slide /
// removal-flag). Layout: slide THUMBNAIL left · content middle · slide PILL
// top-right. The avatar shows WHO; the type icon + thumbnail show WHAT. The
// whole card is the click target — selecting it rings the card and drives the
// deck peek (the feed is read-only, so there's nothing else to click inside).
//
// Narrow screens: the thumbnail stacks ABOVE the text (flex-col < sm).
//
// Thumbnails use the CHEAP path: a scaled-down live render of the slide HTML in
// a sandboxed iframe (the same pattern as FloatingThumbnailStrip's SlideThumb).
// The comment/flag thumbnails show the CURRENT version's slide at that index
// (older-version HTML isn't loaded client-side) — fine as a deck anchor.

import type { ParsedDeck } from "./parse-deck";
import type { FeedItem } from "./feed-items";
import { formatRelativeTime } from "@/lib/relative-time";
import Avatar from "./Avatar";

const THUMB_W = 140;

// ── icons (inline SVG — the app doesn't load the Tabler webfont) ────────────
function IconComment({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
    </svg>
  );
}
function IconStub({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}
function IconFlag({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}
function ArrowDown() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}

// ── thumbnail ───────────────────────────────────────────────────────────────
function thumbBox(deck: ParsedDeck) {
  const ar = (deck.slideWidth || 16) / (deck.slideHeight || 9);
  return { width: THUMB_W, height: Math.round(THUMB_W / ar), scale: THUMB_W / (deck.slideWidth || 1) };
}

function SlidePlaceholder({ n, height }: { n: number; height: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-border bg-[#f6f6fa] text-[11px] font-semibold text-muted"
      style={{ width: THUMB_W, height }}
    >
      Slide {n}
    </div>
  );
}

// A real-slide thumbnail (clean, or greyed-with-X for a removal flag).
function RealSlideThumb({
  deck,
  srcDoc,
  slideNumber,
  removed,
}: {
  deck: ParsedDeck;
  srcDoc: string;
  slideNumber: number;
  removed: boolean;
}) {
  const { width, height, scale } = thumbBox(deck);
  if (!srcDoc) return <SlidePlaceholder n={slideNumber} height={height} />;
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border bg-white"
      style={{ width, height }}
    >
      <iframe
        title={`Slide ${slideNumber}`}
        srcDoc={srcDoc}
        sandbox=""
        scrolling="no"
        tabIndex={-1}
        aria-hidden="true"
        className="origin-top-left border-0 bg-white pointer-events-none"
        style={{
          width: deck.slideWidth,
          height: deck.slideHeight,
          transform: `scale(${scale})`,
          filter: removed ? "grayscale(1)" : undefined,
          opacity: removed ? 0.55 : 1,
        }}
      />
      {removed && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#fbe9e1]/35">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#C2410C" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </div>
      )}
    </div>
  );
}

// The requested-slide preview, rendered FROM ITS 3 INPUTS (no real slide exists
// yet): a dashed-teal mini "slide" — title as a small heading, subtitle beneath,
// body as a couple of muted lines. Evokes the slide, not a faithful render.
function StubPreviewThumb({
  deck,
  title,
  subtitle,
  body,
}: {
  deck: ParsedDeck;
  title: string | null;
  subtitle: string | null;
  body: string | null;
}) {
  const { width, height } = thumbBox(deck);
  return (
    <div
      className="flex flex-col gap-1 overflow-hidden rounded-lg p-2"
      style={{ width, height, border: "1.5px dashed #5DCAA5", backgroundColor: "#F6FBF9" }}
    >
      <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "#0F6E56" }}>
        Requested
      </span>
      <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-[#0b3a2f]">
        {title?.trim() || "Untitled slide"}
      </span>
      {subtitle?.trim() && (
        <span className="line-clamp-1 text-[9px] leading-tight text-[#3f6b5e]">
          {subtitle}
        </span>
      )}
      {body?.trim() ? (
        <span className="line-clamp-2 text-[8.5px] leading-snug text-[#6b8f83]">
          {body}
        </span>
      ) : (
        <span className="mt-auto flex flex-col gap-0.5" aria-hidden="true">
          <span className="h-1 w-3/4 rounded-full bg-[#cdeae0]" />
          <span className="h-1 w-1/2 rounded-full bg-[#cdeae0]" />
        </span>
      )}
    </div>
  );
}

// ── small pieces ────────────────────────────────────────────────────────────
function TypeChip({ kind }: { kind: "comment" | "stub" | "flag" }) {
  const map = {
    comment: { label: "Comment", color: "#0F6E56", bg: "#E1F5EE", Icon: IconComment },
    stub: { label: "Requested slide", color: "#0F6E56", bg: "#E1F5EE", Icon: IconStub },
    flag: { label: "Flag for removal", color: "#9A3412", bg: "#FBE9E1", Icon: IconFlag },
  }[kind];
  const Icon = map.Icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
      style={{ backgroundColor: map.bg, color: map.color }}
    >
      <Icon color={map.color} />
      {map.label}
    </span>
  );
}

// The slide pill, top-right. Type-aware content: comment/flag → "Slide N"; a
// requested slide goes BETWEEN slides → "After slide N" with a down-arrow (never
// "Slide N", the slide doesn't exist yet).
function SlidePill({
  kind,
  slideNumber,
  position,
}: {
  kind: "comment" | "stub" | "flag";
  slideNumber: number;
  position: number;
}) {
  const pill =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap";
  const style = { backgroundColor: "#F1EFE8", color: "#5F5E5A" };
  if (kind === "stub") {
    return (
      <span className={pill} style={style}>
        <ArrowDown />
        {position <= 0 ? "Before slide 1" : `After slide ${position}`}
      </span>
    );
  }
  return (
    <span className={pill} style={style}>
      Slide {slideNumber}
    </span>
  );
}

// ── the card ────────────────────────────────────────────────────────────────
export default function FeedItemCard({
  item,
  deck,
  slideSrcDocs,
  deckOwnerId,
  currentUserId,
  selected,
  onSelect,
  onAddressedClick,
}: {
  item: Extract<FeedItem, { kind: "comment" | "stub" | "flag" }>;
  deck: ParsedDeck;
  /** current-version slide srcDocs, indexed by slide index (memoised upstream) */
  slideSrcDocs: string[];
  deckOwnerId: string | null;
  /** The signed-in viewer's id — adds a "(you)" tag next to their own name. */
  currentUserId: string | null;
  selected: boolean;
  onSelect: () => void;
  /** Jump to the version that addressed this item (the "✓ Addressed in vN" tag). */
  onAddressedClick?: (version: number) => void;
}) {
  // Resolve WHO + the content + the anchor slide, per type.
  let who: { userId: string | null; email: string | null };
  let kind: "comment" | "stub" | "flag";
  let slideIndex: number; // real slide this anchors to (for the pill / thumbnail)
  let position = 0;
  let createdAt: string;
  let dismissed = false;
  let content: React.ReactNode;
  let thumb: React.ReactNode;

  if (item.kind === "comment") {
    const c = item.comment;
    kind = "comment";
    who = { userId: c.user_id, email: c.author_email };
    slideIndex = c.slide_index;
    createdAt = c.created_at;
    dismissed = c.dismissed;
    thumb = (
      <RealSlideThumb deck={deck} srcDoc={slideSrcDocs[c.slide_index] ?? ""} slideNumber={c.slide_index + 1} removed={false} />
    );
    content = (
      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-[#33333a]">
        {c.body}
      </p>
    );
  } else if (item.kind === "stub") {
    const s = item.stub;
    kind = "stub";
    who = { userId: s.requested_by, email: s.requested_by_email };
    position = s.position;
    slideIndex = Math.max(0, s.position - 1);
    createdAt = s.created_at;
    dismissed = s.dismissed;
    thumb = <StubPreviewThumb deck={deck} title={s.title} subtitle={s.subtitle} body={s.body} />;
    content = (
      <div>
        <p className="text-sm font-semibold text-[#1d1d1b] break-words">
          {s.title?.trim() || "Untitled slide"}
        </p>
        {s.subtitle?.trim() && (
          <p className="text-sm text-muted break-words">{s.subtitle}</p>
        )}
        {s.body?.trim() && (
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted break-words whitespace-pre-wrap">
            {s.body}
          </p>
        )}
      </div>
    );
  } else {
    const f = item.flag;
    kind = "flag";
    who = { userId: f.flagged_by, email: f.flagged_by_email };
    slideIndex = f.slide_index;
    createdAt = f.created_at;
    dismissed = f.dismissed;
    thumb = (
      <RealSlideThumb deck={deck} srcDoc={slideSrcDocs[f.slide_index] ?? ""} slideNumber={f.slide_index + 1} removed />
    );
    content = f.reason?.trim() ? (
      <p className="text-sm leading-relaxed text-[#33333a] break-words">{f.reason}</p>
    ) : (
      <p className="text-sm italic text-muted">No reason given.</p>
    );
  }

  const name = nameFromEmail(who.email);
  // "(you)" for the signed-in viewer, "(owner)" for the deck owner — both when
  // they're the same person, e.g. "Greg (you · owner)".
  const tags = [
    currentUserId && who.userId === currentUserId ? "you" : null,
    deckOwnerId && who.userId === deckOwnerId ? "owner" : null,
  ].filter(Boolean);

  // Resolution state: a later version addressed this item, or the owner dismissed
  // it ("Won't action"). Either way the item reads struck-through + dimmed.
  const addressedIn = item.addressedIn;
  const struck = dismissed || !!addressedIn;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex cursor-pointer flex-col gap-3 rounded-xl bg-white p-3 text-left shadow-sm transition-all sm:flex-row ${
        selected ? "ring-2 ring-brand" : "border border-border hover:border-black/20"
      }`}
      style={kind === "flag" ? { borderLeft: "3px solid #C2410C" } : undefined}
    >
      <div className="shrink-0">{thumb}</div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar userId={who.userId} ownerId={deckOwnerId} email={who.email} size={28} />
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
              <span className="text-sm font-semibold text-[#1d1d1b]">{name}</span>
              {tags.length > 0 && (
                <span className="text-xs font-medium text-muted">({tags.join(" · ")})</span>
              )}
              <span className="text-xs text-muted">· {formatRelativeTime(createdAt)}</span>
              <TypeChip kind={kind} />
            </div>
          </div>
          <div className="shrink-0">
            <SlidePill kind={kind} slideNumber={slideIndex + 1} position={position} />
          </div>
        </div>
        <div className={`mt-1.5 ${struck ? "line-through opacity-60" : ""}`}>{content}</div>
        {/* Resolution tag, its own line below the content (matches the design):
            "✓ Addressed in vN →" (links to that version) or "Won't action". */}
        {dismissed ? (
          <p className="mt-1.5 text-[11px] font-medium text-muted">Won&apos;t action</p>
        ) : addressedIn ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddressedClick?.(addressedIn.version);
            }}
            className="mt-1.5 text-[11px] font-semibold hover:underline"
            style={{ color: "#0F6E56" }}
            title={`Jump to v${addressedIn.version}`}
          >
            ✓ Addressed in v{addressedIn.version} →
          </button>
        ) : null}
      </div>
    </div>
  );
}

// "alex.smith@x.com" → "Alex"; falls back to a generic word.
export function nameFromEmail(email: string | null): string {
  if (!email) return "A teammate";
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._+-]+/)[0] ?? local;
  if (!first) return email;
  return first.charAt(0).toUpperCase() + first.slice(1);
}
