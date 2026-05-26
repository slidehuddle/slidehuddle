"use client";

import { useEffect, useRef, useState } from "react";

// Default canvas if we can't detect the deck's authored dimensions.
// 1280×720 is the most common slide canvas size. We tried 960×540 to make
// fixed-pixel content render larger, but Claude's slides assume ~700px of
// vertical room for cards/padding/headers, and 540px clipped the bottom.
// 1280×720 stays the safe default; the right lever to make content feel
// bigger is card width (see SlideViewer JSX), not canvas size.
const DEFAULT_SLIDE_W = 1280;
const DEFAULT_SLIDE_H = 720;

type Props = {
  rawHtml: string;
};

type ParsedDeck = {
  /** Inline <style> + <link> tags from the captured document's head. */
  headHtml: string;
  /** Each entry is the HTML for one slide (no surrounding <html>/<body>). */
  slides: string[];
  /** True if the captured HTML brought its own styling. */
  hasAuthoredStyles: boolean;
  /** Detected (or default) natural canvas the deck was designed for. */
  slideWidth: number;
  slideHeight: number;
};

function parseDeck(rawHtml: string): ParsedDeck {
  const trimmed = rawHtml.trim();
  const emptyDeck: ParsedDeck = {
    headHtml: "",
    slides: [],
    hasAuthoredStyles: false,
    slideWidth: DEFAULT_SLIDE_W,
    slideHeight: DEFAULT_SLIDE_H,
  };
  if (!trimmed) return emptyDeck;

  // If it's not a full HTML document, fall back to the simple section split
  // (covers our hardcoded samples and any other "bare" slide HTML). No
  // authored CSS to mine for natural dimensions, so use the defaults.
  if (!/<html[\s>]/i.test(trimmed) && !/<!doctype/i.test(trimmed)) {
    const sections = trimmed.match(/<section\b[\s\S]*?<\/section>/gi);
    if (sections && sections.length > 0) {
      return {
        ...emptyDeck,
        slides: sections.map((s) =>
          s
            .replace(/^<section\b[^>]*>/i, "")
            .replace(/<\/section>\s*$/i, "")
            .trim()
        ),
      };
    }
    return { ...emptyDeck, slides: [trimmed] };
  }

  // Full document — parse it properly.
  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  const headHtml = extractHeadHtml(doc);
  const hasAuthoredStyles = /<style[\s>]/i.test(headHtml);
  const dims = detectSlideDimensions(doc) ?? {
    width: DEFAULT_SLIDE_W,
    height: DEFAULT_SLIDE_H,
  };

  // Strategy 1: Claude's inline-deck format — <div class="slide"> blocks.
  // CSS selector .slide matches `class="slide"` and `class="slide foo"` but
  // NOT `class="slide-number"`, so it's safe.
  const divSlides = [...doc.querySelectorAll("body div.slide")];
  if (divSlides.length > 0) {
    return {
      headHtml,
      slides: divSlides.map((el) => {
        // Claude's decks hide non-active slides via `.slide { opacity: 0 }`
        // and reveal the current one with `.slide.active { opacity: 1 }`.
        // The original deck's JS toggles this class as the user navigates;
        // our sandboxed viewer can't run that JS, so we force-mark every
        // extracted slide as active (and drop transition-out classes like
        // `exit`) so its CSS resolves to the visible state.
        el.classList.add("active");
        el.classList.remove("exit");
        return el.outerHTML;
      }),
      hasAuthoredStyles,
      slideWidth: dims.width,
      slideHeight: dims.height,
    };
  }

  // Strategy 2: <section> blocks inside body. Many Claude decks use
  // <section class="slide"> as the wrapper, so we preserve the wrapper
  // (via outerHTML) — stripping it would drop the `.slide` CSS bindings
  // that position and size the slide content. Same active-class
  // defence as Strategy 1, in case the deck toggles `.slide.active`.
  const sectionSlides = [...doc.querySelectorAll("body section")];
  if (sectionSlides.length > 0) {
    return {
      headHtml,
      slides: sectionSlides.map((el) => {
        el.classList.add("active");
        el.classList.remove("exit");
        return el.outerHTML;
      }),
      hasAuthoredStyles,
      slideWidth: dims.width,
      slideHeight: dims.height,
    };
  }

  // Fallback: the whole body as a single slide.
  return {
    headHtml,
    slides: [doc.body?.innerHTML || trimmed],
    hasAuthoredStyles,
    slideWidth: dims.width,
    slideHeight: dims.height,
  };
}

/**
 * Look in the captured deck's CSS for explicit canvas dimensions.
 * Tries several common patterns in priority order. Returns null if the deck
 * uses viewport-relative units (vh/vw) or doesn't declare a canvas at all —
 * the caller falls back to a sensible default in that case.
 */
function detectSlideDimensions(
  doc: Document,
): { width: number; height: number } | null {
  const styles = [...doc.querySelectorAll("style")];
  const cssText = styles.map((s) => s.textContent || "").join("\n");
  if (!cssText) return null;

  // Helper: pull a pixel value for a given CSS property from a rule body.
  const pxOf = (body: string, prop: string): number | null => {
    const re = new RegExp(
      `(?:^|[;{\\s])\\s*${prop}\\s*:\\s*(\\d{3,5})px\\b`,
      "i",
    );
    const m = body.match(re);
    return m ? parseInt(m[1], 10) : null;
  };

  // Iterate top-level rules whose selector text mentions a target. We use a
  // light regex to chunk on `{...}` because we only need a few specific
  // declarations — full CSS parsing would be overkill.
  function findFixedDimsForSelector(
    selectorRegex: RegExp,
  ): { width: number; height: number } | null {
    const ruleRe = /([^{}@]+)\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(cssText)) !== null) {
      const sel = m[1].trim();
      if (!selectorRegex.test(sel)) continue;
      const body = m[2];
      const w = pxOf(body, "width");
      const h = pxOf(body, "height");
      if (w && h && w >= 320 && h >= 240) return { width: w, height: h };
    }
    return null;
  }

  // 1. Explicit pixel width + height on a .slide rule
  const fromSlide = findFixedDimsForSelector(/(^|[\s,>+~])\.slide(\b|$|[.:#\[])/);
  if (fromSlide) return fromSlide;

  // 2. CSS variables — match patterns like --slide-w, --slide-width, etc.
  const wVar = cssText.match(/--slide[-_]?w(?:idth)?\s*:\s*(\d{3,5})px/i);
  const hVar = cssText.match(/--slide[-_]?h(?:eight)?\s*:\s*(\d{3,5})px/i);
  if (wVar && hVar) {
    return { width: parseInt(wVar[1], 10), height: parseInt(hVar[1], 10) };
  }

  // 3. Fixed pixel width + height on body or html
  const fromBody = findFixedDimsForSelector(/(^|[\s,>+~])(body|html)(\b|$|[.:#\[])/);
  if (fromBody) return fromBody;

  // 4. aspect-ratio declared on .slide — combine with a default width
  const arMatch = cssText.match(
    /\.slide\b[^{]*\{[^}]*aspect-ratio\s*:\s*(\d+(?:\.\d+)?)\s*[/\s]\s*(\d+(?:\.\d+)?)/i,
  );
  if (arMatch) {
    const ratio = parseFloat(arMatch[1]) / parseFloat(arMatch[2]);
    if (isFinite(ratio) && ratio > 0) {
      const width = DEFAULT_SLIDE_W;
      const height = Math.round(width / ratio);
      return { width, height };
    }
  }

  return null;
}

function extractHeadHtml(doc: Document): string {
  // Grab style/link/meta nodes from ANYWHERE in the captured document, not
  // just doc.head. Claude's inline-deck format keeps the deck-specific
  // stylesheet inline in <body> (before the slide divs), so a head-only walk
  // misses the most important CSS. Scripts are intentionally excluded — the
  // sandboxed iframe can't run them and they bloat the srcdoc.
  const tags = [...doc.querySelectorAll("style, link, meta")];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const el of tags) {
    const html = el.outerHTML;
    if (seen.has(html)) continue;
    seen.add(html);
    out.push(html);
  }
  return out.join("\n");
}

const DEFAULT_SLIDE_CSS = `
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    background: #ffffff;
    color: #1a1a1f;
    font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, sans-serif;
  }
  body {
    box-sizing: border-box;
    padding: 3rem 4rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: auto;
  }
  body > :last-child { margin-bottom: 0; }
  h1 {
    font-size: 2rem;
    font-weight: 700;
    color: #4A3FB5;
    margin: 0 0 1rem;
    line-height: 1.15;
  }
  h2 {
    font-size: 1.375rem;
    font-weight: 600;
    color: #1a1a1f;
    margin: 0 0 0.625rem;
  }
  p {
    font-size: 1.0625rem;
    line-height: 1.55;
    margin: 0 0 0.5rem;
  }
  ul {
    font-size: 1.0625rem;
    line-height: 1.5;
    padding-left: 1.5rem;
    margin: 0 0 0.5rem;
    list-style: disc;
  }
  ol {
    font-size: 1.0625rem;
    line-height: 1.5;
    padding-left: 1.5rem;
    margin: 0 0 0.5rem;
    list-style: decimal;
  }
  li { margin-bottom: 0.3rem; }
  .hint {
    color: #6b6b75;
    font-size: 0.95rem;
  }
`;

const FIT_TO_FRAME_CSS = `
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  body { display: block; }
`;

function buildSrcdoc(
  slideHtml: string,
  headHtml: string,
  hasAuthoredStyles: boolean,
): string {
  // When the captured deck brings its own styling, respect it — only inject
  // a minimal reset so the slide fills the iframe. Our opinionated defaults
  // only kick in for naked HTML like the sample deck.
  const baseCss = hasAuthoredStyles ? FIT_TO_FRAME_CSS : DEFAULT_SLIDE_CSS;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>${baseCss}</style>
  ${headHtml}
</head>
<body>${slideHtml}</body>
</html>`;
}

const EMPTY_DECK: ParsedDeck = {
  headHtml: "",
  slides: [],
  hasAuthoredStyles: false,
  slideWidth: DEFAULT_SLIDE_W,
  slideHeight: DEFAULT_SLIDE_H,
};

export default function SlideViewer({ rawHtml }: Props) {
  // parseDeck uses DOMParser, which only exists in the browser. Keep the
  // initial render empty so SSR is safe, then parse on the client after
  // mount. There's a brief frame where the viewer is empty — fine in dev,
  // and avoids a hard SSR crash in production.
  const [deck, setDeck] = useState<ParsedDeck>(EMPTY_DECK);
  useEffect(() => {
    setDeck(parseDeck(rawHtml));
  }, [rawHtml]);
  const [index, setIndex] = useState(0);

  const hasSlides = deck.slides.length > 0;
  const safeIndex = Math.min(index, Math.max(0, deck.slides.length - 1));
  const current = hasSlides ? deck.slides[safeIndex] : "";

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () =>
    setIndex((i) => Math.min(deck.slides.length - 1, i + 1));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deck.slides.length]);

  // Compute scale-to-fit factor by measuring the card's actual size and
  // comparing to the slide's natural canvas (1280×720). Re-runs on window
  // resize. We tried ResizeObserver but it didn't fire reliably in our
  // Chromium preview harness — window resize covers the only case that
  // changes the card's size for now (it's responsive to window width).
  const cardRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    function measure() {
      const el = cardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const sX = r.width / deck.slideWidth;
      const sY = r.height / deck.slideHeight;
      setScale(Math.min(sX, sY));
    }
    // Measure on mount + next animation frame (the card may not be in the
    // DOM on the very first effect run, because slides are parsed in a
    // separate effect — the rAF catches the post-parse render). Then keep
    // listening for window resizes.
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
    // Re-run when slide count or detected dimensions change.
  }, [deck.slides.length, deck.slideWidth, deck.slideHeight]);

  if (!hasSlides) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <p>No slides to display.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
      {/*
        Scale-to-fit slide rendering. The iframe renders at the deck's
        detected natural canvas (or 1280×720 default), and the card's
        aspect ratio is matched to those dimensions — so no letterboxing.
        We then visually scale the iframe down via CSS transform to fit.
      */}
      <div
        ref={cardRef}
        className="w-[80%] bg-white rounded-2xl shadow-[0_8px_40px_rgba(74,63,181,0.08)] border border-border overflow-hidden flex items-center justify-center"
        style={{ aspectRatio: `${deck.slideWidth} / ${deck.slideHeight}` }}
      >
        <iframe
          key={safeIndex}
          title={`Slide ${safeIndex + 1}`}
          srcDoc={buildSrcdoc(current, deck.headHtml, deck.hasAuthoredStyles)}
          sandbox=""
          className="border-0 block bg-white shrink-0"
          style={{
            width: `${deck.slideWidth}px`,
            height: `${deck.slideHeight}px`,
            transformOrigin: "center center",
            transform: `scale(${scale})`,
          }}
        />
      </div>

      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={goPrev}
          disabled={safeIndex === 0}
          aria-label="Previous slide"
          className="h-11 w-11 rounded-full border border-border flex items-center justify-center text-brand hover:bg-brand hover:text-white disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-brand transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <span className="text-sm text-muted tabular-nums min-w-[3rem] text-center">
          {safeIndex + 1} / {deck.slides.length}
        </span>

        <button
          type="button"
          onClick={goNext}
          disabled={safeIndex === deck.slides.length - 1}
          aria-label="Next slide"
          className="h-11 w-11 rounded-full border border-border flex items-center justify-center text-brand hover:bg-brand hover:text-white disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-brand transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
