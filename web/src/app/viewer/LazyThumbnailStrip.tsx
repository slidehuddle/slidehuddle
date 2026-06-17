"use client";

// A horizontally-scrollable strip of a deck VERSION's slide thumbnails, used by
// the version-spine events. Each thumbnail is the cheap scaled-iframe render
// (buildSrcdoc + CSS transform, same as the deck viewer), but mounted LAZILY via
// IntersectionObserver: a 6-version deck would otherwise spawn 30+ iframes at
// once. A thumb only renders its iframe when it scrolls near the viewport; until
// then it's a light placeholder. Clicking a thumb selects that slide (peek/deck).

import { useEffect, useMemo, useRef, useState } from "react";
import { buildSrcdoc, type ParsedDeck } from "./parse-deck";

const THUMB_W = 116;

function LazyThumb({
  deck,
  srcDoc,
  slideNumber,
  onClick,
}: {
  deck: ParsedDeck;
  srcDoc: string;
  slideNumber: number;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "250px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const ar = (deck.slideWidth || 16) / (deck.slideHeight || 9);
  const h = Math.round(THUMB_W / ar);
  const scale = THUMB_W / (deck.slideWidth || 1);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={`Slide ${slideNumber}`}
      className="relative shrink-0 overflow-hidden rounded-md border border-border bg-white transition-shadow hover:shadow-md"
      style={{ width: THUMB_W, height: h }}
    >
      {visible && srcDoc ? (
        <iframe
          title={`Slide ${slideNumber}`}
          srcDoc={srcDoc}
          sandbox=""
          scrolling="no"
          tabIndex={-1}
          aria-hidden="true"
          className="origin-top-left border-0 bg-white pointer-events-none"
          style={{ width: deck.slideWidth, height: deck.slideHeight, transform: `scale(${scale})` }}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-[#f6f6fa] text-[10px] font-semibold text-muted">
          {slideNumber}
        </span>
      )}
    </button>
  );
}

export default function LazyThumbnailStrip({
  deck,
  onSelectSlide,
}: {
  /** That version's parsed slides; null/empty → nothing to show. */
  deck: ParsedDeck | null;
  onSelectSlide: (slideIndex: number) => void;
}) {
  // Cheap string concat, memoised per parsed deck (parsing happened upstream).
  const srcDocs = useMemo(
    () =>
      deck
        ? deck.slides.map((html) =>
            buildSrcdoc(html, deck.headHtml, deck.hasAuthoredStyles, { measure: false }),
          )
        : [],
    [deck],
  );

  if (!deck || deck.slides.length === 0) return null;

  return (
    <div className="thin-scrollbar flex gap-2 overflow-x-auto pb-1">
      {deck.slides.map((_, i) => (
        <LazyThumb
          key={i}
          deck={deck}
          srcDoc={srcDocs[i] ?? ""}
          slideNumber={i + 1}
          onClick={() => onSelectSlide(i)}
        />
      ))}
    </div>
  );
}
