"use client";

// The new, gated "floating" viewer. It lives ALONGSIDE the current viewer
// (SlideViewer.tsx) and is only reached via ?view=floating — default off, so
// production is unaffected until the flag is flipped. It deliberately does NOT
// import or modify SlideViewer; it reuses the same pure building blocks
// (parseDeck + buildSrcdoc) and the same self-contained controls (version nav,
// avatar menu, copy-link, send-to-AI) so behaviour matches with no risk to the
// live viewer.
//
// Phase 2: the controls don't fully disappear — at rest they COLLAPSE to a
// minimal set (logo + slides toggle on the left; Comments + Share on the right;
// the side arrows). The rest (deck title, version, avatar, Send-to-AI, counter,
// zoom, pin) tucks away. Moving the cursor to the TOP of the frame — or tabbing
// to a control — expands everything again. We never lay a full-viewport layer
// over the slide, so its centre stays selectable/clickable; collapsed controls
// are `pointer-events: none`.
//
//   Persistent: logo+name → dashboard, slides toggle, Comments, Share, arrows.
//   Collapse at rest: version chip + history, avatar / Sign in, Send to AI,
//               counter, zoom, pin.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseDeck, buildSrcdoc, EMPTY_DECK, type ParsedDeck } from "./parse-deck";
import DeckVersionNav, { type VersionNavItem } from "./DeckVersionNav";
import CopyLinkButton from "./CopyLinkButton";
import SendToClaudeButton from "./SendToClaudeButton";
import AvatarMenu from "@/components/AvatarMenu";

// ── TUNABLE ──────────────────────────────────────────────────────────────
// How long (in milliseconds) the controls stay expanded after you stop
// interacting, before they collapse to the minimal set. Change this one number
// to taste: 2500 = snappy, 4000 = relaxed, 6000 = lingering.
const IDLE_FADE_MS = 6000;
// How close to the top of the frame (in px) the cursor must come to re-expand
// the controls. Larger = easier to trigger.
const TOP_REVEAL_PX = 90;
// ─────────────────────────────────────────────────────────────────────────

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
      data-floating-control
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

// Horizontal collapse wrapper. Uses the grid `1fr → 0fr` trick so its auto-width
// content animates smoothly to zero — and because the inner cell is
// `overflow-hidden`, a styled button inside (with its own padding/border) is
// CLIPPED to zero rather than flooring at its padding width. When collapsed it's
// `pointer-events: none`. `expandedExtra` carries any margin that should appear
// only while expanded (so spacing collapses too). Honors reduced motion.
function Collapsible({
  expanded,
  reducedMotion,
  expandedExtra = "",
  children,
}: {
  expanded: boolean;
  reducedMotion: boolean;
  expandedExtra?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`grid ${
        expanded
          ? `grid-cols-[1fr] opacity-100 ${expandedExtra}`
          : "grid-cols-[0fr] opacity-0 mx-0 pointer-events-none"
      }`}
      style={
        reducedMotion
          ? undefined
          : {
              transition:
                "grid-template-columns 300ms ease, opacity 300ms ease, margin 300ms ease",
            }
      }
    >
      <span className="inline-flex items-center overflow-hidden min-w-0 whitespace-nowrap">
        {children}
      </span>
    </span>
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

  // ── Reveal / collapse (Phase 2) ──────────────────────────────────────────
  // `expanded` = full controls; otherwise the minimal resting set. We start
  // expanded, then collapse after IDLE_FADE_MS. Reveal happens ONLY when the
  // cursor comes near the TOP of the frame (calm reading mode), or on keyboard
  // focus / a top-edge touch. Detection is parent-side only — no overlay over
  // the slide — so the slide centre stays selectable.
  //
  // We never collapse while something is "holding" the controls open: a
  // dropdown/menu is open, a control is hovered or focused, or the user pinned
  // them. Checked when the timer fires; if held, we re-check shortly after.
  const [expanded, setExpanded] = useState(true);
  const [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(false);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read "should stay open" straight from the live DOM, so there's no extra
  // state to keep in sync: an open PortalPopover renders role="dialog"/"menu";
  // hovered/focused controls are tagged data-floating-control.
  const isHeldOpen = useCallback(() => {
    if (pinnedRef.current) return true;
    if (typeof document === "undefined") return false;
    if (document.querySelector('[role="dialog"], [role="menu"]')) return true;
    if (document.querySelector("[data-floating-control]:hover")) return true;
    const ae = document.activeElement as HTMLElement | null;
    if (ae && ae.closest && ae.closest("[data-floating-control]")) return true;
    return false;
  }, []);

  const scheduleCollapse = useCallback(() => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    const tick = () => {
      if (isHeldOpen()) {
        // Held open (menu / hover / focus / pin) — don't collapse; re-check soon.
        collapseTimerRef.current = setTimeout(tick, 700);
      } else {
        setExpanded(false);
      }
    };
    collapseTimerRef.current = setTimeout(tick, IDLE_FADE_MS);
  }, [isHeldOpen]);

  const reveal = useCallback(() => {
    setExpanded(true);
    scheduleCollapse();
  }, [scheduleCollapse]);

  useEffect(() => {
    scheduleCollapse(); // expanded on load; begin the collapse countdown
    const onMove = (e: MouseEvent) => {
      if (e.clientY <= TOP_REVEAL_PX) reveal();
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t && t.clientY <= TOP_REVEAL_PX) reveal();
    };
    const onFocusIn = () => reveal();
    const passive = { passive: true } as AddEventListenerOptions;
    window.addEventListener("pointermove", onMove, passive);
    window.addEventListener("touchstart", onTouch, passive);
    window.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("focusin", onFocusIn);
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, [reveal, scheduleCollapse]);

  // Pin / keep-visible toggle. Set the ref first so the very next collapse check
  // sees the new state, then expand immediately.
  const togglePin = useCallback(() => {
    const next = !pinnedRef.current;
    pinnedRef.current = next;
    setPinned(next);
    reveal();
  }, [reveal]);

  // Respect the OS "reduce motion" setting: collapse instantly, no animation.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // One-time hint (first visit only) that the controls hide while reading.
  // `null` = not eligible / already seen → never rendered. Browser-only
  // (localStorage) so it's read in an effect, never during SSR.
  const [showHint, setShowHint] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      if (localStorage.getItem("sh-floating-hint-seen")) return;
      localStorage.setItem("sh-floating-hint-seen", "1");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowHint(true);
      const t = setTimeout(() => setShowHint(false), 6000);
      return () => clearTimeout(t);
    } catch {
      // localStorage unavailable (private mode, etc.) — just skip the hint.
    }
  }, []);

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

  // Shared frosted-pill look for the corner clusters. Fixed height so the two
  // top clusters match; no flex `gap` because spacing is managed per-item (and
  // some items collapse, taking their spacing with them). The clusters' shell
  // stays visible at all times — only their "extra" contents collapse.
  const cluster =
    "absolute z-20 flex items-center h-[52px] rounded-2xl border border-black/[0.06] bg-white/80 px-2.5 shadow-[0_6px_22px_rgba(0,0,0,0.10)] backdrop-blur-md";

  // Bottom controls (counter, zoom, pin) overlap the slide, so they fade OUT at
  // rest (the cluster "extra" items collapse horizontally instead). Under
  // `prefers-reduced-motion` we drop the animation and switch instantly.
  const fadeTransition = reducedMotion ? "" : "transition-opacity duration-300";
  const bottomFade = expanded
    ? `${fadeTransition} opacity-100`
    : `${fadeTransition} opacity-0 pointer-events-none`;

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

          {/* TOP-LEFT — deck zone. Logo + slides toggle persist; the divider,
              deck title and version chip collapse away at rest. */}
          <div data-floating-control className={`${cluster} top-4 left-4`}>
            <Link
              href={homeHref}
              className="flex items-center gap-2 text-brand font-semibold shrink-0"
              aria-label="SlideHuddle — go to your dashboard"
            >
              <span className="inline-block h-6 w-6 rounded-md bg-brand" />
              <span className="text-[15px]">SlideHuddle</span>
            </Link>

            {deckId && (
              <>
                <span
                  aria-hidden="true"
                  className="mx-1.5 h-5 w-px bg-black/10 shrink-0"
                />
                <Placeholder
                  title="Slides strip"
                  className="h-[30px] w-[30px] rounded-lg shrink-0"
                >
                  <SlidesStripIcon />
                </Placeholder>
                <Collapsible expanded={expanded} reducedMotion={reducedMotion}>
                  <span
                    aria-hidden="true"
                    className="mx-1.5 h-5 w-px bg-black/10 shrink-0"
                  />
                  <DeckVersionNav
                    deckId={deckId}
                    title={deckTitle}
                    currentVersion={currentVersion}
                    viewingVersion={viewingVersion}
                    versions={versions}
                  />
                </Collapsible>
              </>
            )}
          </div>

          {/* TOP-RIGHT — actions: avatar · Send to AI · Comments · Share.
              Avatar + Send-to-AI collapse at rest; Comments + Share persist. */}
          <div data-floating-control className={`${cluster} top-4 right-4`}>
            {isStored ? (
              <>
                <Collapsible
                  expanded={expanded}
                  reducedMotion={reducedMotion}
                  expandedExtra="mr-2"
                >
                  <span className="inline-flex items-center gap-2">
                    {currentUserEmail ? (
                      <AvatarMenu email={currentUserEmail} />
                    ) : (
                      <Link
                        href={loginHref}
                        className="text-sm font-semibold text-brand hover:text-brand-hover px-1 whitespace-nowrap"
                      >
                        Sign in
                      </Link>
                    )}
                    {canSendToAI && (
                      <SendToClaudeButton
                        label="Send to AI"
                        emptyLabel="No comments for AI yet"
                        minWidthClass="min-w-[208px]"
                        feedbackText={feedbackText}
                        conversationId={conversationId}
                      />
                    )}
                  </span>
                </Collapsible>

                {showComments && (
                  <Placeholder
                    title="Comments"
                    className="gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold shrink-0"
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

                <span className={`shrink-0 ${showComments ? "ml-2" : ""}`}>
                  <CopyLinkButton label="Share" />
                </span>
              </>
            ) : currentUserEmail ? (
              <AvatarMenu email={currentUserEmail} />
            ) : (
              <Link
                href={loginHref}
                className="text-sm font-semibold text-brand hover:text-brand-hover px-1"
              >
                Sign in
              </Link>
            )}
          </div>

          {/* Side navigation arrows. These sit in the side margins, NOT over the
              slide content, so they stay visible (they don't join the fade). */}
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
          <span className={`absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 text-white text-xs font-medium px-3 py-1 tabular-nums select-none ${bottomFade}`}>
            {safeIndex + 1} / {slideCount}
          </span>

          {/* Zoom control placeholder, bottom-right (inert for now). */}
          <Placeholder
            title="Zoom"
            className={`absolute bottom-4 right-4 z-20 gap-2 rounded-xl border border-black/[0.06] bg-white/80 px-2.5 py-1.5 text-sm font-semibold shadow-[0_6px_22px_rgba(0,0,0,0.10)] backdrop-blur-md ${bottomFade}`}
          >
            <span className="w-4 text-center">&minus;</span>
            100%
            <span className="w-4 text-center">+</span>
          </Placeholder>

          {/* Pin / keep-visible toggle, bottom-left. When pinned, the controls
              never fade (it counts as "held open"), so the pin stays reachable
              to switch auto-hide back on. */}
          <button
            type="button"
            data-floating-control
            onClick={togglePin}
            aria-pressed={pinned}
            title={
              pinned
                ? "Controls pinned — click to let them auto-hide"
                : "Keep controls visible (pin)"
            }
            className={`absolute bottom-4 left-4 z-20 h-9 w-9 rounded-xl border flex items-center justify-center backdrop-blur-md shadow-[0_6px_22px_rgba(0,0,0,0.10)] ${bottomFade}`}
            style={
              pinned
                ? { backgroundColor: "#4A3FB5", color: "#ffffff", borderColor: "#4A3FB5" }
                : {
                    backgroundColor: "rgba(255,255,255,0.8)",
                    color: "#6b6b75",
                    borderColor: "rgba(0,0,0,0.06)",
                  }
            }
          >
            {/* thumbtack / pin icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14l-1.6-2.6a2 2 0 0 1-.3-1.05V8a2 2 0 0 1 1.4-1.9L19 6V4H5v2l.5.1A2 2 0 0 1 6.9 8v5.35a2 2 0 0 1-.3 1.05L5 17z" />
            </svg>
          </button>

          {/* One-time hint that the controls auto-hide. Subtle, non-blocking,
              and fades out on its own (instant under reduced motion). */}
          {showHint !== null && (
            <div
              role="status"
              className={`absolute bottom-16 left-1/2 z-30 -translate-x-1/2 max-w-[88vw] rounded-full bg-black/70 text-white text-xs font-medium px-3.5 py-2 shadow-lg pointer-events-none select-none ${fadeTransition} ${
                showHint ? "opacity-100" : "opacity-0"
              }`}
            >
              These controls tuck away while you read — move your cursor to the top to bring them back.
            </div>
          )}
        </>
      )}
    </div>
  );
}
