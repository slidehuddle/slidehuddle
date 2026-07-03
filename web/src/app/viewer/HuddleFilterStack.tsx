"use client";

// The spectrum's HUDDLERS-AS-FILTER stack (Slice 3, founder mock 2026-07-03):
// ONE floating vertical pill at the TOP of the far-left edge that is both the
// "who's in this huddle" display AND the feed filter — clicking a face filters
// the feed to that contributor's items (everything else HIDES); clicking again
// (or the chip's ✕ in the feed) clears. Visible in split/feed modes only —
// deck mode is focused commenting, so the stack disappears entirely there
// (FloatingViewer gates it).
//
// Order (founder call 2026-07-03): YOU first (rendered as the account-identity
// person icon + green dot via <Avatar self> so you stand out — same face as
// your feed cards), then the AI's model mark (Claude/ChatGPT logo — the
// human/AI collaboration made visible; clicking filters to its versions), then
// everyone else (owner first, then by contribution count). A dashed "+" at the
// bottom is the "add another one" seat — it copies the share link with the
// same toast as the Share button (CopyLinkButton variant="invite").
//
// Anatomy (all round): a teal person-icon + total count on top; teal COUNT
// badge bottom-right of each face = that person's ACTIONABLE contributions
// (the CURRENT round's live comments + open requests + open flags — the ones
// the next revision acts on, founder call 2026-07-03), "9+" cap; selected = a
// teal halo; everyone else dims. (Reserved, not built: green "online now" dots
// for others — needs the presence system, parked.)
//
// Identity note: this renders ONLY for signed-in viewers — participants is []
// for anonymous link-holders, and FloatingViewer also gates on currentUserId,
// so no identity ever reaches an anonymous viewer.

import type { DeckParticipant } from "@/lib/slide-store";
import Avatar from "./Avatar";
import CopyLinkButton from "./CopyLinkButton";
import { AiMark, aiName } from "./VersionSpineEvent";
import { nameFromEmail } from "./FeedItemCard";

const MAX_SHOWN = 8;

/** Sentinel "userId" for filtering to the AI's versions (matches no real
 *  author, so every human card hides and the version spine stands alone). */
export const AI_FILTER_ID = "__ai__";

function countBadge(count: number) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute -bottom-1 -right-1 z-[1] flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-0.5 text-[9px] font-semibold leading-none ring-2 ring-white"
      style={{ backgroundColor: "#0F6E56", color: "#ffffff" }}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export default function HuddleFilterStack({
  participants,
  deckOwnerId,
  currentUserId,
  aiSource,
  aiVersionCount,
  counts,
  filterUserId,
  onToggle,
}: {
  participants: DeckParticipant[];
  deckOwnerId: string | null;
  /** The signed-in viewer — pinned on top as the account-identity avatar. */
  currentUserId: string | null;
  /** The AI's provenance ("claude"/"chatgpt"/null) from the latest version that
   *  recorded one — picks the model mark; null → the generic AI mark. */
  aiSource: string | null;
  /** How many versions the AI has published (its "contributions" — the purple
   *  badge on its mark). */
  aiVersionCount: number;
  /** userId → ACTIONABLE contribution count (current round, live). */
  counts: Map<string, number>;
  /** The active filter: a participant's userId, AI_FILTER_ID, or null. */
  filterUserId: string | null;
  /** Toggle the filter to/off this person (or AI_FILTER_ID). */
  onToggle: (userId: string) => void;
}) {
  if (participants.length === 0) return null;

  // YOU first; then the others — owner first, then by contribution count.
  const you = participants.find((p) => p.userId === currentUserId) ?? null;
  const others = participants
    .filter((p) => p.userId !== currentUserId)
    .sort(
      (a, b) =>
        Number(b.userId === deckOwnerId) - Number(a.userId === deckOwnerId) ||
        (counts.get(b.userId) ?? 0) - (counts.get(a.userId) ?? 0) ||
        a.userId.localeCompare(b.userId),
    );
  const shownOthers = others.slice(0, MAX_SHOWN - (you ? 1 : 0));
  const overflow = others.length - shownOthers.length;

  // The teal filter halo (avatars no longer carry an owner ring, so one halo
  // fits all).
  const haloFor = (selected: boolean) =>
    selected ? "0 0 0 2px #ffffff, 0 0 0 4.5px #0F6E56" : undefined;

  const renderPerson = (p: DeckParticipant, isSelf: boolean) => {
    const selected = filterUserId === p.userId;
    const dimmed = filterUserId !== null && !selected;
    const count = counts.get(p.userId) ?? 0;
    const name = isSelf ? "you" : nameFromEmail(p.email);
    const isOwner = p.userId === deckOwnerId;
    // Tooltips (founder call 2026-07-03): YOU reads "You — {email}"; the owner
    // is NAMED the deck owner alongside their email (the ring/star alone
    // wasn't clear).
    const who = isSelf ? `You — ${p.email ?? ""}` : name;
    const ownerTag = isOwner ? ` · deck owner${!isSelf && p.email ? ` — ${p.email}` : ""}` : "";
    return (
      <button
        key={p.userId}
        type="button"
        onClick={() => onToggle(p.userId)}
        aria-pressed={selected}
        aria-label={`${selected ? "Stop filtering to" : "Filter the feed to"} ${name}${isOwner ? " (owner)" : ""}`}
        title={`${who}${ownerTag} · ${count} to action`}
        className="relative rounded-full transition-[transform,opacity,filter] duration-150 hover:scale-110"
        style={{
          boxShadow: haloFor(selected),
          opacity: dimmed ? 0.35 : 1,
          filter: dimmed ? "grayscale(0.7)" : undefined,
        }}
      >
        <Avatar
          userId={p.userId}
          ownerId={deckOwnerId}
          email={p.email}
          self={isSelf}
          size={32}
        />
        {countBadge(count)}
      </button>
    );
  };

  const aiSelected = filterUserId === AI_FILTER_ID;
  const aiDimmed = filterUserId !== null && !aiSelected;
  const ai = aiName(aiSource);

  return (
    <div
      role="group"
      aria-label="Huddlers — click one to filter the feed to their feedback"
      className="flex flex-col items-center gap-3 rounded-full border border-black/[0.06] bg-white/90 px-1.5 py-3 shadow-[0_6px_22px_rgba(0,0,0,0.10)] backdrop-blur-md"
    >
      <span
        aria-hidden="true"
        className="flex items-center gap-0.5 leading-none"
        style={{ color: "#0F6E56" }}
        title={`${participants.length} Huddler${participants.length === 1 ? "" : "s"}`}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span className="text-[10px] font-semibold">{participants.length}</span>
      </span>

      {/* You — pinned on top, the account identity (person icon + green dot). */}
      {you && renderPerson(you, true)}

      {/* Hairline under YOU — you vs the rest of the huddle. */}
      {you && (
        <span aria-hidden="true" className="h-px w-6 rounded-full bg-black/10" />
      )}

      {/* The AI — the model that publishes the versions, right under you (the
          human/AI pair). Its purple badge counts the versions it published.
          Clicking filters the feed to ITS contributions: the version spine
          alone (every human card hides). */}
      <button
        type="button"
        onClick={() => onToggle(AI_FILTER_ID)}
        aria-pressed={aiSelected}
        aria-label={`${aiSelected ? "Stop filtering to" : "Filter the feed to"} ${ai}'s versions`}
        title={`${ai} · published ${aiVersionCount} version${aiVersionCount === 1 ? "" : "s"}`}
        className="relative rounded-full transition-[transform,opacity,filter] duration-150 hover:scale-110"
        style={{
          boxShadow: aiSelected
            ? "0 0 0 2px #ffffff, 0 0 0 4.5px #0F6E56"
            : undefined,
          opacity: aiDimmed ? 0.35 : 1,
          filter: aiDimmed ? "grayscale(0.7)" : undefined,
        }}
      >
        {/* Same 32px footprint as the avatars, so its version badge lines up
            vertically with the collaborators' comment badges. */}
        <AiMark source={aiSource} size={32} />
        {aiVersionCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -bottom-1 -right-1 z-[1] flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-0.5 text-[9px] font-semibold leading-none ring-2 ring-white"
            style={{ backgroundColor: "#4A3FB5", color: "#ffffff" }}
          >
            {aiVersionCount > 9 ? "9+" : aiVersionCount}
          </span>
        )}
      </button>

      {shownOthers.map((p) => renderPerson(p, false))}
      {overflow > 0 && (
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold select-none"
          style={{ backgroundColor: "#CFE9E0", color: "#085041" }}
          title={`${overflow} more`}
        >
          +{overflow}
        </span>
      )}

      {/* The empty seat — invite someone: copies the share link with the same
          toast as the top-right Share button (one copy of that logic). */}
      <CopyLinkButton variant="invite" />
    </div>
  );
}
