"use client";

import { useState } from "react";

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
export default function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

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

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-live="polite"
      className="inline-flex items-center gap-2 rounded-lg bg-brand text-white text-sm font-semibold px-3.5 py-2 hover:bg-brand-hover transition-colors"
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy link
        </>
      )}
    </button>
  );
}
