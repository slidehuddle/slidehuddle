"use client";

// The spectrum's HUDDLERS-AS-FILTER stack: ONE floating vertical pill at the
// TOP of the far-left edge that is both the "who's in this huddle" display AND
// the feed filter — clicking a face filters the feed to that contributor's
// items (everything else HIDES); clicking again (or the chip's ✕ in the feed)
// clears. Visible in split/feed modes only — deck mode is focused commenting,
// so the stack disappears entirely there (FloatingViewer gates it).
//
// The rail is THE PARTICIPANTS — human and AI alike (founder call 2026-07-04):
// YOU on top (account identity), a hairline, then the AI's model mark
// (Claude/ChatGPT logo or the generic AI square — the human/AI collaboration
// made visible; clicking filters to its versions), then everyone else, then
// the dashed "+" invite seat (copies the share link, CopyLinkButton
// variant="invite"). The AI's seat is always visually distinct from a person
// (a logo/square, never a person-coloured circle) and holds a FIXED seat — it
// is never ranked, dimmed, or given a person colour.
//
// Signal system (design-system §2.5 "Colour discipline", 2026-07-04):
//   • ORDER = CONTRIBUTION — owner pinned first, then collaborators by
//     actionable contribution count DESCENDING; zero-contribution members sink
//     to the bottom, DIMMED (~55%) and chip-less — silence is visible at a
//     glance. The order SETTLES ON LOAD (frozen once the feed data is ready),
//     not live mid-session — no avatars hopping while people comment. Badge
//     numbers stay live; the order catches up on the next load/refresh.
//   • COUNT BADGES are one quiet NEUTRAL style for everyone (soft grey chip,
//     dark text), bottom-right satellite — the AI's version count wears the
//     same grey. No coloured badges: badge colour is a lie.
//   • SELECTION halo is purple (the current selection is the one thing that
//     wears purple, §2.5); non-selected faces dim while a filter is active.
//   • TOOLTIP = name · total · breakdown ("2 comments · 1 request") — and the
//     face is the click-to-filter affordance.
//   • GREEN DOT = ONLINE NOW (built 2026-07-05 — was reserved): whoever has
//     the deck open right now, via useDeckPresence. Dot only — dimming keeps
//     meaning "silent", never "offline" (one visual, one meaning).
// Counts are ACTIONABLE contributions: the CURRENT round's live comments +
// open requests + open flags (founder call 2026-07-03).
//
// Identity note: this renders ONLY for signed-in viewers — participants is []
// for anonymous link-holders, and FloatingViewer also gates on currentUserId,
// so no identity ever reaches an anonymous viewer.

import { useState } from "react";
import type { DeckParticipant } from "@/lib/slide-store";
import Avatar from "./Avatar";
import CopyLinkButton from "./CopyLinkButton";
import { AiMark, aiName } from "./VersionSpineEvent";
import { nameFromEmail } from "./FeedItemCard";

const MAX_SHOWN = 8;

/** Sentinel "userId" for filtering to the AI's versions (matches no real
 *  author, so every human card hides and the version spine stands alone). */
export const AI_FILTER_ID = "__ai__";

/** Per-person actionable contributions, by kind (drives the badge total and
 *  the tooltip breakdown). */
export type ContributionBreakdown = {
  comments: number;
  requests: number;
  removals: number;
};

const ZERO: ContributionBreakdown = { comments: 0, requests: 0, removals: 0 };

function totalOf(b: ContributionBreakdown): number {
  return b.comments + b.requests + b.removals;
}

function breakdownText(b: ContributionBreakdown): string {
  const parts: string[] = [];
  if (b.comments > 0)
    parts.push(`${b.comments} comment${b.comments === 1 ? "" : "s"}`);
  if (b.requests > 0)
    parts.push(`${b.requests} request${b.requests === 1 ? "" : "s"}`);
  if (b.removals > 0)
    parts.push(`${b.removals} removal${b.removals === 1 ? "" : "s"}`);
  return parts.length
    ? parts.join(" · ")
    : "no contributions this round";
}

// The neutral satellite count chip — same size/offset as ever, ONE quiet grey
// style for everyone (people and the AI alike). Nothing at zero: silence is
// carried by the dimmed, chip-less avatar instead.
function countBadge(count: number, label?: string) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      title={label}
      className="absolute -bottom-1 -right-1 z-[1] flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-0.5 text-[9px] font-semibold leading-none ring-2 ring-white"
      style={{ backgroundColor: "#E7E7EA", color: "#3F3F46" }}
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
  countsReady,
  onlineIds,
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
  /** How many versions the AI has published (its grey count badge). */
  aiVersionCount: number;
  /** userId → ACTIONABLE contribution breakdown (current round, live). */
  counts: Map<string, ContributionBreakdown>;
  /** Who has the deck open RIGHT NOW (useDeckPresence) — lights the green
   *  presence dot. Dot only: dimming keeps meaning "silent" (founder call
   *  2026-07-05). */
  onlineIds?: Set<string>;
  /** True once the feed data behind `counts` has loaded — the ordering
   *  freezes at that moment (settles on load, not live mid-session). */
  countsReady: boolean;
  /** The active filter: a participant's userId, AI_FILTER_ID, or null. */
  filterUserId: string | null;
  /** Toggle the filter to/off this person (or AI_FILTER_ID). */
  onToggle: (userId: string) => void;
}) {
  // The order freeze: once counts are ready, snapshot the sorted order and
  // keep it for the session (badges stay live; new joiners append at the
  // bottom until the next load). Uses the render-phase "derive state" pattern
  // so it captures the FIRST ready order, before any live count changes.
  const [frozen, setFrozen] = useState<string[] | null>(null);

  if (participants.length === 0) return null;

  const totalFor = (id: string) => totalOf(counts.get(id) ?? ZERO);

  // YOU first; then the others — owner pinned first, then by contribution
  // count descending (zeros sink to the bottom), userId as a stable tie.
  const you = participants.find((p) => p.userId === currentUserId) ?? null;
  const liveSorted = participants
    .filter((p) => p.userId !== currentUserId)
    .sort(
      (a, b) =>
        Number(b.userId === deckOwnerId) - Number(a.userId === deckOwnerId) ||
        totalFor(b.userId) - totalFor(a.userId) ||
        a.userId.localeCompare(b.userId),
    );
  if (frozen === null && countsReady) {
    setFrozen(liveSorted.map((p) => p.userId));
  }
  const others = frozen
    ? [...liveSorted].sort((a, b) => {
        const ia = frozen.indexOf(a.userId);
        const ib = frozen.indexOf(b.userId);
        return (
          (ia === -1 ? frozen.length : ia) - (ib === -1 ? frozen.length : ib) ||
          a.userId.localeCompare(b.userId)
        );
      })
    : liveSorted;
  const shownOthers = others.slice(0, MAX_SHOWN - (you ? 1 : 0));
  const overflow = others.length - shownOthers.length;

  // The selection halo — purple: the current selection is the one thing that
  // wears purple (design-system §2.5).
  const haloFor = (selected: boolean) =>
    selected ? "0 0 0 2px #ffffff, 0 0 0 4.5px #4A3FB5" : undefined;

  const renderPerson = (p: DeckParticipant, isSelf: boolean) => {
    const selected = filterUserId === p.userId;
    const dimmed = filterUserId !== null && !selected;
    const b = counts.get(p.userId) ?? ZERO;
    const total = totalOf(b);
    const name = isSelf ? "you" : nameFromEmail(p.email);
    const isOwner = p.userId === deckOwnerId;
    // Zero-contribution members read as silent: dimmed (~55%) and chip-less.
    // YOU and the owner never dim this way (you're the viewer; the owner is
    // the pinned anchor) — their silence still shows as a missing chip.
    const silent = !isSelf && !isOwner && total === 0;
    // Tooltips: name · total · breakdown; YOU reads "You — {email}"; the owner
    // is NAMED the deck owner alongside their email.
    const who = isSelf ? `You — ${p.email ?? ""}` : name;
    const ownerTag = isOwner
      ? ` · deck owner${!isSelf && p.email ? ` — ${p.email}` : ""}`
      : "";
    // YOU are by definition here (you're looking at it) → always dotted; the
    // rail is now the ONLY surface that shows presence (content surfaces pass
    // no `online`, so no dots there — founder call 2026-07-05).
    const online = isSelf || !!onlineIds?.has(p.userId);
    const tip = `${who}${ownerTag}${online && !isSelf ? " · online now" : ""} · ${total} to action — ${breakdownText(b)}`;
    return (
      <button
        key={p.userId}
        type="button"
        onClick={() => onToggle(p.userId)}
        aria-pressed={selected}
        aria-label={`${selected ? "Stop filtering to" : "Filter the feed to"} ${name}${isOwner ? " (owner)" : ""}`}
        title={tip}
        className="relative rounded-full transition-[transform,opacity,filter] duration-150 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4A3FB5]"
        style={{
          boxShadow: haloFor(selected),
          opacity: dimmed ? 0.35 : silent ? 0.55 : 1,
          filter: dimmed ? "grayscale(0.7)" : undefined,
        }}
      >
        <Avatar
          userId={p.userId}
          ownerId={deckOwnerId}
          email={p.email}
          self={isSelf}
          online={online}
          size={32}
        />
        {countBadge(total, breakdownText(b))}
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
          human/AI pair, kept deliberately: the rail is the PARTICIPANTS).
          Fixed seat: never ranked, never dimmed for silence, never a person
          colour. Its grey badge counts the versions it published. Clicking
          filters the feed to ITS contributions: the version spine alone
          (every human card hides). */}
      <button
        type="button"
        onClick={() => onToggle(AI_FILTER_ID)}
        aria-pressed={aiSelected}
        aria-label={`${aiSelected ? "Stop filtering to" : "Filter the feed to"} ${ai}'s versions`}
        title={`${ai} · published ${aiVersionCount} version${aiVersionCount === 1 ? "" : "s"}`}
        className="relative rounded-full transition-[transform,opacity,filter] duration-150 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4A3FB5]"
        style={{
          boxShadow: haloFor(aiSelected),
          opacity: aiDimmed ? 0.35 : 1,
          filter: aiDimmed ? "grayscale(0.7)" : undefined,
        }}
      >
        {/* Same 32px footprint as the avatars, so its version badge lines up
            vertically with the collaborators' contribution badges. */}
        <AiMark source={aiSource} size={32} />
        {countBadge(
          aiVersionCount,
          `published ${aiVersionCount} version${aiVersionCount === 1 ? "" : "s"}`,
        )}
      </button>

      {shownOthers.map((p) => renderPerson(p, false))}
      {overflow > 0 && (
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold select-none"
          style={{ backgroundColor: "#E7E7EA", color: "#3F3F46" }}
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
