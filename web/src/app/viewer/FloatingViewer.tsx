"use client";

// The new, gated "floating" viewer. It lives ALONGSIDE the current viewer
// (SlideViewer.tsx) and is only reached via ?view=floating — default off, so
// production is unaffected until the flag is flipped. It deliberately does NOT
// import or modify SlideViewer; it reuses the same pure building blocks
// (parseDeck + buildSrcdoc) and the same self-contained controls (version nav,
// avatar menu, copy-link, send-to-AI) so behaviour matches with no risk to the
// live viewer.
//
// Phase 1: the current slide renders FULL-BLEED (edge to edge) with small
// floating control clusters tucked into the corners — always visible (the
// fade-when-idle behaviour comes in a later phase). The clusters never lay a
// full-viewport layer over the slide, so the central area stays free for text
// selection in a later phase.
//
//   Live now:   logo+name → dashboard, version chip + history, avatar / Sign in,
//               Share (copy link + toast), Send to AI, prev/next arrows, counter.
//   Placeholder (visible but inert, wired next phase): slides/thumbnails toggle,
//               Comments, zoom.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseDeck, buildSrcdoc, EMPTY_DECK, type ParsedDeck } from "./parse-deck";
import DeckVersionNav, { type VersionNavItem } from "./DeckVersionNav";
import CopyLinkButton from "./CopyLinkButton";
import SendToClaudeButton from "./SendToClaudeButton";
import AvatarMenu from "@/components/AvatarMenu";

type Props = {
  /** The deck HTML to render (same value the current viewer receives). */
  rawHtml: string;
  /** Stored-deck id, or null for sample/param decks (no version/share/AI). */
  deckId: string | null;
  deckTitle: string | null;
  currentVersion: number;
  viewingVersion: number;
  versions: VersionNavItem[];
  /** Read-only (a historical version): owner actions are suppressed. */
  readOnly: boolean;
  currentUserId: string | null;
  currentUserEmail: string | null;
  isOwner: boolean;
  conversationId: string | null;
  /** Owner-only prebuilt "Send to AI" prompt, or null. Computed server-side. */
  feedbackText: string | null;
  loginHref: string;
};

// A visible-but-inert control. Signals "coming soon" without pretending to work:
// not a button, not focusable, cursor shows it's unavailable.
function Placeholder({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      title={`${title} — coming soon`}
      className={`inline-flex items-center justify-center text-[#9a96b8] opacity-70 cursor-not-allowed select-none ${className}`}
    >
      {children}
    </span>
  );
}

// The slides/thumbnails toggle icon: three 16:9 slide thumbnails stacked, the
// middle one highlighted (the current slide). Inert placeholder for now.
function SlidesStripIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="7.5" y="2.4" width="9" height="5.06" rx="0.8" />
      <rect x="7.5" y="9.47" width="9" height="5.06" rx="0.8" fill="currentColor" />
      <rect x="7.5" y="16.54" width="9" height="5.06" rx="0.8" />
    </svg>
  );
}

export default function FloatingViewer({
  rawHtml,
  deckId,
  deckTitle,
  currentVersion,
  viewingVersion,
  versions,
  readOnly,
  currentUserId,
  currentUserEmail,
  isOwner,
  conversationId,
  feedbackText,
  loginHref,
}: Props) {
  // parseDeck uses DOMParser, which only exists in the browser. Keep the
  // initial render empty so SSR is safe, then parse on the client after mount —
  // identical to how SlideViewer.tsx handles it.
  const [deck, setDeck] = useState<ParsedDeck>(EMPTY_DECK);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeck(parseDeck(rawHtml));
  }, [rawHtml]);

  // Navigation over the deck's real slides. (Requested-slide "stubs" are part of
  // the collaboration layer, wired in a later phase along with comments.)
  const [activeIndex, setActiveIndex] = useState(0);
  const slideCount = deck.slides.length;
  const hasSlides = slideCount > 0;
  const safeIndex = Math.min(activeIndex, Math.max(0, slideCount - 1));
  const currentSlideHtml = hasSlides ? deck.slides[safeIndex] : "";

  const goPrev = () => setActiveIndex((i) => Math.max(0, i - 1));
  const goNext = () => setActiveIndex((i) => Math.min(slideCount - 1, i + 1));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setActiveIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight")
        setActiveIndex((i) => Math.min(slideCount - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slideCount]);

  // Natural canvas discovered by measuring the rendered content (ground truth
  // for Claude artifacts that animate content in). Same approach as SlideViewer.
  const [measuredCanvas, setMeasuredCanvas] = useState<
    { w: number; h: number } | null
  >(null);

  // Trust the deck's declared dimensions when present; only fall back to the
  // runtime measurement for decks with no detectable canvas. (Mirrors
  // SlideViewer's logic — keeps the slide from visibly resizing on load.)
  const useMeasured = !deck.dimsDetected;
  const effectiveW =
    (useMeasured ? measuredCanvas?.w : undefined) ?? deck.slideWidth;
  const effectiveH =
    (useMeasured ? measuredCanvas?.h : undefined) ?? deck.slideHeight;

  // Reset measurement whenever the slide content changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMeasuredCanvas(null);
  }, [currentSlideHtml]);

  // The display iframe posts its rendered size back here (opaque origin →
  // cross-origin postMessage). Treat it as untrusted: validate the marker,
  // only read numeric w/h.
  useEffect(() => {
    function handle(e: MessageEvent) {
      const data = e.data as { __slidehuddle?: string; w?: number; h?: number };
      if (!data || data.__slidehuddle !== "measure") return;
      if (typeof data.w !== "number" || typeof data.h !== "number") return;
      if (data.w <= 0 || data.h <= 0) return;
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

  // Scale-to-fit: contain the deck's natural aspect ratio within the full-bleed
  // stage (the whole viewport here — no top nav, no panels).
  const stageRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  useEffect(() => {
    function measure() {
      const stage = stageRef.current;
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const maxW = r.width;
      const maxH = r.height;
      const slideAR = effectiveW / effectiveH;
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
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [effectiveW, effectiveH, hasSlides]);

  const srcDoc = useMemo(
    () =>
      buildSrcdoc(currentSlideHtml, deck.headHtml, deck.hasAuthoredStyles, {
        measure: useMeasured,
      }),
    [currentSlideHtml, deck.headHtml, deck.hasAuthoredStyles, useMeasured],
  );

  const isStored = !!deckId;
  // Logo target mirrors the shared TopNav: dashboard when signed in, else home.
  const homeHref = currentUserId ? "/dashboard" : "/";
  // Owner curation actions (Send to AI) are suppressed on a read-only view, for
  // non-owners, and on non-stored decks — matching the current viewer's gating.
  const canSendToAI = isOwner && !readOnly && isStored;
  // Comments are a signed-in collaboration feature; an anonymous link-viewer
  // sees the slide + navigation only (no comments), matching the requirement.
  const showComments = isStored && !!currentUserId;

  // Shared frosted-pill look for the corner clusters. A fixed height keeps the
  // top-left (deck zone) and top-right (actions) clusters the same height even
  // though their tallest children differ (e.g. the Share button is taller than
  // the version chip); items-center vertically centres each cluster's contents.
  const cluster =
    "absolute z-20 flex items-center gap-2 h-[52px] rounded-2xl border border-black/[0.06] bg-white/80 px-2.5 shadow-[0_6px_22px_rgba(0,0,0,0.10)] backdrop-blur-md";

  return (
    <div
      ref={stageRef}
      className="relative flex-1 min-w-0 min-h-0 flex items-center justify-center bg-[#f6f6fa] overflow-hidden"
    >
      {!hasSlides ? (
        <p className="text-muted">No slides to display.</p>
      ) : (
        <>
          {/* The slide, contained/letterboxed within the full-bleed stage. */}
          <div
            className="relative bg-white overflow-hidden"
            style={{
              width: cardSize.width ? `${cardSize.width}px` : undefined,
              height: cardSize.height ? `${cardSize.height}px` : undefined,
            }}
          >
            <iframe
              key={`display-${safeIndex}`}
              title={`Slide ${safeIndex + 1}`}
              srcDoc={srcDoc}
              sandbox="allow-scripts"
              className="border-0 block bg-white absolute top-1/2 left-1/2"
              style={{
                width: `${effectiveW}px`,
                height: `${effectiveH}px`,
                transform: `translate(-50%, -50%) scale(${scale})`,
                transformOrigin: "center center",
              }}
            />
          </div>

          {/* TOP-LEFT — deck zone: logo+name | slides-toggle · title · version. */}
          <div className={`${cluster} top-4 left-4`}>
            <Link
              href={homeHref}
              className="flex items-center gap-2 text-brand font-semibold"
              aria-label="SlideHuddle — go to your dashboard"
            >
              <span className="inline-block h-6 w-6 rounded-md bg-brand" />
              <span className="text-[15px]">SlideHuddle</span>
            </Link>

            {deckId && (
              <>
                <span
                  aria-hidden="true"
                  className="mx-0.5 h-5 w-px bg-black/10"
                />
                <Placeholder title="Slides strip" className="h-[30px] w-[30px] rounded-lg">
                  <SlidesStripIcon />
                </Placeholder>
                <DeckVersionNav
                  deckId={deckId}
                  title={deckTitle}
                  currentVersion={currentVersion}
                  viewingVersion={viewingVersion}
                  versions={versions}
                />
              </>
            )}
          </div>

          {/* TOP-RIGHT — actions: comments · avatar · Share · Send to AI. */}
          <div className={`${cluster} top-4 right-4`}>
            {showComments && (
              <Placeholder
                title="Comments"
                className="gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Comments
              </Placeholder>
            )}

            {currentUserEmail ? (
              <AvatarMenu email={currentUserEmail} />
            ) : (
              <Link
                href={loginHref}
                className="text-sm font-semibold text-brand hover:text-brand-hover px-1"
              >
                Sign in
              </Link>
            )}

            {isStored && <CopyLinkButton label="Share" />}

            {canSendToAI && (
              <SendToClaudeButton
                label="Send to AI"
                emptyLabel="No comments for AI yet"
                minWidthClass="min-w-[208px]"
                feedbackText={feedbackText}
                conversationId={conversationId}
              />
            )}
          </div>

          {/* Side navigation arrows. */}
          <button
            type="button"
            onClick={goPrev}
            disabled={safeIndex === 0}
            aria-label="Previous slide"
            className="absolute left-4 top-1/2 z-20 -translate-y-1/2 h-11 w-11 rounded-full bg-white/75 backdrop-blur-sm border border-black/[0.08] flex items-center justify-center text-brand hover:bg-white disabled:opacity-0 transition-all shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={safeIndex === slideCount - 1}
            aria-label="Next slide"
            className="absolute right-4 top-1/2 z-20 -translate-y-1/2 h-11 w-11 rounded-full bg-white/75 backdrop-blur-sm border border-black/[0.08] flex items-center justify-center text-brand hover:bg-white disabled:opacity-0 transition-all shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* Counter pill, bottom-center. */}
          <span className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 text-white text-xs font-medium px-3 py-1 tabular-nums select-none">
            {safeIndex + 1} / {slideCount}
          </span>

          {/* Zoom control placeholder, bottom-right (inert for now). */}
          <Placeholder
            title="Zoom"
            className="absolute bottom-4 right-4 z-20 gap-2 rounded-xl border border-black/[0.06] bg-white/80 px-2.5 py-1.5 text-sm font-semibold shadow-[0_6px_22px_rgba(0,0,0,0.10)] backdrop-blur-md"
          >
            <span className="w-4 text-center">&minus;</span>
            100%
            <span className="w-4 text-center">+</span>
          </Placeholder>
        </>
      )}
    </div>
  );
}
