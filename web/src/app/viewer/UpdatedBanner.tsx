"use client";

import { useState } from "react";

const AMBER_BG = "#FAEEDA";
const AMBER_TEXT = "#633806";

type Props = {
  /** Pre-built summary detail, e.g. "v1 → v2 · 1 slide added". */
  detail: string;
};

// One-time, dismissible banner shown to a SIGNED-IN viewer when the deck has
// been updated since they last saw it. "One-time" is enforced server-side:
// the visit records the new last-viewed timestamp, so it won't reappear next
// load. Dismiss just hides it for the current view.
export default function UpdatedBanner({ detail }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      className="flex items-center gap-3 px-8 py-2 border-b border-border"
      style={{ backgroundColor: AMBER_BG, color: AMBER_TEXT }}
      role="status"
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
        <path d="M12 3l1.9 4.8L18.7 9.7l-4.8 1.9L12 16.4l-1.9-4.8L5.3 9.7l4.8-1.9z" />
      </svg>
      <p className="text-sm leading-snug flex-1">
        <span className="font-semibold">Claude revised this deck</span> since you
        last viewed it — <span className="font-medium">{detail}</span>.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 hover:bg-black/5 transition-colors"
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
