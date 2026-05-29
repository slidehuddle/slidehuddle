"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CommentsPanel from "./CommentsPanel";
import type { CommentRow } from "@/lib/slide-store";

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
  deckId: string | null;
  initialComments: CommentRow[];
  currentUserId: string | null;
  currentUserEmail: string | null;
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

// Tiny script injected at the end of every slide's HTML. Runs only in the
// display iframe (sandbox="allow-scripts"); the measurement iframe has no
// allow-scripts so this is a no-op there. The script posts the rendered
// content's dimensions back to the parent so the card can be sized to
// what the user actually sees — important for Claude artifacts whose
// scripts inject content or animate it into place (the static-layout
// measurement done by the hidden iframe gives the WRONG answer in that
// case).
const MEASURE_SCRIPT = `
(function () {
  function summarise() {
    var b = document.body;
    var h = document.documentElement;
    if (!b || !h) return null;
    var kids = b.children;
    var childSummaries = [];
    for (var i = 0; i < kids.length && i < 12; i++) {
      var el = kids[i];
      var r = el.getBoundingClientRect();
      childSummaries.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || "").toString().slice(0, 80),
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      });
    }
    return {
      bodyScrollW: b.scrollWidth,
      bodyScrollH: b.scrollHeight,
      bodyClientW: b.clientWidth,
      bodyClientH: b.clientHeight,
      htmlScrollW: h.scrollWidth,
      htmlScrollH: h.scrollHeight,
      childCount: kids.length,
      children: childSummaries,
      // First 400 chars of body HTML — enough to see the top-level structure.
      bodyHtmlSnippet: (b.outerHTML || "").slice(0, 400),
    };
  }
  function post() {
    try {
      var b = document.body;
      var h = document.documentElement;
      if (!b || !h) return;
      var w = Math.max(b.scrollWidth, h.scrollWidth);
      var ht = Math.max(b.scrollHeight, h.scrollHeight);
      if (w > 0 && ht > 0) {
        window.parent.postMessage(
          { __slidehuddle: "measure", w: w, h: ht, debug: summarise() },
          "*"
        );
      }
    } catch (e) {}
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    post();
  } else {
    document.addEventListener("DOMContentLoaded", post);
  }
  window.addEventListener("load", post);
  setTimeout(post, 500);
  setTimeout(post, 1500);
})();
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
<body>${slideHtml}<script>${MEASURE_SCRIPT}</script></body>
</html>`;
}

const EMPTY_DECK: ParsedDeck = {
  headHtml: "",
  slides: [],
  hasAuthoredStyles: false,
  slideWidth: DEFAULT_SLIDE_W,
  slideHeight: DEFAULT_SLIDE_H,
};

export default function SlideViewer({
  rawHtml,
  deckId,
  initialComments,
  currentUserId,
  currentUserEmail,
}: Props) {
  // parseDeck uses DOMParser, which only exists in the browser. Keep the
  // initial render empty so SSR is safe, then parse on the client after
  // mount. There's a brief frame where the viewer is empty — fine in dev,
  // and avoids a hard SSR crash in production.
  const [deck, setDeck] = useState<ParsedDeck>(EMPTY_DECK);
  useEffect(() => {
    // parseDeck uses DOMParser (browser-only); deferring to useEffect is
    // the SSR-safe pattern per the comment above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeck(parseDeck(rawHtml));
  }, [rawHtml]);
  const [index, setIndex] = useState(0);

  // Comments state owned here because the panel renders alongside slides
  // and the off-slide-count badge is tied to the current slide index.
  const [comments, setComments] = useState<CommentRow[]>(initialComments);
  const [commentsOpen, setCommentsOpen] = useState(false);

  // Natural canvas dimensions discovered by measuring the iframe's
  // actual rendered content after it loads. For Claude artifacts that
  // don't declare explicit pixel sizes in their CSS, detectSlideDimensions
  // gives up and returns the default — measurement is the ground truth.
  // null until the iframe has loaded at least once.
  const [measuredCanvas, setMeasuredCanvas] = useState<
    { w: number; h: number } | null
  >(null);

  const hasSlides = deck.slides.length > 0;
  const safeIndex = Math.min(index, Math.max(0, deck.slides.length - 1));
  const current = hasSlides ? deck.slides[safeIndex] : "";

  // Effective canvas: prefer the measured-from-DOM value over the
  // CSS-detected one. Falls back to detected (which itself falls back to
  // 1280×720) before the iframe has had a chance to render and measure.
  const effectiveW = measuredCanvas?.w ?? deck.slideWidth;
  const effectiveH = measuredCanvas?.h ?? deck.slideHeight;

  // Reset measurement whenever the slide content changes, so the next
  // iframe load triggers a fresh measure.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMeasuredCanvas(null);
  }, [current]);

  // The display iframe runs MEASURE_SCRIPT, which posts the rendered
  // content size back here via postMessage. The display iframe has an
  // opaque origin (sandbox="allow-scripts" without allow-same-origin),
  // so cross-origin postMessage is the only way it can communicate with
  // the parent. We measure the actual rendered content — not the static
  // pre-script layout — which is what matters for Claude artifacts whose
  // scripts inject or animate content into place.
  useEffect(() => {
    function handle(e: MessageEvent) {
      const data = e.data as {
        __slidehuddle?: string;
        w?: number;
        h?: number;
        debug?: unknown;
      };
      if (!data || data.__slidehuddle !== "measure") return;
      if (typeof data.w !== "number" || typeof data.h !== "number") return;
      if (data.w <= 0 || data.h <= 0) return;
      // Diagnostic logging (temporary). Helps see what the iframe is
      // actually reporting when sizing looks wrong. Safe to leave on
      // until we've figured out the tall-content-with-empty-space case.
      console.log("[SlideHuddle measure]", { w: data.w, h: data.h, debug: data.debug });
      setMeasuredCanvas((prev) => {
        if (
          prev &&
          Math.abs(prev.w - data.w!) < 4 &&
          Math.abs(prev.h - data.h!) < 4
        ) {
          return prev;
        }
        return { w: data.w!, h: data.h! };
      });
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, []);

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

  // Measure the wrapper around the slide card and compute card dimensions
  // that contain the deck's natural aspect ratio within the available
  // viewport area. Without this, a tall deck (e.g. 1280×2400 captured from
  // a Claude artifact with stacked mockups) would render 2× viewport
  // height and force the page to scroll. Same idea as object-fit:contain.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  useEffect(() => {
    function measure() {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const r = wrapper.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      // Leave a small visual margin around the card so it doesn't touch
      // the side panel / nav row.
      const maxW = r.width * 0.95;
      const maxH = r.height * 0.95;
      const slideAR = effectiveW / effectiveH;
      // Pick whichever bound is hit first while preserving the slide's
      // natural aspect ratio.
      let w: number;
      let h: number;
      if (maxW / slideAR <= maxH) {
        w = maxW;
        h = w / slideAR;
      } else {
        h = maxH;
        w = h * slideAR;
      }
      setCardSize({ width: Math.floor(w), height: Math.floor(h) });
      setScale(Math.min(w / effectiveW, h / effectiveH));
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
    // Re-run when slide count or effective dimensions change (the
    // effective dimensions update when the iframe measurement comes in).
  }, [deck.slides.length, effectiveW, effectiveH]);

  // Per-slide and aggregate counts derived from the comments array.
  const commentsBySlide = useMemo(() => {
    const m = new Map<number, CommentRow[]>();
    for (const c of comments) {
      const list = m.get(c.slide_index);
      if (list) list.push(c);
      else m.set(c.slide_index, [c]);
    }
    return m;
  }, [comments]);
  const otherSlideCommentCount = useMemo(() => {
    let n = 0;
    for (const [slide, list] of commentsBySlide.entries()) {
      if (slide !== safeIndex) n += list.length;
    }
    return n;
  }, [commentsBySlide, safeIndex]);
  const canComment = !!(deckId && currentUserId);

  async function handleAddComment(body: string) {
    if (!deckId || !currentUserId) return;
    const optimisticId = `temp-${Date.now()}`;
    const optimistic: CommentRow = {
      id: optimisticId,
      deck_id: deckId,
      user_id: currentUserId,
      author_email: currentUserEmail,
      slide_index: safeIndex,
      body,
      created_at: new Date().toISOString(),
    };
    setComments((prev) => [...prev, optimistic]);
    const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
    const supabase = getSupabaseBrowser();
    const { data, error } = await supabase
      .from("comments")
      .insert({
        deck_id: deckId,
        user_id: currentUserId,
        author_email: currentUserEmail,
        slide_index: safeIndex,
        body,
      })
      .select("id, deck_id, user_id, author_email, slide_index, body, created_at")
      .single();
    if (error) {
      console.error("[SlideViewer] comment insert failed:", error);
      setComments((prev) => prev.filter((c) => c.id !== optimisticId));
      return;
    }
    setComments((prev) =>
      prev.map((c) => (c.id === optimisticId ? (data as CommentRow) : c)),
    );
  }

  async function handleDeleteComment(id: string) {
    const snapshot = comments;
    setComments((prev) => prev.filter((c) => c.id !== id));
    const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) {
      console.error("[SlideViewer] comment delete failed:", error);
      setComments(snapshot);
    }
  }

  if (!hasSlides) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <p>No slides to display.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-row min-h-0">
      <div className="flex-1 flex flex-col px-6 py-8 gap-6 min-w-0 min-h-0">
        {/*
          Scale-to-fit slide rendering. The wrapper takes whatever vertical
          space is left after the nav row; the card sizes itself to the
          larger of (width-limited, height-limited) within that space while
          preserving the deck's natural aspect ratio (object-fit:contain
          semantics). The iframe inside renders at the deck's detected
          natural canvas and is then visually scaled via CSS transform.
        */}
        <div
          ref={wrapperRef}
          className="flex-1 flex items-center justify-center w-full min-h-0"
        >
          <div
            ref={cardRef}
            className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(74,63,181,0.08)] border border-border overflow-hidden flex items-center justify-center"
            style={{
              width: cardSize.width ? `${cardSize.width}px` : undefined,
              height: cardSize.height ? `${cardSize.height}px` : undefined,
            }}
          >
            {/*
              Visible display iframe. allow-scripts (without
              allow-same-origin) lets Claude's HTML run its layout /
              animation scripts inside an opaque-origin sandbox — scripts
              can do whatever they want inside the iframe but can't reach
              the parent page. This is the standard pattern used by
              CodePen, JSFiddle, etc. Measurement is done by the hidden
              second iframe below; the parent can read THAT one because
              it uses allow-same-origin (with no scripts).
            */}
            <iframe
              key={`display-${safeIndex}`}
              title={`Slide ${safeIndex + 1}`}
              srcDoc={buildSrcdoc(current, deck.headHtml, deck.hasAuthoredStyles)}
              sandbox="allow-scripts"
              className="border-0 block bg-white shrink-0"
              style={{
                width: `${effectiveW}px`,
                height: `${effectiveH}px`,
                transformOrigin: "center center",
                transform: `scale(${scale})`,
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-center gap-6">
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
            {otherSlideCommentCount > 0 && (
              <span
                className="ml-2 text-brand"
                aria-label={`${otherSlideCommentCount} comment${otherSlideCommentCount === 1 ? "" : "s"} on other slides`}
              >
                · {otherSlideCommentCount}
              </span>
            )}
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

          {canComment && (
            <button
              type="button"
              onClick={() => setCommentsOpen((v) => !v)}
              aria-pressed={commentsOpen}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-brand hover:text-brand transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Comments
              {comments.length > 0 && (
                <span className="text-muted">({comments.length})</span>
              )}
            </button>
          )}
        </div>
      </div>

      {commentsOpen && canComment && deckId && currentUserId && (
        <CommentsPanel
          currentSlideIndex={safeIndex}
          comments={comments}
          currentUserId={currentUserId}
          onAdd={handleAddComment}
          onDelete={handleDeleteComment}
          onClose={() => setCommentsOpen(false)}
        />
      )}
    </div>
  );
}
