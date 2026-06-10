"use client";

import type { DeckParticipant } from "@/lib/slide-store";

// The "N Huddlers" people cluster for the floating viewer: a count of everyone
// in the deck's huddle (owner + collaborators + commenters) plus small stacked
// avatars. This is "who's involved", NOT live "who's viewing now". Identities
// (emails) arrive only for signed-in viewers — an anonymous link-holder is shown
// a generic chip elsewhere and never receives this list, so it's safe to render
// the emails here as escaped text.
//
// The COUNT includes everyone in the huddle (you included — you're a huddler
// too), but the AVATAR STACK shows only the OTHER people: your own face is
// already the account avatar sitting right beside this cluster, so repeating it
// here would be redundant. Rendered in the deck's teal collaboration colour;
// a participant who has left a comment carries a small comment marker.

const MAX_SHOWN = 4;

function initialFor(p: DeckParticipant): string {
  return (p.email?.trim()?.[0] ?? "?").toUpperCase();
}

export default function HuddleAvatars({
  participants,
  currentUserId,
}: {
  participants: DeckParticipant[];
  currentUserId: string | null;
}) {
  // Everyone except you — your own avatar is the account menu next to this.
  const others = participants.filter((p) => p.userId !== currentUserId);
  // A huddle needs more than just you; if nobody else is involved, show nothing.
  if (others.length === 0) return null;

  const total = participants.length; // the whole huddle, you included
  const shown = others.slice(0, MAX_SHOWN);
  const overflow = others.length - shown.length;
  // Plain, escaped text for the tooltip / screen-reader label — never HTML.
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
            title={p.email ?? "a teammate"}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold select-none ring-2 ring-white transition-shadow hover:ring-[#5DCAA5]"
            style={{
              marginLeft: i === 0 ? 0 : -8,
              ...(p.isOwner
                ? { backgroundColor: "#0F6E56", color: "#ffffff" }
                : { backgroundColor: "#E1F5EE", color: "#085041" }),
            }}
          >
            {initialFor(p)}
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
