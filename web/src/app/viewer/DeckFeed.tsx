"use client";

// The READ-ONLY conversation feed (P1.2) — an alternative LANDING surface for a
// deck, gated per-account (FEED_PARTNER_EMAILS, see page.tsx). The conversation
// is the content layer, and the deck is DEMOTED to a right-hand "peek". It
// composes ONLY data we already store — version events, comments, requested
// slides (stubs), removal flags.
//
// The feed COLUMN itself (version spine + cards + arrival ribbon + empty state)
// now lives in the shared FeedStream component, so the very same column can be
// reused in the floating viewer's feed↔deck spectrum (?view=spectrum) without a
// second copy. This file is the standalone feed LANDING: a top bar + FeedStream
// + the deck peek.
//
// Read-only: NO composer. People participate by opening the deck (the peek /
// "Open slide N") and using the existing comment / request / flag controls;
// their feedback then shows back up here.
//
// Reuses: FeedStream (the feed column), Avatar (via FeedStream), DeckVersionNav,
// HuddleAvatars, the Reviewing/SharedDeck chips, parseDeck/buildSrcdoc for the
// peek.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  parseDeck,
  buildSrcdoc,
  EMPTY_DECK,
  type ParsedDeck,
} from "./parse-deck";
import HuddleAvatars from "./HuddleAvatars";
import { ReviewingChip, SharedDeckChip } from "./HuddleChips";
import AvatarMenu from "@/components/AvatarMenu";
import FeedStream from "./FeedStream";
import {
  PersonColorProvider,
  buildPersonColorAssignment,
} from "./person-colors";
import { useDeckPresence } from "./useDeckPresence";
import { track, identifyUser, registerSuperProperties } from "@/lib/analytics";
import type {
  CommentRow,
  DeckParticipant,
  DeckVersionRow,
  FlagRow,
  StubRow,
} from "@/lib/slide-store";
import type { ArrivalActivity } from "./arrival-activity";

// Fixed peek width: the right panel is w-[320px] with p-4 padding → 288px usable.
const PEEK_W = 288;

type Props = {
  rawHtml: string;
  deckId: string;
  deckTitle: string | null;
  currentVersion: number;
  versions: DeckVersionRow[];
  currentUserId: string | null;
  currentUserEmail: string | null;
  isOwner: boolean;
  deckOwnerId: string | null;
  isPartner: boolean;
  comments: CommentRow[];
  stubs: StubRow[];
  flags: FlagRow[];
  /** Each version's stored HTML (version number → html), for the spine thumbnail
   *  strips. May omit versions (capped) or be empty (anon / pre-migration). */
  versionsHtml: Record<number, string>;
  participants: DeckParticipant[];
  reviewingCount: number;
  arrivalActivity: ArrivalActivity | null;
  loginHref: string;
};

export default function DeckFeed({
  rawHtml,
  deckId,
  deckTitle,
  currentVersion,
  versions,
  currentUserId,
  currentUserEmail,
  isOwner,
  deckOwnerId,
  isPartner,
  comments,
  stubs,
  flags,
  versionsHtml,
  participants,
  reviewingCount,
  arrivalActivity,
  loginHref,
}: Props) {
  // parseDeck uses DOMParser (browser only): SSR-empty, parse after mount. The
  // feed column (FeedStream) parses its own copy for the cards; this one is for
  // the deck PEEK on the right.
  const [deck, setDeck] = useState<ParsedDeck>(EMPTY_DECK);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeck(parseDeck(rawHtml));
  }, [rawHtml]);

  const slideCount = deck.slides.length;

  // current-version slide srcDocs for the peek iframe (one per slide index).
  const slideSrcDocs = useMemo(
    () =>
      deck.slides.map((html) =>
        buildSrcdoc(html, deck.headHtml, deck.hasAuthoredStyles, { measure: false }),
      ),
    [deck],
  );

  // ── peek selection ────────────────────────────────────────────────────────
  // Which slide the peek shows. Driven by FeedStream via onSelectSlide (a feed
  // card or a version thumbnail emits its real-slide index).
  const [peekIndex, setPeekIndex] = useState(0);
  const safePeek = slideCount > 0 ? Math.min(peekIndex, slideCount - 1) : 0;

  // ── per-slide stats for the peek (proper aggregation over the FULL datasets) ─
  const commentsBySlide = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of comments) m.set(c.slide_index, (m.get(c.slide_index) ?? 0) + 1);
    return m;
  }, [comments]);
  const flagsBySlide = useMemo(() => {
    const m = new Map<number, number>();
    for (const f of flags)
      if (!f.dismissed) m.set(f.slide_index, (m.get(f.slide_index) ?? 0) + 1);
    return m;
  }, [flags]);
  // keyed by `position` (= "after slide N"); position 0 = before slide 1.
  const stubsByPosition = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of stubs)
      if (!s.dismissed) m.set(s.position, (m.get(s.position) ?? 0) + 1);
    return m;
  }, [stubs]);

  const peekComments = commentsBySlide.get(safePeek) ?? 0;
  const peekFlags = flagsBySlide.get(safePeek) ?? 0;
  const peekRequested =
    (stubsByPosition.get(safePeek + 1) ?? 0) +
    (safePeek === 0 ? stubsByPosition.get(0) ?? 0 : 0);

  // ── landing analytics (fire once) ─────────────────────────────────────────
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const role = isOwner ? "owner" : currentUserId ? "collaborator" : "anon";
    if (currentUserId) {
      // is_partner SUPER-property (rides every later event) + email as a PERSON
      // property for the "Design partners" cohort (founder decision). Email is
      // never put on individual events. (docs/G1-MEASUREMENT.md §3.)
      registerSuperProperties({ is_partner: isPartner });
      identifyUser(currentUserId, {
        is_partner: isPartner,
        email: currentUserEmail,
      });
    }
    track("deck_landing_viewed", {
      view: "feed",
      deck_id: deckId,
      role,
      version: currentVersion,
      comment_count: comments.length,
      stub_count: stubs.length,
      flag_count: flags.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOpenDeck = () =>
    track("feed_open_deck", { deck_id: deckId, from_version: currentVersion });
  // ?from=feed marks the deck session as feed-origin, so feedback made after
  // opening the deck from here is attributed surface:feed (docs/G1-MEASUREMENT.md §4).
  const deckHref = `/viewer?id=${deckId}&view=deck&from=feed`;
  const openSlideHref = `${deckHref}&slide=${safePeek}`;

  // Live presence — green dots on the Huddlers cluster (signed-in only).
  const onlineIds = useDeckPresence(deckId, currentUserId);
  // The deck's per-huddle person-colour assignment (design-system §2.5) —
  // same server-resolved join order as the floating viewer, so both surfaces
  // paint every person identically.
  const personColors = useMemo(
    () => buildPersonColorAssignment(participants, deckOwnerId),
    [participants, deckOwnerId],
  );

  const peekScale = PEEK_W / (deck.slideWidth || 1);
  const peekHeight = Math.round((deck.slideHeight || 1) * peekScale);
  const peekSrc = slideSrcDocs[safePeek] ?? "";

  const pill =
    "flex items-center h-[52px] rounded-2xl border border-black/[0.06] bg-white/80 px-2.5 shadow-[0_6px_22px_rgba(0,0,0,0.10)] backdrop-blur-md";

  return (
    <PersonColorProvider value={personColors}>
    <div className="relative flex-1 min-w-0 min-h-0 flex flex-col bg-[#f6f6fa] overflow-hidden">
      {/* TOP BAR */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3">
        <div className={pill}>
          <Link
            href={currentUserId ? "/dashboard" : "/"}
            className="flex items-center gap-2 text-brand font-semibold shrink-0"
            aria-label="SlideHuddle — go to your dashboard"
          >
            <span className="inline-block h-6 w-6 rounded-md bg-brand" />
            <span className="text-[15px]">SlideHuddle</span>
          </Link>
          {deckTitle && (
            <>
              <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-black/10 shrink-0" />
              {/* Just the deck title in the feed — no version pill: the feed is a
                  cross-version conversation, so a single version chip would be
                  misleading. (The peek + "Open deck" carry the current version.) */}
              <span className="text-sm font-semibold text-foreground truncate max-w-[36vw]">
                {deckTitle}
              </span>
            </>
          )}
        </div>

        <div className={`${pill} gap-2`}>
          {currentUserId ? (
            <HuddleAvatars
              participants={participants}
              currentUserId={currentUserId}
              ownerId={deckOwnerId}
              onlineIds={onlineIds}
            />
          ) : reviewingCount >= 1 ? (
            <ReviewingChip count={reviewingCount} />
          ) : (
            <SharedDeckChip />
          )}
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
          <Link
            href={deckHref}
            onClick={onOpenDeck}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white shrink-0 transition-colors hover:bg-brand-hover"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="13" rx="1.5" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            Open deck
          </Link>
        </div>
      </div>

      {/* BODY — feed column (shared FeedStream) + deck peek */}
      <div className="flex-1 min-h-0 flex gap-4 px-4 pb-4 overflow-hidden">
        <FeedStream
          rawHtml={rawHtml}
          currentVersion={currentVersion}
          versions={versions}
          currentUserId={currentUserId}
          deckOwnerId={deckOwnerId}
          comments={comments}
          stubs={stubs}
          flags={flags}
          versionsHtml={versionsHtml}
          participants={participants}
          arrivalActivity={arrivalActivity}
          // The peek is a real-slide preview, so map a card to a real slide:
          // comment/flag → its slide; a requested slide → the slide it sits after.
          onSelectItem={(item) => {
            if (item.kind === "comment") setPeekIndex(item.comment.slide_index);
            else if (item.kind === "flag") setPeekIndex(item.flag.slide_index);
            else setPeekIndex(Math.max(0, item.stub.position - 1));
          }}
          // Standalone feed: the peek is always the current version, so a version
          // thumbnail just drives the peek to that slide index (no version switch).
          onSelectVersionSlide={(idx) => setPeekIndex(idx)}
          deckHref={deckHref}
          onOpenDeck={onOpenDeck}
        />

        {/* DECK PEEK */}
        <aside className="hidden lg:flex w-[320px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-white/70 backdrop-blur-md shadow-[0_10px_30px_rgba(20,20,19,0.10)]">
          <div className="flex flex-col gap-3 p-4 min-h-0 overflow-y-auto">
            <div>
              <h5 className="text-sm font-bold text-[#1d1d1b]">Deck peek</h5>
              <p className="text-xs text-muted">
                {slideCount > 0
                  ? `Slide ${safePeek + 1} of ${slideCount} · v${currentVersion}`
                  : `v${currentVersion}`}
              </p>
            </div>
            <div
              className="relative w-full overflow-hidden rounded-xl border border-border bg-white"
              style={{ height: peekHeight > 0 ? peekHeight : 162 }}
            >
              {peekSrc ? (
                <iframe
                  key={`peek-${safePeek}`}
                  title={`Deck peek — slide ${safePeek + 1}`}
                  srcDoc={peekSrc}
                  sandbox="allow-scripts"
                  className="absolute top-0 left-0 origin-top-left border-0 bg-white"
                  style={{
                    width: `${deck.slideWidth}px`,
                    height: `${deck.slideHeight}px`,
                    transform: `scale(${peekScale})`,
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted">
                  Loading preview…
                </div>
              )}
            </div>

            {/* Per-slide stats for the selected slide */}
            <div className="flex flex-col gap-1.5">
              <StatRow
                label={`${peekComments} ${peekComments === 1 ? "comment" : "comments"}`}
                color="#0F6E56"
              />
              {peekFlags > 0 && (
                <StatRow
                  label={`${peekFlags} flagged for removal`}
                  color="#C2410C"
                />
              )}
              {peekRequested > 0 && (
                <StatRow
                  label={`${peekRequested} requested here`}
                  color="#0F6E56"
                />
              )}
            </div>

            <Link
              href={openSlideHref}
              onClick={onOpenDeck}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
            >
              Open slide {safePeek + 1}
            </Link>
            <p className="text-[11px] leading-relaxed text-muted">
              Click any item to peek its slide. The feed is read-only — open the
              deck to comment, request a slide, or flag one.
            </p>
          </div>
        </aside>
      </div>
    </div>
    </PersonColorProvider>
  );
}

// A quiet per-slide stat row in the peek (dot + label).
function StatRow({ label, color }: { label: string; color: string }) {
  return (
    <span className="flex items-center gap-2 text-[13px] font-medium" style={{ color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
