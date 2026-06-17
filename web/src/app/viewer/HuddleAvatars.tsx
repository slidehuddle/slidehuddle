"use client";

import type { DeckParticipant } from "@/lib/slide-store";
import Avatar from "./Avatar";

// The "N Huddlers" people cluster for the floating viewer + the feed top bar: a
// count of everyone in the deck's huddle (owner + collaborators + commenters)
// plus small stacked avatars. This is "who's involved", NOT live "who's viewing
// now". Identities (emails) arrive only for signed-in viewers — an anonymous
// link-holder is shown a generic chip elsewhere and never receives this list.
//
// The COUNT includes everyone in the huddle (you included), but the AVATAR STACK
// shows only the OTHER people: your own face is the account avatar sitting right
// beside this cluster, so repeating it here would be redundant. Each avatar now
// carries the shared two-signal system (shape = role, colour = person) via the
// <Avatar> component, so the owner reads as a filled purple disc and each
// collaborator keeps their own stable colour — here and in the feed.

const MAX_SHOWN = 4;

export default function HuddleAvatars({
  participants,
  currentUserId,
  ownerId,
}: {
  participants: DeckParticipant[];
  currentUserId: string | null;
  /** The deck's owner id (decks.user_id) — handed straight to <Avatar>, which is
   *  the single place that decides filled (owner) vs outline (collaborator). The
   *  cluster does NOT compute ownership itself, so it can't disagree with the feed. */
  ownerId: string | null;
}) {
  // Everyone except you — your own avatar is the account menu next to this.
  const others = participants.filter((p) => p.userId !== currentUserId);
  // A huddle needs more than just you; if nobody else is involved, show nothing.
  if (others.length === 0) return null;

  const total = participants.length; // the whole huddle, you included
  const shown = others.slice(0, MAX_SHOWN);
  const overflow = others.length - shown.length;
  const roster = others.map((p) => p.email ?? "a teammate").join(", ");
  const word = `Huddler${total === 1 ? "" : "s"}`;
  const label = `${total} ${word}`;

  return (
    <span className="inline-flex items-center gap-2" data-floating-control>
      <span className="hidden flex-col items-start leading-none text-[#0F6E56] sm:flex">
        <span className="text-[13px] font-semibold">{total}</span>
        <span className="text-[10px] font-medium">{word}</span>
      </span>
      <span
        className="inline-flex items-center"
        role="img"
        aria-label={`${label} — ${roster}`}
        title={`${label}\n${roster}`}
      >
        {shown.map((p, i) => (
          <span
            key={p.userId}
            className="relative inline-flex rounded-full ring-2 ring-white"
            style={{ marginLeft: i === 0 ? 0 : -8 }}
          >
            <Avatar
              userId={p.userId}
              ownerId={ownerId}
              email={p.email}
              size={32}
            />
            {p.commented && (
              <span
                aria-hidden="true"
                className="absolute left-1/2 -bottom-1 -translate-x-1/2 leading-none"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#0F6E56"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
            )}
          </span>
        ))}
        {overflow > 0 && (
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold select-none ring-2 ring-white"
            style={{ marginLeft: -8, backgroundColor: "#CFE9E0", color: "#085041" }}
          >
            +{overflow}
          </span>
        )}
      </span>
    </span>
  );
}
