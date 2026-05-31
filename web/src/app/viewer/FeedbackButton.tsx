"use client";

import { useState } from "react";
import { copyText } from "./copy-text";

// AMBER (#854F0B) marks AI-loop actions. "Copy feedback for Claude" gathers
// the team's comments / requested slides / removal flags into a structured
// prompt and copies it, ready to paste into Claude.
const AMBER = "#854F0B";
const AMBER_HOVER = "#6B3F09";

type Props = {
  /** Prebuilt prompt text, or null when there's no feedback to copy. */
  feedbackText: string | null;
};

export default function FeedbackButton({ feedbackText }: Props) {
  const [copied, setCopied] = useState(false);
  const disabled = !feedbackText;

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

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled}
      aria-live="polite"
      title={
        disabled
          ? "No comments, requested slides, or flags to send yet"
          : "Copy the team's feedback as a prompt for Claude"
      }
      className="inline-flex items-center gap-2 rounded-lg text-white text-sm font-semibold px-3.5 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ backgroundColor: AMBER }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = AMBER_HOVER;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = AMBER;
      }}
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          {/* sparkle — signals an AI action */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l1.9 4.8L18.7 9.7l-4.8 1.9L12 16.4l-1.9-4.8L5.3 9.7l4.8-1.9z" />
          </svg>
          Copy feedback for Claude
        </>
      )}
    </button>
  );
}
