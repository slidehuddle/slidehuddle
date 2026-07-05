"use client";

// The conversation FEED column — the version-chronology spine of rounds, the
// feed item cards, the arrival ribbon, and the empty state. EXTRACTED from
// DeckFeed (it used to live inline there) so the exact same column can be reused
// in two places WITHOUT a second copy:
//   1. DeckFeed (?view=feed)           — this column + its own top bar + deck peek.
//   2. FloatingViewer (?view=spectrum) — the LEFT region of the feed↔deck
//      spectrum, where it widens out of the thumbnail rail into the full feed.
// It owns the whole feed model — rounds, per-version thumbnail parsing, the
// "✓ Addressed in vN" jump, opening scrolled to the current version, and the
// greyed past-round snapshot (BEHAVIOURS A2/A4/A6) — so neither host has to
// reimplement (or regress) it. Selecting an item emits the target real-slide
// index via onSelectSlide; the host decides what to do with it (drive the deck
// peek, or drive the live slide stage in the spectrum).

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  parseDeck,
  buildSrcdoc,
  EMPTY_DECK,
  type ParsedDeck,
} from "./parse-deck";
import { buildVersionSpine, type ConvItem } from "./feed-items";
import FeedItemCard, {
  nameFromEmail,
  RealSlideThumb,
  StubPreviewThumb,
} from "./FeedItemCard";
import VersionSpineEvent, { aiName, type AddressedSummary } from "./VersionSpineEvent";
import { AI_FILTER_ID } from "./HuddleFilterStack";
import type {
  CommentRow,
  DeckParticipant,
  DeckVersionRow,
  FlagRow,
  StubRow,
} from "@/lib/slide-store";
import type { ArrivalActivity } from "./arrival-activity";

type Props = {
  rawHtml: string;
  currentVersion: number;
  versions: DeckVersionRow[];
  currentUserId: string | null;
  deckOwnerId: string | null;
  comments: CommentRow[];
  stubs: StubRow[];
  flags: FlagRow[];
  /** Each version's stored HTML (version number → html), for the spine thumbnail
   *  strips. May omit versions (capped) or be empty (anon / pre-migration). */
  versionsHtml: Record<number, string>;
  participants: DeckParticipant[];
  arrivalActivity: ArrivalActivity | null;
  /** A feed CARD was selected (comment / requested slide / removal flag), with
   *  the VERSION of the round it belongs to. The host decides what to show:
   *  DeckFeed peeks the nearest real slide (current version); the spectrum shows
   *  the item in its round's version — navigating there if it isn't the version
   *  on the stage, and focusing the exact display item (an open requested slide →
   *  that stub card) when it is. Passing the item + version is what lets a
   *  requested slide map to the stub, and an older-round item update the pill. */
  onSelectItem?: (item: ConvItem, itemVersion: number) => void;
  /** A version-spine THUMBNAIL was clicked: (slideIndex, version). Unlike a card,
   *  a thumbnail names a specific version, so the spectrum host can switch to
   *  that version (updating the version pill). DeckFeed just peeks the slide. */
  onSelectVersionSlide?: (slideIndex: number, version: number) => void;
  /** Optional "+" insert-between-slides (D3) for the CURRENT version's spine
   *  thumbnail strip — the expanded feed's fidelity of the rail's insert.
   *  Omitted (the standalone read-only feed) → no gaps, strip unchanged. */
  insert?: ComponentProps<typeof VersionSpineEvent>["insert"];
  /** Optional owner curation, applied to CURRENT-round cards only (past rounds
   *  are a frozen snapshot; only current items feed the AI prompt). The
   *  spectrum passes its live hook handlers; the standalone read-only feed
   *  passes nothing → cards render exactly as before. */
  curation?: {
    dismissComment: (id: string, dismissed: boolean) => Promise<void>;
    editComment: (id: string, ownerEditedBody: string | null) => Promise<void>;
    dismissStub: (id: string, dismissed: boolean) => Promise<void>;
    dismissFlag: (id: string, dismissed: boolean) => Promise<void>;
  } | null;
  /** Huddler filter (Slice 3, spectrum only): HIDE every card NOT authored by
   *  this person (dimming made the feed hard to navigate — founder call
   *  2026-07-03) and show the "Showing {name}'s feedback ✕" chip. Version
   *  spine events always stay (they're the backbone). AI_FILTER_ID hides ALL
   *  cards → the version spine alone ("Showing {AI}'s versions").
   *  null/omitted → no filter UI (the standalone feed). */
  filterUserId?: string | null;
  onClearFilter?: () => void;
  /** "Open deck" target shown in the EMPTY state (DeckFeed only). Omitted in the
   *  spectrum, where the deck is already on-screen, so the button is hidden. */
  deckHref?: string;
  onOpenDeck?: () => void;
  /** Classes for the scroll root. Defaults to the feed column's flex sizing
   *  (used by DeckFeed); the spectrum passes its own absolute-fill classes. */
  className?: string;
};

export default function FeedStream({
  rawHtml,
  currentVersion,
  versions,
  currentUserId,
  deckOwnerId,
  comments,
  stubs,
  flags,
  versionsHtml,
  participants,
  arrivalActivity,
  onSelectItem,
  onSelectVersionSlide,
  insert = null,
  curation = null,
  filterUserId = null,
  onClearFilter,
  deckHref,
  onOpenDeck,
  className = "flex-1 min-w-0 overflow-y-auto",
}: Props) {
  // The CURRENT (latest) version's deck drives the feed's card thumbnails and the
  // "current" spine event's strip. Anchor it to the current version's stored HTML
  // from `versionsHtml` — NOT `rawHtml`, because in the spectrum `rawHtml` is the
  // STAGE's version, which may be a HISTORICAL one the user navigated to (else the
  // "published vN" event would show the old version's thumbnails). Fall back to
  // `rawHtml` for pre-migration decks with no per-version HTML. (DOMParser → after
  // mount; SSR-empty.)
  const currentHtml = versionsHtml[currentVersion] ?? rawHtml;
  const [deck, setDeck] = useState<ParsedDeck>(EMPTY_DECK);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeck(parseDeck(currentHtml));
  }, [currentHtml]);

  // Version spine: rounds, oldest-first. Each round = a version + the
  // conversation that happened during it (indented under the spine event).
  const rounds = useMemo(
    () => buildVersionSpine({ versions, comments, stubs, flags }),
    [versions, comments, stubs, flags],
  );
  const hasConversation = comments.length + stubs.length + flags.length > 0;
  const currentRoundIndex = rounds.findIndex((r) => r.isCurrent);

  // current-version slide srcDocs, indexed by slide index — built once and shared
  // by every card thumbnail (so repeated slides don't re-render work).
  const slideSrcDocs = useMemo(
    () =>
      deck.slides.map((html) =>
        buildSrcdoc(html, deck.headHtml, deck.hasAuthoredStyles, { measure: false }),
      ),
    [deck],
  );

  // Per-slide TITLES for the cluster headers (Slice B): the first heading in
  // each slide's HTML, truncated. Best-effort — a slide with no heading shows
  // just "Slide N". Client-only (DOMParser); deck starts EMPTY so this maps
  // over [] during SSR.
  const slideTitles = useMemo(
    () =>
      deck.slides.map((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const h = doc.querySelector("h1, h2, h3");
        // textContent glues sibling elements together ("CompetitiveBenchmark");
        // join the heading's text chunks with spaces instead.
        const t = h
          ? Array.from(h.childNodes)
              .map((n) => n.textContent?.trim() ?? "")
              .filter(Boolean)
              .join(" ")
              .replace(/\s+/g, " ")
          : "";
        if (!t) return null;
        return t.length > 60 ? t.slice(0, 60) + "…" : t;
      }),
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

  // ── selection ─────────────────────────────────────────────────────────────
  // The card ring lives here; the SLIDE it points at is emitted to the host.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  function selectItem(item: ConvItem, itemVersion: number) {
    setSelectedKey(item.key);
    onSelectItem?.(item, itemVersion);
  }

  // ── huddler filter (Slice 3) ──────────────────────────────────────────────
  // Who authored an item; cards by anyone else HIDE while a filter is active
  // (AI_FILTER_ID matches nobody → all cards hide, the spine stands alone).
  const authorOf = (it: ConvItem): string | null =>
    it.kind === "comment"
      ? it.comment.user_id
      : it.kind === "stub"
        ? it.stub.requested_by
        : it.flag.flagged_by;
  const itemHidden = (it: ConvItem): boolean =>
    !!filterUserId && authorOf(it) !== filterUserId;
  const hiddenCount = useMemo(() => {
    if (!filterUserId) return 0;
    let n = 0;
    for (const r of rounds)
      for (const it of r.items) if (authorOf(it) !== filterUserId) n++;
    return n;
  }, [rounds, filterUserId]);
  const totalItemCount = useMemo(
    () => rounds.reduce((n, r) => n + r.items.length, 0),
    [rounds],
  );
  const isAiFilter = filterUserId === AI_FILTER_ID;
  // Filtering to YOURSELF reads "your feedback" (the stack labels you "you").
  const isSelfFilter = !!filterUserId && filterUserId === currentUserId;
  // A PERSON filter (not the AI) that matches nothing → show a clean empty
  // state instead of the whole version spine with no cards under it.
  const emptyPersonFilter =
    !!filterUserId && !isAiFilter && hiddenCount === totalItemCount;
  const filterName = !filterUserId
    ? null
    : isAiFilter
      ? aiName(
          [...versions]
            .filter((v) => v.source)
            .sort((a, b) => b.version - a.version)[0]?.source ?? null,
        )
      : nameFromEmail(
          participants.find((p) => p.userId === filterUserId)?.email ?? null,
        );

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

  // Scroll so the CURRENT version's round sits ~15% below the top (a slice of
  // the previous round shows above). Used to open the feed there, and to return
  // there when a filter is cleared.
  const scrollToCurrentRound = useCallback(() => {
    const container = scrollRef.current;
    const currentVer = rounds[currentRoundIndex]?.version.version;
    const el = currentVer != null ? roundRefs.current.get(currentVer) : null;
    if (!container || !el) return;
    container.scrollTop +=
      el.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      container.clientHeight * 0.15;
  }, [rounds, currentRoundIndex]);

  // Open at the CURRENT version once, after layout. If it's the first/only
  // round (nothing above), the top is already correct.
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    if (currentRoundIndex <= 0) {
      openedRef.current = true;
      return;
    }
    scrollToCurrentRound();
    openedRef.current = true;
  }, [currentRoundIndex, parsedByVersion, scrollToCurrentRound]);

  // When a filter is CLEARED, return to the current version's comments (founder
  // call 2026-07-03) — the cards reappear, so scroll after the DOM settles.
  const prevFilterRef = useRef(filterUserId);
  useEffect(() => {
    const was = prevFilterRef.current;
    prevFilterRef.current = filterUserId;
    if (was && !filterUserId) {
      const raf = requestAnimationFrame(scrollToCurrentRound);
      return () => cancelAnimationFrame(raf);
    }
  }, [filterUserId, scrollToCurrentRound]);

  return (
    <div ref={scrollRef} className={className}>
      <div className="mx-auto w-full max-w-[760px] py-2 flex flex-col gap-3">
        {/* Huddler filter chip — why the feed looks thinner, and the way out. */}
        {filterUserId && (
          <div className="sticky top-0 z-10 flex items-center gap-2 py-0.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm"
              style={{ backgroundColor: "#E1F5EE", color: "#085041" }}
            >
              {isSelfFilter
                ? "Showing your feedback"
                : `Showing ${filterName}’s ${isAiFilter ? "versions" : "feedback"}`}
              <button
                type="button"
                onClick={onClearFilter}
                aria-label="Clear the filter — show everyone's feedback"
                className="px-0.5 font-semibold transition-opacity hover:opacity-60"
              >
                ✕
              </button>
            </span>
            {hiddenCount > 0 && !emptyPersonFilter && (
              <span className="text-[11px] text-muted">
                {hiddenCount} {isAiFilter ? "feedback items" : "from others"} hidden
              </span>
            )}
          </div>
        )}
        {/* A person with nothing on this deck → a clean empty state (founder
            call 2026-07-03), not the whole spine with no cards under it. */}
        {emptyPersonFilter ? (
          <div className="mt-2 rounded-2xl border border-dashed border-border bg-white/60 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-[#1d1d1b]">
              {isSelfFilter
                ? "You haven’t contributed to this deck yet"
                : `No contributions from ${filterName} to this deck yet`}
            </p>
            <p className="mt-1 text-sm text-muted">
              {isSelfFilter ? "Your" : `${filterName}’s`} comments, requested
              slides, and removal flags will show up here.
            </p>
            <button
              type="button"
              onClick={onClearFilter}
              className="mt-4 text-xs font-semibold text-brand hover:text-brand-hover"
            >
              Show everyone&apos;s feedback
            </button>
          </div>
        ) : (
          <>
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
                  onSelectSlide={(idx, ver) => onSelectVersionSlide?.(idx, ver)}
                  // "+" insert only on the CURRENT version's strip (a past
                  // round is a frozen snapshot — no inserts, matching D3's
                  // read-only behaviour).
                  insert={round.isCurrent ? insert : null}
                />
                {/* "Feed opens here" marker on the current round (only when
                    there's earlier content above it). */}
                {round.isCurrent && currentRoundIndex > 0 && (
                  <div className="flex items-center gap-2 pl-1 text-[11px] font-semibold uppercase tracking-wide text-brand">
                    <span>▾ Feed opens here · since v{v.version}</span>
                    <span className="h-px flex-1 bg-brand/30" />
                  </div>
                )}
                {/* SLIDE-ANCHORED CLUSTERS (Slice B, 2026-07-05): the round's
                    items — already sorted slide-first, time-second (A2) —
                    group into one cluster per slide: a header (the slide's
                    thumbnail declared ONCE as the anchor + "Slide N · title"
                    as plain text + a change count) with the items falling out
                    beneath it on a quiet connector line as rows (bare type
                    icon in the gutter, no chips/pills). A requested slide is
                    its OWN cluster at its position — the dashed-teal preview
                    IS its identity. */}
                {(() => {
                  const visible = round.items.filter((it) => !itemHidden(it));
                  if (visible.length === 0) return null;
                  const renderRow = (item: ConvItem) => (
                    <FeedItemCard
                      key={item.key}
                      layout="row"
                      item={item}
                      deck={deck}
                      slideSrcDocs={slideSrcDocs}
                      deckOwnerId={deckOwnerId}
                      currentUserId={currentUserId}
                      selected={selectedKey === item.key}
                      // "Settled": an addressed/dismissed item in a PAST
                      // round desaturates; unaddressed items (no addressedIn
                      // & not dismissed) keep their colour so live threads
                      // pop. The current round never mutes. (P1.2 Item A.)
                      muted={
                        !round.isCurrent &&
                        (item.addressedIn != null || isItemDismissed(item))
                      }
                      currentRound={round.isCurrent}
                      onSelect={() => selectItem(item, v.version)}
                      onAddressedClick={scrollToVersion}
                      // Owner curation on current-round rows only (past
                      // rounds are frozen history; only current items feed
                      // the AI prompt). Maps this row's kind to the host's
                      // hook handler; Edit is comments-only.
                      curation={
                        curation && round.isCurrent
                          ? {
                              onDismiss: (d) =>
                                item.kind === "comment"
                                  ? curation.dismissComment(item.comment.id, d)
                                  : item.kind === "stub"
                                    ? curation.dismissStub(item.stub.id, d)
                                    : curation.dismissFlag(item.flag.id, d),
                              onEdit:
                                item.kind === "comment"
                                  ? (t) => curation.editComment(item.comment.id, t)
                                  : null,
                            }
                          : null
                      }
                    />
                  );
                  return (
                    <div className="ml-3 flex flex-col gap-4 border-l-2 border-black/[0.07] pl-3 sm:ml-5 sm:pl-4">
                      {buildSlideClusters(visible).map((cluster) => {
                        if (cluster.kind === "stub") {
                          const s = cluster.item.stub;
                          const stubStruck =
                            s.dismissed || cluster.item.addressedIn != null;
                          const positionText =
                            s.position <= 0
                              ? "before slide 1"
                              : `after slide ${s.position}`;
                          return (
                            <div key={`stub-${cluster.item.key}`} className="flex flex-col gap-1.5">
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  onClick={() => selectItem(cluster.item, v.version)}
                                  aria-label={`Requested slide, ${positionText} — peek`}
                                  className={`shrink-0 rounded-lg transition-transform hover:scale-[1.02] ${
                                    stubStruck
                                      ? "[filter:grayscale(1)_opacity(0.75)]"
                                      : ""
                                  }`}
                                >
                                  <StubPreviewThumb
                                    deck={deck}
                                    title={s.title}
                                    subtitle={s.subtitle}
                                    body={s.body}
                                    width={CLUSTER_THUMB_W}
                                  />
                                </button>
                                <div className="min-w-0 pt-0.5">
                                  <p className="text-sm font-semibold text-[#1d1d1b]">
                                    Requested slide{" "}
                                    <span className="font-normal text-muted">
                                      · {positionText}
                                    </span>
                                  </p>
                                </div>
                              </div>
                              <div className="ml-2 flex flex-col gap-1 border-l-2 border-black/[0.05] pl-2 sm:ml-3 sm:pl-2.5">
                                {renderRow(cluster.item)}
                              </div>
                            </div>
                          );
                        }
                        const n = cluster.slideIndex + 1;
                        const title = slideTitles[cluster.slideIndex] ?? null;
                        return (
                          <div key={`slide-${cluster.slideIndex}`} className="flex flex-col gap-1.5">
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                onClick={() =>
                                  onSelectVersionSlide?.(cluster.slideIndex, currentVersion)
                                }
                                aria-label={`Slide ${n} — peek`}
                                className="shrink-0 rounded-lg transition-transform hover:scale-[1.02]"
                              >
                                <RealSlideThumb
                                  deck={deck}
                                  srcDoc={slideSrcDocs[cluster.slideIndex] ?? ""}
                                  slideNumber={n}
                                  removed={false}
                                  width={CLUSTER_THUMB_W}
                                />
                              </button>
                              <div className="min-w-0 pt-0.5">
                                <p className="truncate text-sm font-semibold text-[#1d1d1b]">
                                  Slide {n}
                                  {title && (
                                    <span className="font-normal text-muted"> · {title}</span>
                                  )}
                                </p>
                                <p className="mt-0.5 text-[11px] text-muted">
                                  {clusterCountText(cluster.items)}
                                </p>
                              </div>
                            </div>
                            <div className="ml-2 flex flex-col gap-1 border-l-2 border-black/[0.05] pl-2 sm:ml-3 sm:pl-2.5">
                              {cluster.items.map(renderRow)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
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
            {deckHref && (
              <Link
                href={deckHref}
                onClick={onOpenDeck}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                Open deck
              </Link>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

// Slide-cluster anchor thumbnail — slightly larger than the old per-card
// thumbnail (140), since it's declared once per cluster.
const CLUSTER_THUMB_W = 168;

// One cluster per slide (comments + flags on that slide, chronological), and
// one cluster PER requested slide at its position. round.items is already
// sorted by slide anchor then time (feed-items.ts, A2) — stubs sort between
// slides at position − 0.5 — so grouping consecutive runs is exact.
type SlideCluster =
  | { kind: "slide"; slideIndex: number; items: ConvItem[] }
  | { kind: "stub"; item: Extract<ConvItem, { kind: "stub" }> };

function buildSlideClusters(items: ConvItem[]): SlideCluster[] {
  const out: SlideCluster[] = [];
  for (const it of items) {
    if (it.kind === "stub") {
      out.push({ kind: "stub", item: it });
      continue;
    }
    const idx = it.kind === "comment" ? it.comment.slide_index : it.flag.slide_index;
    const last = out[out.length - 1];
    if (last && last.kind === "slide" && last.slideIndex === idx) last.items.push(it);
    else out.push({ kind: "slide", slideIndex: idx, items: [it] });
  }
  return out;
}

// The cluster header's change count: "2 comments · 1 removal" (only non-zero
// kinds; slide clusters never contain stubs).
function clusterCountText(items: ConvItem[]): string {
  const comments = items.filter((i) => i.kind === "comment").length;
  const flags = items.filter((i) => i.kind === "flag").length;
  const parts: string[] = [];
  if (comments > 0) parts.push(`${comments} ${comments === 1 ? "comment" : "comments"}`);
  if (flags > 0) parts.push(`${flags} ${flags === 1 ? "removal" : "removals"}`);
  return parts.join(" · ");
}

// Whether a conversation item is dismissed ("Won't action") — the per-type
// dismissed flag, used (with addressedIn) to decide the "settled" muting.
function isItemDismissed(item: ConvItem): boolean {
  if (item.kind === "comment") return item.comment.dismissed;
  if (item.kind === "stub") return item.stub.dismissed;
  return item.flag.dismissed;
}

// Short label for a resolved item in a version's "see changes" list.
function labelForItem(item: ConvItem): string {
  if (item.kind === "stub")
    return `Requested: ${item.stub.title?.trim() || "Untitled slide"}`;
  if (item.kind === "flag") return `Removal: slide ${item.flag.slide_index + 1}`;
  const body = item.comment.body.trim();
  return `Comment: ${body.length > 48 ? body.slice(0, 48) + "…" : body}`;
}
