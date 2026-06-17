"use client";

// The new full-bleed "floating" viewer. It lives ALONGSIDE the current viewer
// (SlideViewer.tsx) and is now the DEFAULT — the classic viewer is still
// reachable via ?view=classic, and FLOATING_VIEWER_DEFAULT (see page.tsx) is a
// server-side kill switch that rolls the default back. It deliberately does NOT
// import or modify SlideViewer; it reuses the same pure building blocks
// (parseDeck + buildSrcdoc) and the same self-contained controls (version nav,
// avatar menu, copy-link, send-to-AI) so behaviour matches with no risk to the
// live viewer.
//
// Phase 2: the controls don't fully disappear — at rest they COLLAPSE to a
// minimal set (logo + slides toggle on the left; Comments + Share on the right;
// the side arrows). The rest (deck title, version, avatar, Send-to-AI, counter,
// pin) tucks away. Moving the cursor to the TOP of the frame — or tabbing
// to a control — expands everything again. We never lay a full-viewport layer
// over the slide, so its centre stays selectable/clickable; collapsed controls
// are `pointer-events: none`.
//
//   Persistent: logo+name → dashboard, slides toggle, Comments, Share, arrows,
//               the slide COUNTER, and the rail SLIVER (badge dots on the left
//               edge — the team's comment activity never fully disappears, §4.1).
//   Collapse at rest: version chip + history, avatar / Sign in, Send to AI, pin.
//
// Inset, not overlay (design system §3.3): when the thumbnail strip or comments
// panel is OPEN, the slide SCALES DOWN and SHIFTS into the safe area beside the
// panel rather than being covered by it — the design review's #1 must-fix.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseDeck, buildSrcdoc, EMPTY_DECK, type ParsedDeck } from "./parse-deck";
import DeckVersionNav, { type VersionNavItem } from "./DeckVersionNav";
import CopyLinkButton from "./CopyLinkButton";
import SendToClaudeButton from "./SendToClaudeButton";
import CommentsPanel from "./CommentsPanel";
import StubSlideView from "./StubSlideView";
import SlideFlagControl from "./SlideFlagControl";
import FloatingThumbnailStrip from "./FloatingThumbnailStrip";
import HuddleAvatars from "./HuddleAvatars";
import { ReviewingChip, SharedDeckChip } from "./HuddleChips";
import ArrivalBanner from "./ArrivalBanner";
import type { ArrivalActivity } from "./arrival-activity";
import { useDeckComments } from "./useDeckComments";
import { useDeckStubs } from "./useDeckStubs";
import { useDeckFlags } from "./useDeckFlags";
import { useDeckVersionWatch } from "./useDeckVersionWatch";
import { buildDisplayItems } from "./display-items";
import { buildFeedbackPrompt, selectCuratedFeedback } from "./feedback-prompt";
import { track, identifyUser } from "@/lib/analytics";
import AvatarMenu from "@/components/AvatarMenu";
import PortalPopover from "@/components/PortalPopover";
import type {
  CommentRow,
  DeckParticipant,
  FlagRow,
  StubRow,
} from "@/lib/slide-store";

// ── TUNABLE ──────────────────────────────────────────────────────────────
// How long (in milliseconds) the controls stay expanded after you stop
// interacting, before they collapse to the minimal set. Change this one number
// to taste: 2500 = snappy, 4000 = relaxed, 6000 = lingering.
const IDLE_FADE_MS = 6000;
// How close to the top of the frame (in px) the cursor must come to re-expand
// the controls. Larger = easier to trigger.
const TOP_REVEAL_PX = 90;
// ─────────────────────────────────────────────────────────────────────────

// ── INSET LAYOUT (design system §3.3) ─────────────────────────────────────
// How much horizontal room each open side panel claims, so the slide can shrink
// to fit the space that's LEFT instead of being covered. Each value is the
// panel's own width + the edge gap it floats in (left-4 / right-4 = 16px) + a
// little breathing room between the panel and the slide. Keep these in sync
// with the panels' widths and offsets in the JSX below.
const EDGE_GAP = 16; // matches the panels' left-4 / right-4
const PANEL_GAP = 12; // breathing room between a panel and the slide
const STRIP_W = 185; // left thumbnail strip width (w-[185px])
const PANEL_W = 340; // right comments panel width (w-[340px])
const STRIP_INSET = EDGE_GAP + STRIP_W + PANEL_GAP; // 213
const PANEL_INSET = EDGE_GAP + PANEL_W + PANEL_GAP; // 368
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
  /** Comments seed for the floating overlay; [] for anonymous viewers. */
  initialComments: CommentRow[];
  /** "In this huddle" participants (owner + collaborators + commenters), with
   *  identities. [] for anonymous viewers — no names/emails ever reach them. */
  participants: DeckParticipant[];
  /** Count of people in the huddle, for the anonymous "N reviewing" chip. This
   *  is a COUNT ONLY (no identities) and is the only participant info an
   *  anonymous viewer receives. */
  reviewingCount: number;
  /** "N comments since you were here" banner data; null = no banner (first-time
   *  viewer, anonymous viewer, or nothing new). */
  arrivalActivity: ArrivalActivity | null;
  /** Removal flags on the deck, seeding the live flag state (emails redacted for
   *  anonymous viewers). Used both for the flag-for-removal UI and as input to
   *  the owner's "Send to AI" prompt. */
  initialFlags: FlagRow[];
  initialStubs: StubRow[];
  /** Orphan deck (captured with no owner yet): collaboration is off until the
   *  creator claims it — gates comment/flag/stub creation off and shows a nudge. */
  isOrphanDeck: boolean;
  loginHref: string;
  /** Whether this viewer is a design partner — analytics segmentation only.
   *  Lets the feed-vs-deck landing comparison be split by partner. */
  isPartner: boolean;
  /** Real-slide index (0-based) to open ON, from the feed's "Open slide N"
   *  deep-link (?slide=N). null = open at the start. */
  initialSlideIndex?: number | null;
  /** The deck's owner id (decks.user_id) — passed to the Huddlers cluster so
   *  <Avatar> alone decides who's filled (owner) vs outline (collaborator). */
  deckOwnerId: string | null;
};

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
// content animates smoothly to zero — and because the inner cell clips
// horizontally, a styled button inside (with its own padding/border) is
// CLIPPED to zero rather than flooring at its padding width. When collapsed it's
// `pointer-events: none`. `expandedExtra` carries any margin that should appear
// only while expanded (so spacing collapses too). Honors reduced motion.
//
// The clip is `overflow-x: clip` — NOT `overflow: hidden` — on purpose. With
// `hidden`, the cell also clips VERTICALLY at its content height; when the
// avatars are the tallest child (shared decks, where the taller owner-only
// "Send to AI" button is absent) the cell is exactly avatar-height, slicing off
// the avatars' white rings and comment markers ("covered by a white frame").
// `clip` on one axis leaves the other axis visible, so vertical paint is safe
// while the horizontal collapse still works.
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
      <span
        className="inline-flex items-center min-w-0 whitespace-nowrap"
        style={{ overflowX: "clip", overflowY: "visible" }}
      >
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
  initialComments,
  participants,
  reviewingCount,
  arrivalActivity,
  initialFlags,
  initialStubs,
  isOrphanDeck,
  loginHref,
  isPartner,
  initialSlideIndex,
  deckOwnerId,
}: Props) {
  const router = useRouter();

  // Landing analytics — fire ONCE. This + the feed's matching event are the
  // Phase-1 gate evidence ("which landing do partners use"). Counts come from the
  // server-seeded data (the state at landing).
  const landingFiredRef = useRef(false);
  useEffect(() => {
    if (landingFiredRef.current) return;
    landingFiredRef.current = true;
    const role = isOwner ? "owner" : currentUserId ? "collaborator" : "anon";
    if (currentUserId) identifyUser(currentUserId, { isPartner });
    track("deck_landing_viewed", {
      deckId,
      view: "deck",
      role,
      isPartner,
      commentCount: initialComments.length,
      stubCount: initialStubs.length,
      flagCount: initialFlags.length,
    });
    // Fire once on mount; deps captured intentionally at landing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // parseDeck uses DOMParser, which only exists in the browser. Keep the
  // initial render empty so SSR is safe, then parse on the client after mount —
  // identical to how SlideViewer.tsx handles it.
  const [deck, setDeck] = useState<ParsedDeck>(EMPTY_DECK);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeck(parseDeck(rawHtml));
  }, [rawHtml]);

  const [activeIndex, setActiveIndex] = useState(0);
  const slideCount = deck.slides.length;

  // Requested slides ("stubs") + comments — both wired via hooks used ONLY here,
  // so SlideViewer stays untouched.
  const { stubs, insertStub, deleteStub, dismissStub, editStub } = useDeckStubs({
    deckId,
    currentUserId,
    currentUserEmail,
    readOnly,
    initialStubs,
  });
  const { comments, addComment, deleteComment, dismissComment, editComment } =
    useDeckComments({
      deckId,
      currentUserId,
      currentUserEmail,
      viewingVersion,
      readOnly,
      initialComments,
    });
  const { flags, addFlag, removeFlag, dismissFlag } = useDeckFlags({
    deckId,
    currentUserId,
    currentUserEmail,
    readOnly,
    initialFlags,
  });
  // Notice an out-of-band revision (e.g. the AI publishing a new version) and
  // prompt a refresh — never auto-yank the page. null until a newer version
  // than the one on screen appears.
  const liveNewVersion = useDeckVersionWatch({ deckId, readOnly, viewingVersion });
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const [stripOpen, setStripOpen] = useState(false);

  // Merge the real slides and the requested slides into one ordered, navigable
  // list (real slide indices stay stable, so comment slide_index values do too).
  const displayItems = useMemo(
    () => buildDisplayItems(slideCount, stubs),
    [slideCount, stubs],
  );
  const itemCount = displayItems.length;
  const hasItems = itemCount > 0;
  const safeIndex = Math.min(activeIndex, Math.max(0, itemCount - 1));
  const activeItem = hasItems ? displayItems[safeIndex] : null;
  const activeSlideIndex =
    activeItem?.kind === "slide" ? activeItem.slideIndex : null;
  const activeStub = activeItem?.kind === "stub" ? activeItem.stub : null;
  const currentSlideHtml =
    activeSlideIndex !== null ? deck.slides[activeSlideIndex] : "";

  const goPrev = () => setActiveIndex((i) => Math.max(0, i - 1));
  const goNext = () => setActiveIndex((i) => Math.min(itemCount - 1, i + 1));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setActiveIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight")
        setActiveIndex((i) => Math.min(itemCount - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [itemCount]);

  // Jump to a freshly-inserted requested slide once it appears in the list.
  const [focusStubId, setFocusStubId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusStubId) return;
    const idx = displayItems.findIndex(
      (it) => it.kind === "stub" && it.stub.id === focusStubId,
    );
    if (idx >= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveIndex(idx);
      setFocusStubId(null);
    }
  }, [focusStubId, displayItems]);

  // Open ON the slide the feed deep-linked to (?slide=N → "Open slide N"). Fires
  // ONCE, after the deck has parsed and the real slide appears in displayItems
  // (the slide index → its display-item index, since stubs shift positions).
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    if (initialSlideIndex == null || initialSlideIndex < 0) return;
    const idx = displayItems.findIndex(
      (it) => it.kind === "slide" && it.slideIndex === initialSlideIndex,
    );
    if (idx >= 0) {
      deepLinkAppliedRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveIndex(idx);
    }
  }, [initialSlideIndex, displayItems]);

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
  // Bottom-left settings menu (currently holds the "pin floating bars" toggle).
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLButtonElement>(null);

  // Read "should stay open" straight from the live DOM, so there's no extra
  // state to keep in sync: an open PortalPopover renders role="dialog"/"menu";
  // hovered/focused controls are tagged data-floating-control. Note: an open
  // panel (comments / thumbnail strip) does NOT by itself hold the controls
  // expanded — the clusters still collapse when idle, while the panels stay
  // (they render independently of `expanded`). Hovering/focusing a panel still
  // holds, because the panel carries data-floating-control.
  const isHeldOpen = useCallback(() => {
    if (pinnedRef.current) return true;
    if (typeof document === "undefined") return false;
    // A transient popover/menu is open (version, avatar, send-to-AI, insert).
    if (document.querySelector('[role="dialog"], [role="menu"]')) return true;
    // A control is hovered (cluster controls only — the side panels deliberately
    // aren't data-floating-control, so hovering them lets the clusters collapse).
    if (document.querySelector("[data-floating-control]:hover")) return true;
    // A control has KEYBOARD focus (:focus-visible) — so Tab-navigation keeps the
    // controls up, but a mouse click (which focuses without :focus-visible) does
    // NOT pin them open.
    if (document.querySelector("[data-floating-control]:focus-visible"))
      return true;
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

  // `T` toggles the thumbnail rail (design system §4.1). Defined after `reveal`
  // so opening the rail can also reschedule the collapse timer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "t" && e.key !== "T") return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (!deckId) return;
      setStripOpen((o) => !o);
      reveal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deckId, reveal]);

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

  // ── Inset, not overlay (design system §3.3) ──────────────────────────────
  // When the strip and/or comments panel are OPEN, the slide must not sit
  // underneath them — it shrinks and shifts into the safe area beside them (the
  // design review's #1 must-fix). Each inset is gated on the panel ACTUALLY
  // rendering (same conditions as the JSX), so a toggle that's "on" but not
  // showing — e.g. comments open while a requested-slide card is active — does
  // not wrongly inset the slide. `isStored`/`showComments` are computed further
  // down, so we inline the equivalent conditions here (deckId / currentUserId).
  const stripVisible = stripOpen && !!deckId;
  const commentsVisible =
    commentsPanelOpen &&
    !!deckId &&
    !!currentUserId &&
    activeSlideIndex !== null;
  const leftInset = stripVisible ? STRIP_INSET : 0;
  const rightInset = commentsVisible ? PANEL_INSET : 0;
  // Keep the slide centred in the gap that's left: shift by half the difference
  // of the two insets (right panel only → shift left; left strip only → right).
  const slideOffsetX = (leftInset - rightInset) / 2;

  // Scale-to-fit: contain the deck's natural aspect ratio within the safe area —
  // the full-bleed stage minus whatever the open side panels claim (above).
  const stageRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  useEffect(() => {
    function measure() {
      const stage = stageRef.current;
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      // Shrink the fit-box by whatever the open panels claim, so the slide never
      // renders underneath them. Clamp so a very narrow viewport can't drive the
      // available width to zero or negative.
      const maxW = Math.max(120, r.width - leftInset - rightInset);
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
  }, [effectiveW, effectiveH, hasItems, leftInset, rightInset]);

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

  // Comments on the slide currently shown. When the active item is a requested
  // slide (a stub), there are none — comments only attach to real slides.
  const currentSlideComments = useMemo(
    () =>
      activeSlideIndex === null
        ? []
        : comments.filter((c) => c.slide_index === activeSlideIndex),
    [comments, activeSlideIndex],
  );
  const currentSlideCommentCount = currentSlideComments.length;

  // real slide index → comment count, for the thumbnail badges.
  const commentCountBySlide = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of comments)
      m.set(c.slide_index, (m.get(c.slide_index) ?? 0) + 1);
    return m;
  }, [comments]);

  // Slides that carry comments — the dots shown in the rail SLIVER ("the team's
  // fingerprints", design system §3.2/§4.1), in slide order.
  const commentedSlides = useMemo(
    () =>
      [...commentCountBySlide.entries()]
        .filter(([, count]) => count > 0)
        .map(([slideIndex]) => slideIndex)
        .sort((a, b) => a - b),
    [commentCountBySlide],
  );

  // Role gating mirrors the current viewer (and gates collaboration off on an
  // orphan deck — no owner yet, so the DB would reject writes anyway).
  const canComment = !!(deckId && currentUserId) && !readOnly && !isOrphanDeck;
  const canCurate = isOwner && !readOnly && !!deckId;
  // Flagging a slide for removal uses the same gate as commenting.
  const canFlag = canComment;
  // The removal flag on the slide currently shown, for the comments-panel entry
  // + the slide's flag control. DISMISSED flags are excluded: when the owner
  // dismisses a flag it should disappear (not linger struck-through still
  // "feeling in effect") — it stays in the DB for audit and out of the AI prompt,
  // just hidden here. The slide then reads as un-flagged and can be re-flagged.
  const currentSlideFlag = useMemo(
    () =>
      activeSlideIndex === null
        ? null
        : flags.find(
            (f) => f.slide_index === activeSlideIndex && !f.dismissed,
          ) ?? null,
    [flags, activeSlideIndex],
  );

  // Live "Send to AI" prompt — recomputed over the LIVE comments, removal flags,
  // and requested slides, so curation (dismiss/edit) and a newly added/removed
  // flag reflect immediately. Owner-only (null otherwise), built from the SAME
  // selectCuratedFeedback the current viewer and the MCP `get_feedback` tool use.
  const feedbackText = useMemo(
    () =>
      canSendToAI
        ? buildFeedbackPrompt(selectCuratedFeedback(comments, flags, stubs))
        : null,
    [canSendToAI, comments, flags, stubs],
  );

  // Shared frosted-pill look for the corner clusters. Fixed height so the two
  // top clusters match; no flex `gap` because spacing is managed per-item (and
  // some items collapse, taking their spacing with them). The clusters' shell
  // stays visible at all times — only their "extra" contents collapse.
  const cluster =
    "absolute z-20 flex items-center h-[52px] rounded-2xl border border-black/[0.06] bg-white/80 px-2.5 shadow-[0_6px_22px_rgba(0,0,0,0.10)] backdrop-blur-md";

  // The pin overlaps the slide, so it fades OUT at rest (the cluster "extra"
  // items collapse horizontally instead). The slide COUNTER, by contrast, is
  // persistent (§4.1) and never fades — see below. Under
  // `prefers-reduced-motion` we drop the animation and switch instantly.
  const fadeTransition = reducedMotion ? "" : "transition-opacity duration-300";
  const bottomFade = expanded
    ? `${fadeTransition} opacity-100`
    : `${fadeTransition} opacity-0 pointer-events-none`;

  // The slide glides into its inset position (size + offset) when a panel opens
  // or closes — 200ms per §3.3; under reduced motion it snaps.
  const slideTransition = reducedMotion
    ? undefined
    : "transform 200ms ease, width 200ms ease, height 200ms ease";

  return (
    <div
      ref={stageRef}
      className="relative flex-1 min-w-0 min-h-0 flex items-center justify-center bg-[#f6f6fa] overflow-hidden"
    >
      {!hasItems ? (
        <p className="text-muted">No slides to display.</p>
      ) : (
        <>
          {/* The active item — a real slide (sandboxed iframe) or a requested
              slide ("stub") card — contained/letterboxed within the stage. The
              stub card is sized to the same contained box as the slides. */}
          {activeStub !== null ? (
            <div
              style={{
                width: cardSize.width ? `${cardSize.width}px` : undefined,
                height: cardSize.height ? `${cardSize.height}px` : undefined,
                transform: `translateX(${slideOffsetX}px)`,
                transition: slideTransition,
              }}
            >
              <StubSlideView
                stub={activeStub}
                currentUserId={currentUserId}
                isOwner={isOwner}
                canCurate={canCurate}
                actionsPlacement="bottom-right"
                onDelete={deleteStub}
                onDismiss={dismissStub}
                onEdit={editStub}
              />
            </div>
          ) : (
            <div
              className="group/stage relative bg-white overflow-hidden"
              style={{
                width: cardSize.width ? `${cardSize.width}px` : undefined,
                height: cardSize.height ? `${cardSize.height}px` : undefined,
                transform: `translateX(${slideOffsetX}px)`,
                transition: slideTransition,
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
              {/* Flag-for-removal — the subtle "…" menu top-left of the slide
                  (reused from the classic viewer). Hidden on historical views;
                  the action itself is gated by canFlag (signed-in collaborator,
                  non-orphan). Its popover portals out, so the card's
                  overflow-hidden doesn't clip it. */}
              {isStored && !readOnly && !isOrphanDeck && (
                <SlideFlagControl
                  flag={currentSlideFlag}
                  canFlag={canFlag}
                  currentUserId={currentUserId}
                  loginHref={loginHref}
                  position="bottom-right"
                  onFlag={(reason) =>
                    activeSlideIndex !== null
                      ? addFlag(activeSlideIndex, reason)
                      : Promise.resolve()
                  }
                  onUnflag={removeFlag}
                />
              )}
            </div>
          )}

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
                <button
                  type="button"
                  data-floating-control
                  onClick={() => {
                    setStripOpen((o) => !o);
                    reveal();
                  }}
                  aria-pressed={stripOpen}
                  aria-label="Toggle the slides list"
                  title="Slides"
                  className={`h-[30px] w-[30px] rounded-lg shrink-0 flex items-center justify-center transition-colors ${
                    stripOpen
                      ? "bg-[#4A3FB5] text-white"
                      : "text-[#6b6b75] hover:bg-black/[0.05]"
                  }`}
                >
                  <SlidesStripIcon />
                </button>
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
                    {/* "In this huddle" — who's part of the deck. Signed-in
                        viewers see real avatars; anonymous viewers get the
                        name-free chip (no identities ever reach them). */}
                    {currentUserId ? (
                      <HuddleAvatars
                        participants={participants}
                        currentUserId={currentUserId}
                        ownerId={deckOwnerId}
                      />
                    ) : reviewingCount >= 1 ? (
                      <ReviewingChip count={reviewingCount} />
                    ) : (
                      <SharedDeckChip />
                    )}
                    {currentUserEmail ? (
                      <AvatarMenu
                        email={currentUserEmail}
                        userId={currentUserId}
                        ownerId={deckOwnerId}
                      />
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

                {showComments && activeSlideIndex !== null && (
                  // Bare at rest (no pill) — Comments only TOGGLE the panel, so
                  // it's the lightest control in the cluster: a teal speech-bubble
                  // (teal = the team) + the count. A green wash on hover; when the
                  // panel is OPEN it fills solid green with white — a clear ON state.
                  <button
                    type="button"
                    onClick={() => {
                      setCommentsPanelOpen((o) => !o);
                      reveal();
                    }}
                    aria-pressed={commentsPanelOpen}
                    aria-label={
                      currentSlideCommentCount > 0
                        ? `Comments (${currentSlideCommentCount})`
                        : "Comments"
                    }
                    title="Comments"
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold shrink-0 transition-colors ${
                      commentsPanelOpen
                        ? "bg-[#0F6E56] text-white"
                        : "text-[#0F6E56] hover:bg-[#D3F0E6]"
                    }`}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    {currentSlideCommentCount > 0 && (
                      <span className="tabular-nums">{currentSlideCommentCount}</span>
                    )}
                  </button>
                )}

                <span className={`shrink-0 ${showComments ? "ml-2" : ""}`}>
                  <CopyLinkButton label="Share" />
                </span>
              </>
            ) : currentUserEmail ? (
              <AvatarMenu
                email={currentUserEmail}
                userId={currentUserId}
                ownerId={deckOwnerId}
              />
            ) : (
              <Link
                href={loginHref}
                className="text-sm font-semibold text-brand hover:text-brand-hover px-1"
              >
                Sign in
              </Link>
            )}
          </div>

          {/* Arrival activity — "N comments since you were here" — for a
              returning signed-in viewer. Floats at top-center on load; "Catch
              up" opens the comments overlay (jumping to a real slide first if a
              requested-slide card happens to be active). Dismissable. Only
              rendered when comments can actually open. */}
          {arrivalActivity && showComments && (
            <ArrivalBanner
              activity={arrivalActivity}
              onCatchUp={() => {
                if (activeSlideIndex === null) {
                  const idx = displayItems.findIndex((it) => it.kind === "slide");
                  if (idx >= 0) setActiveIndex(idx);
                }
                setCommentsPanelOpen(true);
                reveal();
              }}
            />
          )}

          {/* Out-of-band revision prompt. Appears when the deck was revised
              elsewhere (e.g. the AI publishing a new version via MCP) while you're
              viewing — it PROMPTS rather than auto-refreshing, so a half-typed
              comment is never discarded. Amber = an AI revision event
              (design-system §2.2); "Load vN" is a purple action you take. Sits
              below the arrival banner so the two never collide. The refresh
              re-fetches server-side and the version `key` (page.tsx) remounts the
              viewer with the new version's slides + comments. */}
          {liveNewVersion !== null && (
            <div
              role="status"
              data-floating-control
              className="absolute top-[72px] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 max-w-[90vw] rounded-2xl border border-black/[0.06] px-3.5 py-2 shadow-[0_6px_22px_rgba(0,0,0,0.12)] backdrop-blur-md"
              style={{ backgroundColor: "#FAEEDA", color: "#633806" }}
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
                className="shrink-0"
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              <p className="text-sm leading-snug">
                <span className="font-semibold">This deck was revised</span> — now
                on v{liveNewVersion}
              </p>
              <button
                type="button"
                onClick={() => router.refresh()}
                className="shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold transition-colors hover:bg-black/5"
                style={{ color: "#4A3FB5" }}
              >
                Load v{liveNewVersion}
              </button>
            </div>
          )}

          {/* Side navigation arrows. They sit in the side margins; each simply
              hides when its side's panel is open (left arrow under the thumbnail
              strip, right arrow under the comments panel). */}
          {!stripOpen && (
            <button
              type="button"
              onClick={goPrev}
              disabled={safeIndex === 0}
              aria-label="Previous slide"
              // Nudged right of the rail sliver (left edge) when a deck is shown.
              className={`absolute ${deckId ? "left-8" : "left-4"} top-1/2 z-20 -translate-y-1/2 h-11 w-11 rounded-full bg-white/75 backdrop-blur-sm border border-black/[0.08] flex items-center justify-center text-brand hover:bg-white disabled:opacity-0 transition-all shadow-sm`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          {!commentsPanelOpen && (
            <button
              type="button"
              onClick={goNext}
              disabled={safeIndex === itemCount - 1}
              aria-label="Next slide"
              className="absolute right-4 top-1/2 z-20 -translate-y-1/2 h-11 w-11 rounded-full bg-white/75 backdrop-blur-sm border border-black/[0.08] flex items-center justify-center text-brand hover:bg-white disabled:opacity-0 transition-all shadow-sm"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}

          {/* Counter pill, bottom-center — ALWAYS visible (§4.1: the counter
              never hides), so it does not take the bottomFade. */}
          <span className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 text-white text-xs font-medium px-3 py-1 tabular-nums select-none">
            {safeIndex + 1} / {itemCount}
            {activeStub !== null ? " · requested slide" : ""}
          </span>

          {/* Settings, bottom-left — a gear that opens a small menu UPWARD
              (PortalPopover auto-flips above near the bottom edge). It holds the
              "pin floating bars" toggle. The button is data-floating-control and,
              while its menu is open, isHeldOpen() keeps the chrome up (role
              "menu"); when bars are pinned, the chrome never fades at all. The
              wrapper carries the bottomFade; the menu is portaled to <body>, so
              it stays put even as the gear fades. */}
          <div className={`absolute bottom-4 left-4 z-20 ${bottomFade}`}>
            <button
              ref={settingsRef}
              type="button"
              data-floating-control
              onClick={() => {
                setSettingsOpen((o) => !o);
                reveal();
              }}
              aria-haspopup="menu"
              aria-expanded={settingsOpen}
              aria-label="Viewer settings"
              title="Settings"
              className="relative h-9 w-9 rounded-xl border flex items-center justify-center backdrop-blur-md shadow-[0_6px_22px_rgba(0,0,0,0.10)] transition-colors hover:bg-white"
              style={{
                backgroundColor: "rgba(255,255,255,0.8)",
                color: "#6b6b75",
                borderColor: "rgba(0,0,0,0.06)",
              }}
            >
              {/* gear / settings icon */}
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              {/* small purple dot when bars are pinned — shows the active setting
                  without opening the menu. */}
              {pinned && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white"
                  style={{ backgroundColor: "#4A3FB5" }}
                />
              )}
            </button>

            <PortalPopover
              anchorRef={settingsRef}
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              width={244}
              placement="bottom-center"
            >
              <div
                role="menu"
                aria-label="Viewer settings"
                className="rounded-xl border border-border bg-white p-1.5 shadow-[0_12px_32px_rgba(17,17,17,0.14)]"
              >
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={pinned}
                  onClick={togglePin}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#f4f3fc]"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                    style={
                      pinned
                        ? { backgroundColor: "#4A3FB5", borderColor: "#4A3FB5", color: "#ffffff" }
                        : { borderColor: "#c9c8d3", color: "transparent" }
                    }
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span className="leading-snug">
                    <span className="block text-sm font-semibold text-[#1d1d1b]">
                      Pin floating bars
                    </span>
                    <span className="block text-xs text-muted">
                      Keep the controls from tucking away while you read.
                    </span>
                  </span>
                </button>
              </div>
            </PortalPopover>
          </div>

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

          {/* Comments — a FLOATING overlay over the right of the slide. The slide
              stays full size behind it (it does not shrink). role="dialog" +
              data-floating-control make the existing isHeldOpen() guard treat the
              open panel as "held", so the controls don't collapse while it's open;
              the panel itself is not tied to `expanded`, so it never fades. It
              reuses the existing CommentsPanel — only its positioning changes from
              a docked sidebar to this overlay. */}
          {commentsPanelOpen && showComments && activeSlideIndex !== null && (
            // role="complementary" (a persistent side panel), NOT role="dialog"
            // — and no data-floating-control — so it does NOT hold the controls
            // expanded. The clusters still collapse on idle while this panel
            // stays open (it renders on commentsPanelOpen, independent of fade).
            <div
              role="complementary"
              aria-label={`Comments on slide ${safeIndex + 1}`}
              className="absolute top-[84px] right-4 bottom-4 z-30 flex w-[340px] overflow-hidden rounded-2xl border border-border bg-white/50 backdrop-blur-[4px] shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
            >
              <CommentsPanel
                slideLabel={safeIndex + 1}
                isStub={false}
                flag={currentSlideFlag}
                comments={currentSlideComments}
                canComment={canComment}
                canCurate={canCurate}
                readOnly={readOnly}
                isOrphanDeck={isOrphanDeck}
                currentUserId={currentUserId}
                loginHref={loginHref}
                onAdd={(body) =>
                  activeSlideIndex !== null
                    ? addComment(activeSlideIndex, body)
                    : Promise.resolve()
                }
                onDelete={deleteComment}
                onDismiss={dismissComment}
                onEdit={editComment}
                onFlagDismiss={dismissFlag}
                onClose={() => setCommentsPanelOpen(false)}
                translucent
              />
            </div>
          )}

          {/* Rail SLIVER (design system §3.2/§4.1) — the rail's persistent
              collapsed state on the left edge. Always visible (so the team's
              comment activity never fully disappears): a slim rounded strip of
              teal dots, one per slide that has comments. Hover, tap, or press
              `T` opens the full thumbnail rail. Hidden only while that full rail
              is open (it takes the sliver's place). */}
          {!stripOpen && deckId && hasItems && (
            <button
              type="button"
              onClick={() => {
                setStripOpen(true);
                reveal();
              }}
              onMouseEnter={() => {
                setStripOpen(true);
                reveal();
              }}
              aria-label="Open the slides rail"
              title="Slides (T)"
              className="group absolute left-2 top-[84px] bottom-16 z-20 flex w-[14px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-full border border-black/[0.06] bg-white/70 backdrop-blur-md shadow-[0_6px_22px_rgba(0,0,0,0.10)] transition-colors hover:bg-white"
            >
              {commentedSlides.length > 0 ? (
                commentedSlides.slice(0, 12).map((slideIndex) => (
                  <span
                    key={slideIndex}
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: "#0F6E56" }}
                  />
                ))
              ) : (
                // No comments yet — a faint grip so the sliver still reads as an
                // openable handle.
                <span
                  aria-hidden="true"
                  className="h-6 w-0.5 rounded-full bg-black/15"
                />
              )}
            </button>
          )}

          {/* Thumbnail strip — a FLOATING vertical panel on the LEFT (opposite
              the comments panel). Lists real + requested slides with a "+" to
              request one. Toggled by the slides button; the slide stays full size
              behind it. data-floating-control + the open-panel guard keep the
              controls expanded while it's open. */}
          {stripOpen && deckId && (
            // Persistent side panel (no data-floating-control), so it does not
            // hold the controls expanded — the clusters still collapse on idle
            // while the strip stays. Width matches the collapsed top-left
            // cluster so they line up as one left column. The inner scroller is
            // dir="rtl" (thin scrollbar on the left) with a small left margin so
            // the bar sits just inside the rounded corner; the content is ltr.
            <div
              aria-label="Slides"
              className="absolute top-[84px] left-4 bottom-4 z-30 w-[185px] overflow-hidden rounded-2xl border border-border bg-white/50 backdrop-blur-[4px] shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
            >
              <div
                dir="rtl"
                className="thin-scrollbar absolute inset-y-2 left-1 right-0 overflow-y-auto overflow-x-hidden"
              >
                <FloatingThumbnailStrip
                  deck={deck}
                  items={displayItems}
                  activeIndex={safeIndex}
                  onSelect={setActiveIndex}
                  commentCountBySlide={commentCountBySlide}
                  showInsert={isStored && !readOnly}
                  canInsert={canComment}
                  loginHref={loginHref}
                  onInsertStub={async (position, fields) => {
                    const id = await insertStub(position, fields);
                    if (id) setFocusStubId(id);
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
