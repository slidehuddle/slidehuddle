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
import FeedItemCard from "./FeedItemCard";
import VersionSpineEvent, { type AddressedSummary } from "./VersionSpineEvent";
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

  return (
    <div ref={scrollRef} className={className}>
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
                        // "Settled": an addressed/dismissed item in a PAST
                        // round desaturates; unaddressed items (no addressedIn
                        // & not dismissed) keep their colour so live threads
                        // pop. The current round never mutes. (P1.2 Item A.)
                        muted={
                          !round.isCurrent &&
                          (item.addressedIn != null || isItemDismissed(item))
                        }
                        onSelect={() => selectItem(item, v.version)}
                        onAddressedClick={scrollToVersion}
                        // Owner curation on current-round cards only (past
                        // rounds are frozen history; only current items feed
                        // the AI prompt). Maps this card's kind to the host's
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
      </div>
    </div>
  );
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
