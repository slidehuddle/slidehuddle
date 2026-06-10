"use client";

import { useState } from "react";
import type { ArrivalActivity } from "./arrival-activity";

// Floating viewer's "arrival activity" banner: when a returning, signed-in
// viewer opens the deck, a small dismissable pill tells them what's new —
// "Alex and Jordan added 3 comments since you were here" — with a "Catch up"
// action that opens the comments. Mirrors UpdatedBanner's pattern (amber,
// dismissable, role="status") but floats over the full-bleed slide rather than
// sitting in a docked bar. Author names are escaped React children — never HTML.
//
// "Returning + new comments only" is decided server-side (computeArrivalActivity
// against the PREVIOUS last_viewed_at): first-time and anonymous viewers are
// never given an activity object, so this never renders for them.

const AMBER_BG = "#FAEEDA";
const AMBER_TEXT = "#633806";

// How many names to spell out before collapsing the rest into "and N others".
const MAX_NAMES = 2;

function formatNames(names: string[]): string {
  if (names.length === 0) return "Someone";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const head = names.slice(0, MAX_NAMES).join(", ");
  const rest = names.length - MAX_NAMES;
  return `${head} and ${rest} other${rest === 1 ? "" : "s"}`;
}

export default function ArrivalBanner({
  activity,
  onCatchUp,
}: {
  activity: ArrivalActivity;
  onCatchUp: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const who = formatNames(activity.names);
  const commentWord = activity.count === 1 ? "comment" : "comments";

  return (
    <div
      role="status"
      data-floating-control
      className="absolute top-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 max-w-[90vw] rounded-2xl border border-black/[0.06] px-3.5 py-2 shadow-[0_6px_22px_rgba(0,0,0,0.12)] backdrop-blur-md"
      style={{ backgroundColor: AMBER_BG, color: AMBER_TEXT }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <p className="text-sm leading-snug">
        <span className="font-semibold">{who}</span> added {activity.count}{" "}
        {commentWord} since you were here
      </p>
      <button
        type="button"
        onClick={onCatchUp}
        className="shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold transition-colors hover:bg-black/5"
        style={{ color: "#0F6E56" }}
      >
        Catch up
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 transition-colors hover:bg-black/5"
        style={{ color: AMBER_TEXT }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
