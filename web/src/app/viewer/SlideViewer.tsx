"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CommentsPanel from "./CommentsPanel";
import ThumbnailStrip from "./ThumbnailStrip";
import StubSlideView from "./StubSlideView";
import SlideFlagControl from "./SlideFlagControl";
import { parseDeck, buildSrcdoc, EMPTY_DECK, type ParsedDeck } from "./parse-deck";
import { buildDisplayItems } from "./display-items";
import { buildFeedbackPrompt } from "./feedback-prompt";
import { deleteStubAction } from "./actions";
import type { CommentRow, FlagRow, StubRow } from "@/lib/slide-store";

type Props = {
  rawHtml: string;
  deckId: string | null;
  initialComments: CommentRow[];
  initialStubs: StubRow[];
  initialFlags: FlagRow[];
  currentUserId: string | null;
  currentUserEmail: string | null;
  /** Whether the signed-in user owns this deck (may delete any stub). */
  isOwner: boolean;
  loginHref: string;
};

export default function SlideViewer({
  rawHtml,
  deckId,
  initialComments,
  initialStubs,
  initialFlags,
  currentUserId,
  currentUserEmail,
  isOwner,
  loginHref,
}: Props) {
  // parseDeck uses DOMParser, which only exists in the browser. Keep the
  // initial render empty so SSR is safe, then parse on the client after
  // mount.
  const [deck, setDeck] = useState<ParsedDeck>(EMPTY_DECK);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeck(parseDeck(rawHtml));
  }, [rawHtml]);

  const [comments, setComments] = useState<CommentRow[]>(initialComments);
  const [stubs, setStubs] = useState<StubRow[]>(initialStubs);
  const [flags, setFlags] = useState<FlagRow[]>(initialFlags);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // After inserting a stub we want to jump to it; we can't know its display
  // index inside the handler (the items list recomputes on the next render),
  // so we stash the new stub's id and select it in an effect.
  const [focusStubId, setFocusStubId] = useState<string | null>(null);

  // Natural canvas discovered by measuring the display iframe's rendered
  // content (ground truth for Claude artifacts that animate content in).
  const [measuredCanvas, setMeasuredCanvas] = useState<
    { w: number; h: number } | null
  >(null);

  const displayItems = useMemo(
    () => buildDisplayItems(deck.slides.length, stubs),
    [deck.slides.length, stubs],
  );

  const hasItems = displayItems.length > 0;
  const safeIndex = Math.min(activeIndex, Math.max(0, displayItems.length - 1));
  const activeItem = hasItems ? displayItems[safeIndex] : null;
  const activeSlideIndex =
    activeItem?.kind === "slide" ? activeItem.slideIndex : null;
  const activeStub = activeItem?.kind === "stub" ? activeItem.stub : null;
  const currentSlideHtml =
    activeSlideIndex !== null ? deck.slides[activeSlideIndex] : "";

  // Select the freshly-inserted stub once it shows up in displayItems.
  useEffect(() => {
    if (!focusStubId) return;
    const idx = displayItems.findIndex(
      (it) => it.kind === "stub" && it.stub.id === focusStubId,
    );
    if (idx >= 0) {
      // Selecting the freshly-inserted stub once it appears in the list is a
      // one-shot sync, mirroring the deck-parse effect above.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveIndex(idx);
      setFocusStubId(null);
    }
  }, [focusStubId, displayItems]);

  const effectiveW = measuredCanvas?.w ?? deck.slideWidth;
  const effectiveH = measuredCanvas?.h ?? deck.slideHeight;

  // Reset measurement whenever the slide content changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMeasuredCanvas(null);
  }, [currentSlideHtml]);

  // The display iframe posts its rendered size back here (opaque origin →
  // cross-origin postMessage). Parent treats it as untrusted: validate the
  // marker, only read numeric w/h.
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

  const goPrev = () => setActiveIndex((i) => Math.max(0, i - 1));
  const goNext = () =>
    setActiveIndex((i) => Math.min(displayItems.length - 1, i + 1));

  useEffect(() => {
    const lastIndex = displayItems.length - 1;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setActiveIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight")
        setActiveIndex((i) => Math.min(lastIndex, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [displayItems.length]);

  // Scale-to-fit: contain the deck's natural aspect ratio within the stage.
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
  }, [displayItems.length, effectiveW, effectiveH, commentsOpen]);

  // Derived comment / flag lookups.
  const commentCountBySlide = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of comments) {
      m.set(c.slide_index, (m.get(c.slide_index) ?? 0) + 1);
    }
    return m;
  }, [comments]);

  const flagBySlide = useMemo(() => {
    const m = new Map<number, FlagRow>();
    for (const f of flags) {
      if (!m.has(f.slide_index)) m.set(f.slide_index, f);
    }
    return m;
  }, [flags]);
  const flaggedSlides = useMemo(
    () => new Set(flags.map((f) => f.slide_index)),
    [flags],
  );

  const activeFlag =
    activeSlideIndex !== null ? flagBySlide.get(activeSlideIndex) ?? null : null;
  const visibleComments =
    activeSlideIndex !== null
      ? comments.filter((c) => c.slide_index === activeSlideIndex)
      : [];

  // Permission flags.
  const isStored = !!deckId;
  const canComment = !!(deckId && currentUserId);
  const canInsert = !!(deckId && currentUserId);
  const canFlag = !!(deckId && currentUserId);

  // AI-loop actions. The feedback prompt aggregates ALL slides' comments,
  // requested stubs, and removal flags (not just the active slide). Only shown
  // on stored decks; null when there's nothing to send yet (button disables).
  const feedbackText = useMemo(
    () =>
      isStored
        ? buildFeedbackPrompt({ comments, flags, stubs })
        : undefined,
    [isStored, comments, flags, stubs],
  );

  // ---- Comment actions (unchanged from the previous viewer) ----------
  async function handleAddComment(body: string) {
    if (!deckId || !currentUserId || activeSlideIndex === null) return;
    const optimisticId = `temp-${Date.now()}`;
    const optimistic: CommentRow = {
      id: optimisticId,
      deck_id: deckId,
      user_id: currentUserId,
      author_email: currentUserEmail,
      slide_index: activeSlideIndex,
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
        slide_index: activeSlideIndex,
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

  // ---- Stub actions --------------------------------------------------
  async function handleInsertStub(
    position: number,
    fields: { title: string; subtitle: string; body: string },
  ) {
    if (!deckId || !currentUserId) return;
    const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
    const supabase = getSupabaseBrowser();
    const { data, error } = await supabase
      .from("slide_stubs")
      .insert({
        deck_id: deckId,
        position,
        title: fields.title || null,
        subtitle: fields.subtitle || null,
        body: fields.body || null,
        requested_by: currentUserId,
      })
      .select("id, deck_id, position, title, subtitle, body, requested_by, created_at")
      .single();
    if (error) {
      console.error("[SlideViewer] stub insert failed:", error);
      return;
    }
    const row: StubRow = {
      ...(data as Omit<StubRow, "requested_by_email">),
      requested_by_email: currentUserEmail,
    };
    setStubs((prev) => [...prev, row]);
    setFocusStubId(row.id);
  }

  // Delete a requested stub outright (requester or deck owner only — enforced
  // server-side in the action). Optimistic: drop it from local state, then call
  // the action; restore on failure. The display list recomputes from `stubs`,
  // so the deck and thumbnail strip reflow automatically, and safeIndex clamps
  // if the deleted stub was the active item.
  async function handleDeleteStub(stubId: string) {
    if (!deckId) return;
    const snapshot = stubs;
    setStubs((prev) => prev.filter((s) => s.id !== stubId));
    const res = await deleteStubAction(deckId, stubId);
    if (!res.ok) {
      console.error("[SlideViewer] stub delete failed:", res.error);
      setStubs(snapshot);
    }
  }

  // ---- Flag actions --------------------------------------------------
  async function handleFlag(reason: string) {
    if (!deckId || !currentUserId || activeSlideIndex === null) return;
    const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
    const supabase = getSupabaseBrowser();
    const { data, error } = await supabase
      .from("slide_flags")
      .insert({
        deck_id: deckId,
        slide_index: activeSlideIndex,
        reason: reason || null,
        flagged_by: currentUserId,
      })
      .select("id, deck_id, slide_index, reason, flagged_by, created_at")
      .single();
    if (error) {
      console.error("[SlideViewer] flag insert failed:", error);
      return;
    }
    const row: FlagRow = {
      ...(data as Omit<FlagRow, "flagged_by_email">),
      flagged_by_email: currentUserEmail,
    };
    setFlags((prev) => [...prev, row]);
  }

  async function handleUnflag(flagId: string) {
    const snapshot = flags;
    setFlags((prev) => prev.filter((f) => f.id !== flagId));
    const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
    const supabase = getSupabaseBrowser();
    const { error } = await supabase
      .from("slide_flags")
      .delete()
      .eq("id", flagId);
    if (error) {
      console.error("[SlideViewer] unflag failed:", error);
      setFlags(snapshot);
    }
  }

  if (!hasItems) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <p>No slides to display.</p>
      </div>
    );
  }

  const counterText =
    activeStub !== null
      ? `${safeIndex + 1} / ${displayItems.length} · requested slide`
      : `${safeIndex + 1} / ${displayItems.length}`;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <ThumbnailStrip
        deck={deck}
        items={displayItems}
        activeIndex={safeIndex}
        onSelect={setActiveIndex}
        commentCountBySlide={commentCountBySlide}
        flaggedSlides={flaggedSlides}
        showCopyLink={isStored}
        showInsert={isStored}
        canInsert={canInsert}
        loginHref={loginHref}
        onInsertStub={handleInsertStub}
        feedbackText={feedbackText}
      />

      <div className="flex-1 flex flex-row min-h-0">
        {/* Slide stage — edge to edge, overlays on top. */}
        <div
          ref={stageRef}
          className="group/stage relative flex-1 min-w-0 min-h-0 flex items-center justify-center bg-[#f6f6fa] overflow-hidden"
        >
          {activeStub !== null ? (
            // Size the stub card to the same contained dimensions as the
            // imported slides (cardSize recomputes when the comments panel
            // opens), so a requested slide matches their size and behaviour.
            <div
              style={{
                width: cardSize.width ? `${cardSize.width}px` : undefined,
                height: cardSize.height ? `${cardSize.height}px` : undefined,
              }}
            >
              <StubSlideView
                stub={activeStub}
                currentUserId={currentUserId}
                isOwner={isOwner}
                onDelete={handleDeleteStub}
              />
            </div>
          ) : (
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
                srcDoc={buildSrcdoc(
                  currentSlideHtml,
                  deck.headHtml,
                  deck.hasAuthoredStyles,
                )}
                sandbox="allow-scripts"
                className="border-0 block bg-white absolute top-1/2 left-1/2"
                style={{
                  width: `${effectiveW}px`,
                  height: `${effectiveH}px`,
                  transform: `translate(-50%, -50%) scale(${scale})`,
                  transformOrigin: "center center",
                }}
              />
              {/* The flagged-for-removal state is shown as an entry in the
                  comments panel (and on the thumbnail), not as an overlay
                  covering the slide. */}
            </div>
          )}

          {/* Comments pill — top-right of the slide. Because the panel is a
              flex sibling, opening it shrinks the stage and this pill slides
              left with it, so it's never covered by the panel. */}
          {isStored && (
            <button
              type="button"
              onClick={() => setCommentsOpen((v) => !v)}
              aria-pressed={commentsOpen}
              className="absolute top-3 right-3 z-20 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold shadow-sm transition-colors"
              style={
                commentsOpen
                  ? { backgroundColor: "#0F6E56", color: "#ffffff" }
                  : { backgroundColor: "#E1F5EE", color: "#085041" }
              }
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
                <span
                  className="inline-flex items-center justify-center rounded-full min-w-5 h-5 px-1.5 text-xs font-bold"
                  style={
                    commentsOpen
                      ? { backgroundColor: "#ffffff", color: "#0F6E56" }
                      : { backgroundColor: "#0F6E56", color: "#ffffff" }
                  }
                >
                  {comments.length}
                </span>
              )}
            </button>
          )}

          {/* "…" flag menu (real slides on stored decks only). Top-left so it
              never collides with the Comments pill on the right. */}
          {isStored && activeSlideIndex !== null && (
            <SlideFlagControl
              flag={activeFlag}
              canFlag={canFlag}
              currentUserId={currentUserId}
              loginHref={loginHref}
              onFlag={handleFlag}
              onUnflag={handleUnflag}
            />
          )}

          {/* Overlay navigation arrows. */}
          <button
            type="button"
            onClick={goPrev}
            disabled={safeIndex === 0}
            aria-label="Previous slide"
            className="absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/70 backdrop-blur-sm border border-border flex items-center justify-center text-brand hover:bg-white disabled:opacity-0 transition-all shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={safeIndex === displayItems.length - 1}
            aria-label="Next slide"
            className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/70 backdrop-blur-sm border border-border flex items-center justify-center text-brand hover:bg-white disabled:opacity-0 transition-all shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* Slide counter pill, bottom-center. */}
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 text-white text-xs font-medium px-3 py-1 tabular-nums select-none">
            {counterText}
          </span>
        </div>

        {commentsOpen && isStored && (
          <CommentsPanel
            slideLabel={safeIndex + 1}
            isStub={activeStub !== null}
            flag={activeFlag}
            comments={visibleComments}
            canComment={canComment}
            currentUserId={currentUserId}
            loginHref={loginHref}
            onAdd={handleAddComment}
            onDelete={handleDeleteComment}
            onClose={() => setCommentsOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
