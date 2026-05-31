"use client";

import { useEffect, useRef, useState } from "react";
import type { ParsedDeck } from "./parse-deck";
import { buildSrcdoc } from "./parse-deck";
import { type DisplayItem, positionForGap } from "./display-items";
import InsertStubForm from "./InsertStubForm";
import CopyLinkButton from "./CopyLinkButton";
import FeedbackButton from "./FeedbackButton";
import PortalPopover from "@/components/PortalPopover";

type Props = {
  deck: ParsedDeck;
  items: DisplayItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  /** real slide index → number of comments on it */
  commentCountBySlide: Map<number, number>;
  /** real slide indices that have been flagged for removal */
  flaggedSlides: Set<number>;
  /** Whether to show the Copy link action + caption (shareable / stored decks). */
  showCopyLink: boolean;
  /** Whether the deck supports requesting stubs at all (stored decks only). */
  showInsert: boolean;
  canInsert: boolean;
  loginHref: string;
  onInsertStub: (
    position: number,
    fields: { title: string; subtitle: string; body: string },
  ) => Promise<void>;
  /** Prebuilt "Copy feedback for Claude" prompt; null = nothing to send yet.
   *  undefined = don't show the button at all (e.g. non-stored decks). */
  feedbackText?: string | null;
};

// Uniform thumbnail height keeps the strip tidy; width follows the deck's
// aspect ratio (clamped so very tall or very wide decks stay reasonable).
const THUMB_H = 56;

function thumbWidth(deck: ParsedDeck): number {
  const ar = deck.slideWidth / deck.slideHeight;
  return Math.round(Math.min(168, Math.max(64, THUMB_H * ar)));
}

function SlideThumb({
  deck,
  slideIndex,
  number,
  active,
  flagged,
  commentCount,
  onClick,
}: {
  deck: ParsedDeck;
  slideIndex: number;
  number: number;
  active: boolean;
  flagged: boolean;
  commentCount: number;
  onClick: () => void;
}) {
  const w = thumbWidth(deck);
  const scale = w / deck.slideWidth;
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      {/* Relative wrapper sized to the thumbnail so the corner badges sit on
          its corners but are NOT dimmed along with the (opacity-reduced)
          flagged thumbnail. */}
      <div className="relative">
        <button
          type="button"
          onClick={onClick}
          aria-label={`Go to slide ${number}`}
          aria-current={active ? "true" : undefined}
          className="relative block overflow-hidden rounded-md bg-white transition-all"
          style={{
            width: w,
            height: THUMB_H,
            border: active ? "2px solid #4A3FB5" : "1px solid #e8e8ee",
            opacity: flagged ? 0.4 : 1,
          }}
        >
          <iframe
            title={`Slide ${number} thumbnail`}
            srcDoc={buildSrcdoc(
              deck.slides[slideIndex] ?? "",
              deck.headHtml,
              deck.hasAuthoredStyles,
              { measure: false },
            )}
            sandbox=""
            scrolling="no"
            tabIndex={-1}
            aria-hidden="true"
            className="border-0 bg-white pointer-events-none origin-top-left"
            style={{
              width: deck.slideWidth,
              height: deck.slideHeight,
              transform: `scale(${scale})`,
            }}
          />
        </button>

        {/* comment-count bubble — overhangs the top-right corner. The strip
            is a horizontal scroll container (which also clips vertically), so
            the scroller carries extra top/right padding to give this room.
            The white ring lifts it off the slide it overlaps. */}
        {commentCount > 0 && (
          <span
            aria-label={`${commentCount} comment${commentCount === 1 ? "" : "s"}`}
            className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 inline-flex items-center justify-center rounded-full min-w-[16px] h-4 px-1 text-[10px] font-bold leading-none ring-2 ring-white"
            style={{ backgroundColor: "#0F6E56", color: "#ffffff" }}
          >
            {commentCount}
          </span>
        )}

        {/* flagged-for-removal indicator — a red trash-can circle in the
            bottom-right corner. */}
        {flagged && (
          <span
            aria-label="Flagged for removal"
            className="absolute bottom-0 right-0 translate-x-1/3 translate-y-1/3 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-white"
            style={{ backgroundColor: "#791F1F", color: "#ffffff" }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </span>
        )}
      </div>
      <span className="text-[11px] text-muted leading-none">{number}</span>
    </div>
  );
}

function StubThumb({
  deck,
  number,
  title,
  active,
  onClick,
}: {
  deck: ParsedDeck;
  number: number;
  title: string | null;
  active: boolean;
  onClick: () => void;
}) {
  const w = thumbWidth(deck);
  const label = title?.trim() || "Untitled slide";
  return (
    <div className="relative flex flex-col items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-label={`Go to requested slide: ${label}`}
        aria-current={active ? "true" : undefined}
        className="flex items-center justify-center rounded-md px-1.5 transition-all overflow-hidden"
        style={{
          width: w,
          height: THUMB_H,
          border: active ? "2px solid #4A3FB5" : "1.5px dashed #5DCAA5",
          backgroundColor: "rgba(93,202,165,0.06)",
          color: "#0F6E56",
        }}
      >
        {/* the user-suggested title, clamped to the first lines that fit
            with an ellipsis */}
        <span className="text-[10px] font-semibold leading-tight text-center line-clamp-3 break-words">
          {label}
        </span>
      </button>
      {/* "N" (new / requested) corner bubble */}
      <span
        aria-hidden="true"
        className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 inline-flex items-center justify-center rounded-full w-4 h-4 text-[10px] font-bold leading-none ring-2 ring-white"
        style={{ backgroundColor: "#0F6E56", color: "#ffffff" }}
      >
        N
      </span>
      <span
        className="text-[11px] leading-none"
        style={{ color: "#0F6E56", fontWeight: 500 }}
      >
        {number}
      </span>
    </div>
  );
}

// A hoverable gap between two thumbnails (or at either end). Reveals a
// purple "+" with thin connector lines; clicking opens the insert form.
function InsertGap({
  gapIndex,
  open,
  onOpen,
  onClose,
  canInsert,
  loginHref,
  onSubmit,
}: {
  gapIndex: number;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  canInsert: boolean;
  loginHref: string;
  onSubmit: (fields: {
    title: string;
    subtitle: string;
    body: string;
  }) => Promise<void>;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div
      className="relative group shrink-0 flex flex-col items-center justify-center self-stretch"
      style={{ width: 18 }}
    >
      {/* connector line above */}
      <span
        aria-hidden="true"
        className={`w-px flex-1 transition-colors ${open ? "bg-brand/40" : "bg-transparent group-hover:bg-brand/30"}`}
      />
      <button
        ref={btnRef}
        type="button"
        onClick={open ? onClose : onOpen}
        aria-label="Insert a slide here"
        className={`my-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-white transition-opacity ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      {/* connector line below */}
      <span
        aria-hidden="true"
        className={`w-px flex-1 transition-colors ${open ? "bg-brand/40" : "bg-transparent group-hover:bg-brand/30"}`}
      />
      <PortalPopover
        anchorRef={btnRef}
        open={open}
        onClose={onClose}
        width={288}
        placement="bottom-center"
      >
        <InsertStubForm
          canInsert={canInsert}
          loginHref={loginHref}
          onSubmit={onSubmit}
          onClose={onClose}
        />
      </PortalPopover>
      <span className="sr-only">gap {gapIndex}</span>
    </div>
  );
}

export default function ThumbnailStrip({
  deck,
  items,
  activeIndex,
  onSelect,
  commentCountBySlide,
  flaggedSlides,
  showCopyLink,
  showInsert,
  canInsert,
  loginHref,
  onInsertStub,
  feedbackText,
}: Props) {
  const [openGap, setOpenGap] = useState<number | null>(null);

  // --- Custom scroll-position indicator for the thumbnail row -----------
  // The native scrollbar is hidden, so this slim grey track shows where you
  // are when the slides overflow. `widthPct` is how much of the row is
  // visible; `leftPct` is how far along you've scrolled.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({
    overflow: false,
    widthPct: 100,
    leftPct: 0,
  });

  function updateScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth - clientWidth > 1;
    const widthPct = overflow ? (clientWidth / scrollWidth) * 100 : 100;
    const maxScroll = scrollWidth - clientWidth;
    const frac = maxScroll > 0 ? scrollLeft / maxScroll : 0;
    const leftPct = frac * (100 - widthPct);
    setScroll((prev) =>
      prev.overflow === overflow &&
      Math.abs(prev.widthPct - widthPct) < 0.5 &&
      Math.abs(prev.leftPct - leftPct) < 0.5
        ? prev
        : { overflow, widthPct, leftPct },
    );
  }

  // Keep the indicator in sync with scrolling, resizing, and slide count.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateScroll();
    el.addEventListener("scroll", updateScroll, { passive: true });
    const ro = new ResizeObserver(updateScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScroll);
      ro.disconnect();
    };
  }, [items.length]);

  // Let a plain (vertical) mouse wheel scroll the row horizontally — most
  // mice can't scroll sideways, and the bar is hidden. Native non-passive
  // listener so we can preventDefault.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (el!.scrollWidth - el!.clientWidth <= 1) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already horizontal
      el!.scrollLeft += e.deltaY;
      e.preventDefault();
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the active thumbnail in view as the user navigates (arrows/keyboard).
  // Uses viewport rects (not offsetLeft, which is relative to the positioned
  // thumb wrapper, not the scroller) and scrollBy the overflow delta.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-current="true"]');
    if (!active) return;
    const a = active.getBoundingClientRect();
    const s = el.getBoundingClientRect();
    const margin = 24;
    if (a.left < s.left) {
      el.scrollBy({ left: a.left - s.left - margin, behavior: "smooth" });
    } else if (a.right > s.right) {
      el.scrollBy({ left: a.right - s.right + margin, behavior: "smooth" });
    }
  }, [activeIndex, items.length]);

  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    const el = scrollerRef.current;
    const track = e.currentTarget;
    if (!el) return;
    const rect = track.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.scrollTo({
      left: frac * (el.scrollWidth - el.clientWidth),
      behavior: "smooth",
    });
  }

  function renderGap(gapIndex: number) {
    if (!showInsert) return null;
    return (
      <InsertGap
        key={`gap-${gapIndex}`}
        gapIndex={gapIndex}
        open={openGap === gapIndex}
        onOpen={() => setOpenGap(gapIndex)}
        onClose={() => setOpenGap(null)}
        canInsert={canInsert}
        loginHref={loginHref}
        onSubmit={(fields) =>
          onInsertStub(positionForGap(items, gapIndex), fields)
        }
      />
    );
  }

  return (
    <div className="flex items-stretch gap-0 px-4 pt-1 pb-2.5 border-b border-border bg-white shrink-0">
      {/* Left column: the scrollable thumbnail row + a slim scroll-position
          indicator beneath it. */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {/* scrollable thumbnails — scrollbar hidden (see .no-scrollbar). The
            pt-2/pr-2 give the overhanging badges room inside the clip region
            (overflow-x:auto also clips the cross axis). */}
        <div
          ref={scrollerRef}
          className="flex items-stretch gap-0 overflow-x-auto no-scrollbar pt-2 pr-2"
        >
          {renderGap(0)}
          {items.map((item, i) => (
            <div key={i} className="flex items-stretch gap-0">
              {item.kind === "slide" ? (
                <SlideThumb
                  deck={deck}
                  slideIndex={item.slideIndex}
                  number={i + 1}
                  active={i === activeIndex}
                  flagged={flaggedSlides.has(item.slideIndex)}
                  commentCount={commentCountBySlide.get(item.slideIndex) ?? 0}
                  onClick={() => onSelect(i)}
                />
              ) : (
                <StubThumb
                  deck={deck}
                  number={i + 1}
                  title={item.stub.title}
                  active={i === activeIndex}
                  onClick={() => onSelect(i)}
                />
              )}
              {renderGap(i + 1)}
            </div>
          ))}
        </div>

        {/* Subtle grey scroll-position indicator (only when the row
            overflows). Click anywhere on it to jump there. */}
        {scroll.overflow && (
          <div
            onClick={handleTrackClick}
            role="presentation"
            className="relative h-1 mx-1 rounded-full cursor-pointer"
            style={{ backgroundColor: "#ececf2" }}
          >
            <div
              className="absolute top-0 h-1 rounded-full transition-[left] duration-75"
              style={{
                backgroundColor: "#bcbcca",
                width: `${scroll.widthPct}%`,
                left: `${scroll.leftPct}%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Deck actions, pinned to the far right. The AI-loop action (amber)
          "Copy feedback for Claude" sits to the left of the share action:
          Copy link (with the "anyone with this link can view" caption stacked
          beneath it). Updates are now driven from the capture moment in Claude,
          so there's no "Update this deck" button here. */}
      {showCopyLink && (
        <div className="flex flex-row items-center justify-center gap-2.5 pl-3 shrink-0">
          {feedbackText !== undefined && (
            <FeedbackButton feedbackText={feedbackText} />
          )}
          <div className="flex flex-col items-end justify-center gap-1">
            <CopyLinkButton />
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              Anyone with this link can view
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
