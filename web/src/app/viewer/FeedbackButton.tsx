"use client";

import { useState } from "react";
import { copyText } from "./copy-text";

// "Copy feedback for Claude" gathers the team's comments / requested slides /
// removal flags into a structured prompt and copies it, ready to paste into
// Claude. Styled as a brand-purple OUTLINE button (white fill), with a light
// purple tint on hover.
const PURPLE = "#4A3FB5";
const PURPLE_TINT = "#EEEDFE";

type Props = {
  /** Prebuilt prompt text, or null when there's no feedback to copy. */
  feedbackText: string | null;
};

// The prompt is one header line followed by one line per feedback item
// (comment / requested slide / removal flag). Counting the non-header lines
// keeps the badge in lockstep with what actually gets sent — empty items that
// the builder drops are never counted.
function countFeedbackItems(feedbackText: string | null): number {
  if (!feedbackText) return 0;
  return feedbackText.split("\n").length - 1;
}

export default function FeedbackButton({ feedbackText }: Props) {
  const [copied, setCopied] = useState(false);
  const disabled = !feedbackText;
  const count = countFeedbackItems(feedbackText);

  async function handleCopy() {
    if (!feedbackText) return;
    const ok = await copyText(feedbackText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      console.error("[FeedbackButton] copy failed (modern and legacy paths)");
    }
  }

  // No feedback yet → muted, non-interactive chip. No amber, no badge.
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        title="No comments, requested slides, or flags to send yet"
        className="inline-flex items-center gap-2 rounded-lg bg-[#f0f0f3] text-muted text-sm font-semibold px-3.5 py-2 cursor-not-allowed select-none"
      >
        {/* sparkle — signals an AI action */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l1.9 4.8L18.7 9.7l-4.8 1.9L12 16.4l-1.9-4.8L5.3 9.7l4.8-1.9z" />
        </svg>
        No feedback yet
      </span>
    );
  }

  // Feedback exists → brand-purple OUTLINE action with a purple count badge.
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-live="polite"
      title="Copy the team's feedback as a prompt for Claude"
      className="grid place-items-center rounded-lg border text-sm font-semibold px-3.5 py-2 transition-colors"
      style={{ backgroundColor: "#ffffff", borderColor: PURPLE, color: PURPLE }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = PURPLE_TINT;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "#ffffff";
      }}
    >
      {/* Both labels share one grid cell, so the button keeps the (wider)
          "Copy feedback for Claude" width when it briefly shows "Copied!" —
          the row never reflows. The inactive label stays in layout (invisible)
          to hold the width. */}
      <span className={`col-start-1 row-start-1 inline-flex items-center gap-2 ${copied ? "invisible" : ""}`}>
        {/* sparkle — signals an AI action */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l1.9 4.8L18.7 9.7l-4.8 1.9L12 16.4l-1.9-4.8L5.3 9.7l4.8-1.9z" />
        </svg>
        Copy feedback for Claude
        <span
          aria-label={`${count} feedback ${count === 1 ? "item" : "items"}`}
          className="inline-flex items-center justify-center rounded-full text-xs font-bold leading-none min-w-5 h-5 px-1.5 text-white"
          style={{ backgroundColor: PURPLE }}
        >
          {count}
        </span>
      </span>
      <span className={`col-start-1 row-start-1 inline-flex items-center gap-2 ${copied ? "" : "invisible"}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Copied!
      </span>
    </button>
  );
}
