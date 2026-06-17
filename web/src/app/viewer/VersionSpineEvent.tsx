"use client";

// ONE reusable version-spine event — the BACKBONE of the feed. Each deck version
// is a full-width, left-justified "round break" rendered as a flush MESSAGE (not
// a boxed card); the conversation that happened during it indents under it (the
// indentation + thread line live in DeckFeed). Three levels of prominence:
//   • v1 "opening": "[Owner] started this huddle · [title] · N slides · date" + strip.
//   • v2+ "break": "✦ [AI] published vN · N slides", "requested by [name] ·
//     addressed N comments[, N requests][, N removals] · date", "see changes ▸"
//     (a simple list of what it resolved — NOT an AI summary), + strip.
//   • the current version is a subtly-tinted highlight BAND + a "current" pill.
//
// AI provenance: the producing AI ("claude" → Claude, "chatgpt" → ChatGPT) comes
// from the version's `source`; unknown → a generic "AI" (never guessed).

import { useState } from "react";
import Avatar from "./Avatar";
import LazyThumbnailStrip from "./LazyThumbnailStrip";
import { nameFromEmail } from "./FeedItemCard";
import { formatRelativeTime } from "@/lib/relative-time";
import type { ParsedDeck } from "./parse-deck";

function aiName(source: string | null): string {
  if (source === "claude") return "Claude";
  if (source === "chatgpt") return "ChatGPT";
  return "AI"; // unknown / pre-provenance → generic, never guessed
}

export type AddressedSummary = {
  comments: number;
  requests: number;
  removals: number;
  items: { key: string; label: string }[];
};

// The AI's mark — a distinct dark rounded SQUARE with an amber sparkle, so it
// never reads as a person (people are circles).
function AiMark() {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
      style={{ backgroundColor: "#28282A" }}
      aria-label="AI"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#EF9F27" aria-hidden="true">
        <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />
      </svg>
    </span>
  );
}

export default function VersionSpineEvent({
  version,
  slideCount,
  title,
  createdAt,
  isOpening,
  isCurrent,
  source,
  creatorUserId,
  creatorEmail,
  deckOwnerId,
  deck,
  addressed,
  onSelectSlide,
}: {
  version: number;
  slideCount: number | null;
  title: string | null;
  createdAt: string;
  isOpening: boolean;
  isCurrent: boolean;
  source: string | null;
  creatorUserId: string | null;
  creatorEmail: string | null;
  deckOwnerId: string | null;
  deck: ParsedDeck | null;
  addressed: AddressedSummary;
  onSelectSlide: (slideIndex: number) => void;
}) {
  const [showChanges, setShowChanges] = useState(false);
  const when = formatRelativeTime(createdAt);
  const slides = slideCount != null ? `${slideCount} ${slideCount === 1 ? "slide" : "slides"}` : "";
  const creatorName = nameFromEmail(creatorEmail);

  const addressedText = (() => {
    const parts: string[] = [];
    if (addressed.comments > 0) parts.push(`${addressed.comments} ${addressed.comments === 1 ? "comment" : "comments"}`);
    if (addressed.requests > 0) parts.push(`${addressed.requests} ${addressed.requests === 1 ? "request" : "requests"}`);
    if (addressed.removals > 0) parts.push(`${addressed.removals} ${addressed.removals === 1 ? "removal" : "removals"}`);
    return parts.length ? `addressed ${parts.join(", ")}` : "";
  })();

  // Past-version messages (everything before the current round) read as
  // "settled": the whole event — provenance colour, avatar/AI mark, and the
  // thumbnail strip — desaturates, so only the CURRENT version keeps its amber ✦
  // / purple vN. Hover returns it to colour for readability. (P1.2 Item A.)
  return (
    <div
      className={
        isCurrent
          ? "rounded-xl px-3 py-2.5"
          : "px-1 py-1.5 transition [filter:grayscale(1)_opacity(0.65)] hover:[filter:none]"
      }
      style={isCurrent ? { backgroundColor: "#f1eff9" } : undefined}
    >
      <div className="flex items-start gap-3">
        {isOpening ? (
          <Avatar userId={creatorUserId} ownerId={deckOwnerId} email={creatorEmail} size={36} />
        ) : (
          <AiMark />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {isOpening ? (
                <p className="text-[15px] leading-snug text-[#1d1d1b]">
                  <span className="font-semibold">{creatorName} started this huddle</span>
                  {title ? <> · {title}</> : null}
                  {slides ? <> · {slides}</> : null}
                  <span className="text-muted"> · {when}</span>
                </p>
              ) : (
                <p className="flex flex-wrap items-center gap-x-1.5 text-[15px] leading-snug text-[#1d1d1b]">
                  <span className="font-semibold">
                    <span style={{ color: "#854F0B" }}>✦ {aiName(source)} published</span>{" "}
                    <span style={{ color: "#4A3FB5" }}>v{version}</span>
                  </span>
                  {slides ? <span className="text-[#1d1d1b]"> · {slides}</span> : null}
                  {isCurrent && (
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: "#534AB7", color: "#ffffff" }}
                    >
                      current
                    </span>
                  )}
                </p>
              )}
              {!isOpening && (
                <p className="mt-0.5 text-xs text-muted">
                  requested by {creatorName}
                  {addressedText ? <> · {addressedText}</> : null}
                  <> · {when}</>
                </p>
              )}
            </div>

            {!isOpening && addressed.items.length > 0 && (
              <button
                type="button"
                onClick={() => setShowChanges((v) => !v)}
                aria-expanded={showChanges}
                className="shrink-0 text-xs font-semibold text-brand hover:text-brand-hover"
              >
                see changes {showChanges ? "▾" : "▸"}
              </button>
            )}
          </div>

          {!isOpening && showChanges && addressed.items.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1 border-l-2 border-border pl-3">
              {addressed.items.map((it) => (
                <li key={it.key} className="text-xs text-[#33333a]">
                  <span style={{ color: "#0F6E56" }}>✓</span> {it.label}
                </li>
              ))}
            </ul>
          )}

          {deck && deck.slides.length > 0 && (
            <div className="mt-2.5">
              <LazyThumbnailStrip deck={deck} onSelectSlide={onSelectSlide} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
