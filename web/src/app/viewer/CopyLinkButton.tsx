"use client";

import { useRef, useState } from "react";
import AnchoredToast from "@/components/AnchoredToast";

// Fallback clipboard path for browsers that block navigator.clipboard.
function legacyCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  const selection = document.getSelection();
  const previousRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  if (selection && previousRange) {
    selection.removeAllRanges();
    selection.addRange(previousRange);
  }
  return ok;
}

// "Copy link" — a deck action (lives in the thumbnail/actions row, not the
// identity nav). Copies the current viewer URL with ?source=capture stripped
// so recipients never inherit the creator-claim flag.
//
// `label` defaults to "Copy link" (the current viewer's wording); the new
// floating viewer passes "Share". Behaviour — copy + toast — is identical
// either way, so the current viewer is unchanged.
//
// variant="invite": the huddler filter stack's "add another one" affordance
// (Slice 3) — a round dashed "+" that runs the SAME copy + toast (one copy of
// the logic, a different trigger).
export default function CopyLinkButton({
  label = "Copy link",
  variant = "button",
}: { label?: string; variant?: "button" | "invite" } = {}) {
  const [copied, setCopied] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  async function handleCopy() {
    const url = new URL(window.location.href);
    url.searchParams.delete("source");
    const text = url.toString();
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = legacyCopy(text);
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      console.error("[CopyLinkButton] copy failed (modern and legacy paths)");
    }
  }

  // The invite trigger: a dashed circle "+" (a would-be huddler's empty seat).
  // Same handleCopy + the same toast below — flips to a check while copied.
  if (variant === "invite") {
    return (
      <div className="relative">
        <button
          ref={btnRef}
          type="button"
          onClick={handleCopy}
          aria-live="polite"
          aria-label="Invite someone — copy the share link"
          title="Invite someone — copy the share link"
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed transition-colors hover:bg-[#F4F3FC]"
          style={{ borderColor: "#B9B3E6", color: "#4A3FB5" }}
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3FA344" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        </button>
        <AnchoredToast anchorRef={btnRef} open={copied} maxWidth={320}>
          <div
            role="status"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[#1D1D1B] px-2.5 py-1.5 text-[11px] text-white shadow-lg"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>
              Link copied <span className="text-white/55">· anyone with this link can view</span>
            </span>
          </div>
        </AnchoredToast>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Both labels share one grid cell so the button width is fixed to the
          wider of the two states — switching to "Copied!" never reflows the
          row (no horizontal "shake"). The inactive label stays in the layout
          (invisible) to hold the width. */}
      <button
        ref={btnRef}
        type="button"
        onClick={handleCopy}
        aria-live="polite"
        className="grid place-items-center rounded-lg bg-brand text-white text-sm font-semibold px-3.5 py-2 hover:bg-brand-hover transition-colors"
      >
        <span className={`col-start-1 row-start-1 inline-flex items-center gap-2 ${copied ? "invisible" : ""}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {label}
        </span>
        <span className={`col-start-1 row-start-1 inline-flex items-center gap-2 ${copied ? "" : "invisible"}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </span>
      </button>

      {/* Transient confirmation toast — rendered on the TOP layer via
          AnchoredToast (portaled to <body>), so it's never hidden behind a
          floating panel/pill. Fades out ~2s after the copy (with `copied`). */}
      <AnchoredToast anchorRef={btnRef} open={copied} maxWidth={320}>
        <div
          role="status"
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[#1D1D1B] px-2.5 py-1.5 text-[11px] text-white shadow-lg"
        >
          {/* green tick — confirms the copy succeeded */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>
            Link copied <span className="text-white/55">· anyone with this link can view</span>
          </span>
        </div>
      </AnchoredToast>
    </div>
  );
}
