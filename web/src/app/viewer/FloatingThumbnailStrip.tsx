"use client";

// Vertical thumbnail strip for the FLOATING viewer — a floating panel on the
// LEFT (opposite the comments panel on the right). It lists the deck's real
// slides and any requested ("stub") slides top-to-bottom, with a "+" in the gap
// between each to request a new one. It reuses the shared pieces (buildSrcdoc
// for the slide thumbnails, InsertStubForm + positionForGap for inserting), but
// the vertical container/rows are this viewer's own — the current viewer's
// horizontal ThumbnailStrip is left untouched.

import { useRef, useState } from "react";
import type { ParsedDeck } from "./parse-deck";
import { buildSrcdoc } from "./parse-deck";
import { type DisplayItem, positionForGap } from "./display-items";
import InsertStubForm from "./InsertStubForm";
import PortalPopover from "@/components/PortalPopover";

type Props = {
  deck: ParsedDeck;
  items: DisplayItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  /** real slide index → number of comments on it */
  commentCountBySlide: Map<number, number>;
  /** Whether the deck supports requesting stubs at all (stored decks only). */
  showInsert: boolean;
  canInsert: boolean;
  loginHref: string;
  onInsertStub: (
    position: number,
    fields: { title: string; subtitle: string; body: string },
  ) => Promise<void>;
};

const TILE_W = 132;
const NUM_W = 14; // width of the slide-number column (outside the thumbnail)
const GAP_H = 20;

function tileHeight(deck: ParsedDeck): number {
  const ar = deck.slideWidth / deck.slideHeight;
  return Math.round(TILE_W / ar);
}

// The slide number, OUTSIDE the thumbnail in a narrow left column, top-aligned.
function NumberLabel({ n, color }: { n: number; color: string }) {
  return (
    <span
      className="shrink-0 pt-0.5 text-right text-[10px] font-semibold leading-none"
      style={{ width: NUM_W, color }}
    >
      {n}
    </span>
  );
}

function SlideThumb({
  deck,
  slideIndex,
  number,
  active,
  commentCount,
  onClick,
}: {
  deck: ParsedDeck;
  slideIndex: number;
  number: number;
  active: boolean;
  commentCount: number;
  onClick: () => void;
}) {
  const h = tileHeight(deck);
  const scale = TILE_W / deck.slideWidth;
  return (
    <div className="flex items-start gap-1.5">
      <NumberLabel n={number} color="#9a9aa5" />
      <div className="relative">
        <button
          type="button"
          onClick={onClick}
          aria-label={`Go to slide ${number}`}
          aria-current={active ? "true" : undefined}
          className="relative block overflow-hidden rounded-md bg-white transition-all hover:shadow-md"
          style={{
            width: TILE_W,
            height: h,
            border: active ? "2px solid #4A3FB5" : "1px solid #e8e8ee",
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
        {commentCount > 0 && (
          <span
            aria-label={`${commentCount} comment${commentCount === 1 ? "" : "s"}`}
            className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 inline-flex items-center justify-center rounded-full min-w-[16px] h-4 px-1 text-[10px] font-bold leading-none ring-2 ring-white"
            style={{ backgroundColor: "#0F6E56", color: "#ffffff" }}
          >
            {commentCount}
          </span>
        )}
      </div>
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
  const h = tileHeight(deck);
  const label = title?.trim() || "Untitled slide";
  return (
    <div className="flex items-start gap-1.5">
      <NumberLabel n={number} color="#0F6E56" />
      <div className="relative">
        <button
          type="button"
          onClick={onClick}
          aria-label={`Go to requested slide: ${label}`}
          aria-current={active ? "true" : undefined}
          className="relative flex items-center justify-center rounded-md transition-all overflow-hidden hover:shadow-md"
          style={{
            width: TILE_W,
            height: h,
            border: active ? "2px solid #4A3FB5" : "1.5px solid #5DCAA5",
            backgroundColor: "transparent",
            color: "#0F6E56",
          }}
        >
          <span className="px-2 text-[10px] font-semibold leading-tight text-center line-clamp-3 break-words">
            {label}
          </span>
        </button>
        <span
          aria-hidden="true"
          className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 inline-flex items-center justify-center rounded-full w-4 h-4 text-[10px] font-bold leading-none ring-2 ring-white"
          style={{ backgroundColor: "#0F6E56", color: "#ffffff" }}
        >
          N
        </span>
      </div>
    </div>
  );
}

// A hoverable horizontal gap between two stacked thumbnails. The "+" sits
// centred over the thumbnail column (offset past the number column). Clicking
// opens the insert form (which flips above when near the bottom of the screen).
function InsertGap({
  open,
  onOpen,
  onClose,
  canInsert,
  loginHref,
  onSubmit,
}: {
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
    <div className="flex items-center" style={{ height: GAP_H }}>
      <span className="shrink-0" style={{ width: NUM_W }} aria-hidden="true" />
      <div
        className="group relative ml-1.5 flex items-center justify-center"
        style={{ width: TILE_W }}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-x-0 h-px transition-colors ${open ? "bg-brand/40" : "bg-transparent group-hover:bg-brand/30"}`}
        />
        <button
          ref={btnRef}
          type="button"
          onClick={open ? onClose : onOpen}
          aria-label="Insert a slide here"
          className={`relative z-[1] flex h-4 w-4 items-center justify-center rounded-full bg-brand text-white transition-opacity ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
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
      </div>
    </div>
  );
}

export default function FloatingThumbnailStrip({
  deck,
  items,
  activeIndex,
  onSelect,
  commentCountBySlide,
  showInsert,
  canInsert,
  loginHref,
  onInsertStub,
}: Props) {
  const [openGap, setOpenGap] = useState<number | null>(null);

  function renderGap(gapIndex: number) {
    if (!showInsert) {
      return (
        <div
          key={`gap-${gapIndex}`}
          aria-hidden="true"
          style={{ height: GAP_H }}
        />
      );
    }
    return (
      <InsertGap
        key={`gap-${gapIndex}`}
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
    <div dir="ltr" className="flex flex-col items-start pl-1 pr-1.5 py-1.5">
      {renderGap(0)}
      {items.map((item, i) => (
        <div key={i} className="flex flex-col items-start">
          {item.kind === "slide" ? (
            <SlideThumb
              deck={deck}
              slideIndex={item.slideIndex}
              number={i + 1}
              active={i === activeIndex}
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
  );
}
