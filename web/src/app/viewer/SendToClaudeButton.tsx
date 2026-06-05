"use client";

import { useRef, useState } from "react";
import { copyText } from "./copy-text";
import PortalPopover from "@/components/PortalPopover";

// "Send to Claude" — a Google-style split button: one continuous amber shape
// with a primary action on the left and a dropdown chevron on the right,
// separated by a hairline divider so it reads as a single button with a
// dropdown affordance (not two buttons).
//
//   Left  → opens the bound Claude conversation in a new tab. The extension,
//           running on claude.ai, reads the feedback out of the URL fragment
//           and fills it into the (empty) message box — never auto-sending.
//           Feedback is also copied to the clipboard as a safety net so the
//           user can paste even if the extension isn't installed.
//   Right → a dropdown whose one option copies the feedback to the clipboard
//           (the always-available manual fallback).
//
// When there's no feedback the button is muted ("No feedback yet") and the
// chevron is dropped entirely.
//
// Styled as a brand-purple OUTLINE button (white fill, purple text/border) to
// match the rest of the deck actions, with a light purple tint on hover. The
// two portions are split by a thin purple hairline so it still reads as one
// button with a dropdown affordance.
const PURPLE = "#4A3FB5";
const PURPLE_TINT = "#EEEDFE";
const DIVIDER = "rgba(74,63,181,0.30)";

// Both resting states — the muted "No comments…" chip and the active split
// button — share this min width so the action keeps the same footprint whether
// or not there's feedback. ~the natural width of the (wider) muted chip, so the
// narrower split button is the one that gets extended to match.
const ACTION_MIN_W = "min-w-[242px]";

// The fragment key the extension looks for on claude.ai. The web app tucks the
// feedback into `#<KEY>=<encodeURIComponent(text)>`; content.js must read the
// SAME key. The fragment stays local to the browser (never sent to a server).
export const FEEDBACK_HASH_KEY = "slidehuddle-feedback";

// SlideHuddle's hosted MCP endpoint. Pasted into Claude's "Add connector" /
// custom-connector dialog so the assistant can talk to decks directly, rather
// than going through the copy-paste-feedback round trip.
const MCP_URL = "https://slidehuddleapp.vercel.app/mcp";

type Props = {
  /** Prebuilt prompt text, or null when there's no feedback to send. */
  feedbackText: string | null;
  /** Claude conversation this deck was captured from, or null when unbound. */
  conversationId: string | null;
};

// The prompt is one header line followed by one line per feedback item
// (comment / requested slide / removal flag). Counting the non-header lines
// keeps the "· N" count in lockstep with what actually gets sent.
function countFeedbackItems(feedbackText: string | null): number {
  if (!feedbackText) return 0;
  return feedbackText.split("\n").length - 1;
}

// A claude.ai URL carrying the feedback in its fragment. Bound decks open the
// exact conversation; unbound decks open a fresh chat.
function claudeUrl(conversationId: string | null, feedbackText: string): string {
  const frag = `#${FEEDBACK_HASH_KEY}=${encodeURIComponent(feedbackText)}`;
  return conversationId
    ? `https://claude.ai/chat/${conversationId}${frag}`
    : `https://claude.ai/${frag}`;
}

// Sparkle — signals an AI action (shared by both states).
function Sparkle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 4.8L18.7 9.7l-4.8 1.9L12 16.4l-1.9-4.8L5.3 9.7l4.8-1.9z" />
    </svg>
  );
}

export default function SendToClaudeButton({ feedbackText, conversationId }: Props) {
  const [open, setOpen] = useState(false);
  // Label of the most recent successful copy ("Feedback" / "MCP URL"), or null.
  // One shared confirmation toast covers both dropdown actions.
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  // Transient explanatory toast shown after the primary action fires.
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const count = countFeedbackItems(feedbackText);

  // No feedback yet → muted, non-interactive chip. No amber, no chevron.
  if (!feedbackText) {
    return (
      <span
        aria-disabled="true"
        title="No comments, requested slides, or flags to send yet"
        className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[#f0f0f3] text-muted text-sm font-semibold px-3.5 py-2 cursor-not-allowed select-none ${ACTION_MIN_W}`}
      >
        <Sparkle />
        No comments for Claude yet
      </span>
    );
  }

  async function handleCopy() {
    if (!feedbackText) return;
    const ok = await copyText(feedbackText);
    if (ok) {
      setCopiedLabel("Feedback");
      setTimeout(() => setCopiedLabel(null), 2000);
    } else {
      console.error("[SendToClaude] copy failed (modern and legacy paths)");
    }
  }

  async function handleCopyMcpUrl() {
    const ok = await copyText(MCP_URL);
    if (ok) {
      setCopiedLabel("MCP URL");
      setTimeout(() => setCopiedLabel(null), 2000);
    } else {
      console.error("[SendToClaude] MCP URL copy failed (modern and legacy paths)");
    }
  }

  async function handleSend() {
    if (!feedbackText) return;
    // Always copy first as a safety net: if the extension isn't installed (so
    // it can't auto-fill the message box), the user can still paste.
    await copyText(feedbackText);
    window.open(claudeUrl(conversationId, feedbackText), "_blank", "noopener,noreferrer");
    setSendMsg(
      conversationId
        ? "Opening your Claude conversation — your feedback will fill the message box (also copied, so you can paste it)."
        : "Couldn't find the original chat on this device — opened Claude and copied your feedback. Paste it into the message box.",
    );
    setTimeout(() => setSendMsg(null), 6000);
  }

  return (
    <div className="relative">
      {/* One continuous amber shape. The rounded container clips both ends and
          a hairline divider sits between the two portions, so it reads as a
          single button with a dropdown affordance — not two buttons. */}
      <div
        ref={containerRef}
        className={`inline-flex items-stretch rounded-lg overflow-hidden border ${ACTION_MIN_W}`}
        style={{ borderColor: PURPLE, backgroundColor: "#ffffff" }}
      >
        {/* Primary action — opens the bound Claude conversation. */}
        <button
          type="button"
          onClick={handleSend}
          aria-live="polite"
          title="Open your Claude conversation and fill in the team's feedback"
          className="inline-flex flex-1 items-center justify-center gap-2 text-sm font-semibold pl-3.5 pr-3 py-2 transition-colors"
          style={{ color: PURPLE, backgroundColor: "#ffffff" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = PURPLE_TINT)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ffffff")}
        >
          <Sparkle />
          <span>
            Send to Claude
            {/* subtle "· N" count inside the label (muted), not a heavy badge —
                stays tidy even with double-digit counts */}
            <span
              aria-label={`${count} feedback ${count === 1 ? "item" : "items"}`}
              className="opacity-70"
            >
              {" · "}
              {count}
            </span>
          </span>
        </button>

        {/* hairline divider */}
        <span aria-hidden="true" className="my-1.5 w-px shrink-0" style={{ backgroundColor: DIVIDER }} />

        {/* Dropdown affordance — opens the manual fallback menu. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="More ways to send feedback"
          className="inline-flex items-center justify-center px-2 transition-colors"
          style={{ color: PURPLE, backgroundColor: "#ffffff" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = PURPLE_TINT)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ffffff")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Dropdown: one option — copy the curated feedback for manual pasting. */}
      <PortalPopover
        anchorRef={containerRef}
        open={open}
        onClose={() => setOpen(false)}
        width={252}
        placement="bottom-end"
      >
        <div
          role="menu"
          className="rounded-xl border border-border bg-white p-1.5 shadow-[0_12px_32px_rgba(17,17,17,0.14)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void handleCopy();
              setOpen(false);
            }}
            className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#f4f3fc]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0 text-muted">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span className="leading-snug">
              <span className="block text-sm font-semibold text-[#1d1d1b]">
                Copy feedback to clipboard
              </span>
              <span className="block text-xs text-muted">Paste into Claude yourself.</span>
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void handleCopyMcpUrl();
              setOpen(false);
            }}
            className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#f4f3fc]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0 text-muted">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span className="leading-snug">
              <span className="block text-sm font-semibold text-[#1d1d1b]">
                Copy MCP connector URL
              </span>
              <span className="block text-xs text-muted">
                Add as a custom connector in Claude to link decks directly.
              </span>
            </span>
          </button>
        </div>
      </PortalPopover>

      {/* Transient toasts, mirroring Copy link's pattern. One confirms a manual
          copy; the other explains what the primary action just did. */}
      <div
        role="status"
        aria-hidden={!copiedLabel}
        className={`pointer-events-none absolute right-0 top-full mt-1.5 z-10 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[#1D1D1B] px-2.5 py-1.5 text-[11px] text-white shadow-lg transition-opacity duration-300 ${
          copiedLabel ? "opacity-100" : "opacity-0"
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>{copiedLabel} copied</span>
      </div>

      <div
        role="status"
        aria-hidden={!sendMsg}
        className={`pointer-events-none absolute right-0 top-full mt-1.5 z-10 max-w-[280px] rounded-md bg-[#1D1D1B] px-2.5 py-1.5 text-[11px] leading-snug text-white shadow-lg transition-opacity duration-300 ${
          sendMsg ? "opacity-100" : "opacity-0"
        }`}
      >
        {sendMsg}
      </div>
    </div>
  );
}
