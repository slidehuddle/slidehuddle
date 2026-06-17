"use client";

// The READ-ONLY conversation feed (P1.2) — an alternative LANDING surface for a
// deck, gated per-account (FEED_PARTNER_EMAILS, see page.tsx). The conversation
// is the content layer (a centred chronological stream of horizontal cards), and
// the deck is DEMOTED to a right-hand "peek". It composes ONLY data we already
// store — version events, comments, requested slides (stubs), removal flags.
//
// Read-only: NO composer. People participate by opening the deck (the peek /
// "Open slide N") and using the existing comment / request / flag controls;
// their feedback then shows back up here. (Phase 3 brings threads/quoting/
// decisions — out of scope.)
//
// Reuses: Avatar (the one avatar system), FeedItemCard (the one horizontal card),
// DeckVersionNav, HuddleAvatars, the Reviewing/SharedDeck chips, parseDeck/
// buildSrcdoc for the peek + the per-card slide thumbnails.

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
import { buildVersionSpine, type ConvItem } from "./feed-items";
import FeedItemCard from "./FeedItemCard";
import VersionSpineEvent, { type AddressedSummary } from "./VersionSpineEvent";
import { track, identifyUser } from "@/lib/analytics";
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
  // parseDeck uses DOMParser (browser only): SSR-empty, parse after mount.
  const [deck, setDeck] = useState<ParsedDeck>(EMPTY_DECK);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeck(parseDeck(rawHtml));
  }, [rawHtml]);

  // Version spine: rounds, oldest-first. Each round = a version + the
  // conversation that happened during it (indented under the spine event).
  const rounds = useMemo(
    () => buildVersionSpine({ versions, comments, stubs, flags }),
    [versions, comments, stubs, flags],
  );
  const hasConversation = comments.length + stubs.length + flags.length > 0;
  const currentRoundIndex = rounds.findIndex((r) => r.isCurrent);
  const slideCount = deck.slides.length;

  // current-version slide srcDocs, indexed by slide index — built once and shared
  // by every card thumbnail + the peek (so repeated slides don't re-render work).
  const slideSrcDocs = useMemo(
    () =>
      deck.slides.map((html) =>
        buildSrcdoc(html, deck.headHtml, deck.hasAuthoredStyles, { measure: false }),
      ),
    [deck],
  );

  // Parse each OTHER version's HTML for its spine thumbnail strip (the current
  // version reuses `deck`). Browser-only (DOMParser) → in an effect, like `deck`.
  const [parsedByVersion, setParsedByVersion] = useState<Map<number, ParsedDeck>>(
    () => new Map(),
  );
  useEffect(() => {
    const m = new Map<number, ParsedDeck>();
    for (const [vStr, html] of Object.entries(versionsHtml)) {
      const v = Number(vStr);
      if (v === currentVersion || !html) continue;
      m.set(v, parseDeck(html));
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParsedByVersion(m);
  }, [versionsHtml, currentVersion]);
  const deckForVersion = (v: number): ParsedDeck =>
    v === currentVersion ? deck : parsedByVersion.get(v) ?? EMPTY_DECK;

  // Items each version ADDRESSED (resolved), keyed by that version → the spine's
  // "addressed N requests · M removals" + the "see changes" list.
  const addressedByVersion = useMemo(() => {
    const m = new Map<number, ConvItem[]>();
    for (const round of rounds)
      for (const it of round.items)
        if (it.addressedIn) {
          const arr = m.get(it.addressedIn.version) ?? [];
          arr.push(it);
          m.set(it.addressedIn.version, arr);
        }
    return m;
  }, [rounds]);

  // ── selection + peek ──────────────────────────────────────────────────────
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [peekIndex, setPeekIndex] = useState(0);
  const safePeek = slideCount > 0 ? Math.min(peekIndex, slideCount - 1) : 0;

  function selectItem(item: ConvItem) {
    setSelectedKey(item.key);
    if (item.kind === "comment") setPeekIndex(item.comment.slide_index);
    else if (item.kind === "flag") setPeekIndex(item.flag.slide_index);
    else if (item.kind === "stub")
      setPeekIndex(Math.max(0, item.stub.position - 1));
  }

  // ── per-slide stats (proper aggregation over the FULL datasets) ────────────
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

  // Resolve a version's publisher (created_by) → email, via the participant list,
  // so the spine can name "requested by …" / the v1 owner. null when unknown.
  const emailById = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const p of participants) m.set(p.userId, p.email);
    return m;
  }, [participants]);

  // Scroll plumbing for the version spine: the feed scroller + a ref per round so
  // we can open at the current version and jump to an "✓ Addressed in vN" tag.
  const scrollRef = useRef<HTMLDivElement>(null);
  const roundRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const setRoundRef = (v: number) => (el: HTMLDivElement | null) => {
    if (el) roundRefs.current.set(v, el);
    else roundRefs.current.delete(v);
  };
  const scrollToVersion = (v: number) =>
    roundRefs.current.get(v)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Open at the CURRENT version: place its spine break ~15% below the top (a
  // slice of the previous round shows above). If it's the first/only round
  // (nothing above), stay at the top. Runs once, after layout.
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    if (currentRoundIndex <= 0) {
      openedRef.current = true; // nothing earlier → top is correct
      return;
    }
    const container = scrollRef.current;
    const currentVer = rounds[currentRoundIndex]?.version.version;
    const el = currentVer != null ? roundRefs.current.get(currentVer) : null;
    if (!container || !el) return;
    container.scrollTop +=
      el.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      container.clientHeight * 0.15;
    openedRef.current = true;
  }, [rounds, currentRoundIndex, parsedByVersion]);

  // ── landing analytics (fire once) ─────────────────────────────────────────
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const role = isOwner ? "owner" : currentUserId ? "collaborator" : "anon";
    if (currentUserId) identifyUser(currentUserId, { isPartner });
    track("deck_landing_viewed", {
      deckId,
      view: "feed",
      role,
      isPartner,
      commentCount: comments.length,
      stubCount: stubs.length,
      flagCount: flags.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOpenDeck = () => track("feed_open_deck", { deckId });
  const deckHref = `/viewer?id=${deckId}&view=deck`;
  const openSlideHref = `${deckHref}&slide=${safePeek}`;

  const peekScale = PEEK_W / (deck.slideWidth || 1);
  const peekHeight = Math.round((deck.slideHeight || 1) * peekScale);
  const peekSrc = slideSrcDocs[safePeek] ?? "";

  const pill =
    "flex items-center h-[52px] rounded-2xl border border-black/[0.06] bg-white/80 px-2.5 shadow-[0_6px_22px_rgba(0,0,0,0.10)] backdrop-blur-md";

  return (
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

      {/* BODY — feed column + deck peek */}
      <div className="flex-1 min-h-0 flex gap-4 px-4 pb-4 overflow-hidden">
        <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-[760px] py-2 flex flex-col gap-3">
            {arrivalActivity && (
              <div
                className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(74,63,181,0.08), rgba(74,63,181,0.03))",
                  borderColor: "rgba(74,63,181,0.18)",
                }}
              >
                <p className="text-sm text-[#3a3590]">
                  <span className="font-semibold">Since you were here:</span>{" "}
                  {arrivalActivity.count}{" "}
                  {arrivalActivity.count === 1 ? "new comment" : "new comments"}
                  {arrivalActivity.names.length > 0 && (
                    <span className="text-[#6b6b75]">
                      {" "}· {arrivalActivity.names.slice(0, 3).join(", ")}
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Version SPINE: each round = a full-width version event + the
                conversation that happened during it, indented under a thread
                line. Oldest-first; opens scrolled to the current version. */}
            {rounds.map((round, ri) => {
              const v = round.version;
              const addressed = addressedByVersion.get(v.version) ?? [];
              const summary: AddressedSummary = {
                comments: addressed.filter((i) => i.kind === "comment").length,
                requests: addressed.filter((i) => i.kind === "stub").length,
                removals: addressed.filter((i) => i.kind === "flag").length,
                items: addressed.map((i) => ({ key: i.key, label: labelForItem(i) })),
              };
              const creatorEmail = v.created_by
                ? emailById.get(v.created_by) ?? null
                : null;
              return (
                <div key={`round-${v.version}`}>
                  {/* "↑ earlier in this huddle" above the current round when
                      there's older content above it. */}
                  {round.isCurrent && currentRoundIndex > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                      }
                      className="mx-auto mb-2 flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-muted shadow-sm transition-colors hover:text-foreground"
                    >
                      ↑ earlier in this huddle
                    </button>
                  )}
                  <div ref={setRoundRef(v.version)} className="flex flex-col gap-2.5 scroll-mt-3">
                    <VersionSpineEvent
                      version={v.version}
                      slideCount={v.slide_count}
                      title={v.title}
                      createdAt={v.created_at}
                      isOpening={ri === 0}
                      isCurrent={round.isCurrent}
                      source={v.source}
                      creatorUserId={v.created_by}
                      creatorEmail={creatorEmail}
                      deckOwnerId={deckOwnerId}
                      deck={deckForVersion(v.version)}
                      addressed={summary}
                      onSelectSlide={(idx) => setPeekIndex(idx)}
                    />
                    {/* "Feed opens here" marker on the current round (only when
                        there's earlier content above it). */}
                    {round.isCurrent && currentRoundIndex > 0 && (
                      <div className="flex items-center gap-2 pl-1 text-[11px] font-semibold uppercase tracking-wide text-brand">
                        <span>▾ Feed opens here · since v{v.version}</span>
                        <span className="h-px flex-1 bg-brand/30" />
                      </div>
                    )}
                    {round.items.length > 0 && (
                      <div className="ml-3 flex flex-col gap-2.5 border-l-2 border-black/[0.07] pl-3 sm:ml-5 sm:pl-4">
                        {round.items.map((item) => (
                          <FeedItemCard
                            key={item.key}
                            item={item}
                            deck={deck}
                            slideSrcDocs={slideSrcDocs}
                            deckOwnerId={deckOwnerId}
                            currentUserId={currentUserId}
                            selected={selectedKey === item.key}
                            onSelect={() => selectItem(item)}
                            onAddressedClick={scrollToVersion}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {!hasConversation && (
              <div className="rounded-2xl border border-dashed border-border bg-white/60 px-5 py-6 text-center">
                <p className="text-sm font-semibold text-[#1d1d1b]">No conversation yet</p>
                <p className="mt-1 text-sm text-muted">
                  Open the deck to leave the first comment, request a slide, or flag
                  one for removal — it&apos;ll show up here.
                </p>
                <Link
                  href={deckHref}
                  onClick={onOpenDeck}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
                >
                  Open deck
                </Link>
              </div>
            )}
          </div>
        </div>

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

// Short label for a resolved item in a version's "see changes" list.
function labelForItem(item: ConvItem): string {
  if (item.kind === "stub")
    return `Requested: ${item.stub.title?.trim() || "Untitled slide"}`;
  if (item.kind === "flag") return `Removal: slide ${item.flag.slide_index + 1}`;
  const body = item.comment.body.trim();
  return `Comment: ${body.length > 48 ? body.slice(0, 48) + "…" : body}`;
}
