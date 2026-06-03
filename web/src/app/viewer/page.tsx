import Link from "next/link";
import { after } from "next/server";
import SlideViewer from "./SlideViewer";
import TopNav from "@/components/TopNav";
import DeckVersionNav, { type VersionNavItem } from "./DeckVersionNav";
import UpdatedBanner from "./UpdatedBanner";
import { SAMPLE_SLIDES_HTML } from "@/lib/sample-slides";
import {
  claimOrphanDeck,
  getCommentsForDeck,
  getDeckMeta,
  getDeckVersionHtml,
  getDeckVersions,
  getDeckView,
  getFlagsForDeck,
  getStoredSlides,
  getStubsForDeck,
  recordDeckView,
  trackSharedDeck,
  type CommentRow,
  type FlagRow,
  type StubRow,
} from "@/lib/slide-store";
import { computeUpdateBanner, type VersionStamp } from "./version-banner";
import { describeChange, summarizeDeckChange } from "./deck-diff";
import { getSupabaseServer } from "@/lib/supabase-server";

export default async function ViewerPage({
  searchParams,
}: {
  searchParams: Promise<{
    slides?: string;
    id?: string;
    source?: string;
    v?: string;
  }>;
}) {
  const { slides, id, source: sourceParam, v } = await searchParams;
  const isCaptureSource = sourceParam === "capture";

  let html = "";
  let source: "param" | "stored" | "sample";
  // True only when loading the deck's HTML actually errored (vs. the deck not
  // existing, or having no slides) — lets the viewer show a distinct "couldn't
  // load this deck" message rather than the generic empty state.
  let deckLoadFailed = false;

  if (slides) {
    html = slides;
    source = "param";
  } else if (id) {
    // The deck HTML is loaded further down — AFTER we know whether a past
    // version was requested — so we fetch a single snapshot (the one being
    // viewed) rather than the current deck plus the historical one.
    source = "stored";
  } else {
    html = SAMPLE_SLIDES_HTML;
    source = "sample";
  }

  const supabase = await getSupabaseServer();

  let currentUserId: string | null = null;
  let currentUserEmail: string | null = null;
  let initialComments: CommentRow[] = [];
  let initialStubs: StubRow[] = [];
  let initialFlags: FlagRow[] = [];
  let isOwner = false;

  // Whether each collaboration dataset FAILED to load (a real error — table
  // missing, query failed, permission denied — not a genuine empty result).
  // Passed to the viewer so it can show a "couldn't load" indicator instead of
  // silently rendering an empty state. Default false = nothing went wrong.
  const loadErrors = {
    comments: false,
    stubs: false,
    flags: false,
    versions: false,
  };

  // Version UI state (stored decks only).
  let deckTitle: string | null = null;
  let versionNav: VersionNavItem[] = [];
  let currentVersion = 1;
  let viewingVersion = 1;
  let viewingHistorical = false;
  let bannerDetail: string | null = null;

  if (source === "stored" && id) {
    // One parallel round-trip for the session + all deck metadata, instead of
    // fetching the user and then the metadata in sequence.
    const [authRes, deck, stubsLoad, flagsLoad, versionsLoad] =
      await Promise.all([
        supabase.auth.getUser(),
        getDeckMeta(id),
        getStubsForDeck(id),
        getFlagsForDeck(id),
        getDeckVersions(id),
      ]);
    const user = authRes.data.user;
    currentUserEmail = user?.email ?? null;
    initialStubs = stubsLoad.rows;
    initialFlags = flagsLoad.rows;
    loadErrors.stubs = stubsLoad.failed;
    loadErrors.flags = flagsLoad.failed;
    loadErrors.versions = versionsLoad.failed;
    const versions = versionsLoad.rows;
    isOwner = !!(user && deck && deck.user_id === user.id);
    deckTitle = deck?.title ?? null;
    currentVersion = deck?.version ?? 1;
    viewingVersion = currentVersion;

    versionNav = versions.map((vv) => ({
      version: vv.version,
      createdAt: vv.created_at,
    }));

    // Load ONLY the snapshot we'll show: the requested past version, or the
    // current deck — never both. (Previously the current HTML was always
    // fetched first and then discarded when a past version was requested.)
    const requestedV = v ? parseInt(v, 10) : NaN;
    const wantsHistorical =
      Number.isFinite(requestedV) &&
      requestedV >= 1 &&
      requestedV !== currentVersion;
    if (wantsHistorical) {
      const vHtml = await getDeckVersionHtml(id, requestedV);
      if (vHtml) {
        html = vHtml;
        viewingVersion = requestedV;
        viewingHistorical = true;
      }
    }
    if (!viewingHistorical) {
      const slidesLoad = await getStoredSlides(id);
      html = slidesLoad.html ?? "";
      deckLoadFailed = slidesLoad.failed;
    }

    if (user && deck) {
      if (isCaptureSource && deck.user_id === null) {
        await claimOrphanDeck(id, user.id);
      } else if (!isOwner && deck.user_id !== null) {
        await trackSharedDeck(id, user.id);
      }
      currentUserId = user.id;

      if (viewingHistorical) {
        // A past version is read-only, but it still shows the comments that
        // were written ON that version — their slide indices line up with that
        // version's slides. The "updated since you last viewed" banner is
        // current-deck only, so it's skipped here.
        const commentsLoad = await getCommentsForDeck(
          id,
          user.id,
          viewingVersion,
        );
        initialComments = commentsLoad.rows;
        loadErrors.comments = commentsLoad.failed;
      } else {
        // Current deck. The prior-view timestamp and the current-version
        // comments are independent reads — fetch them together. (Read
        // getDeckView BEFORE recordDeckView below so the banner still sees the
        // pre-update timestamp.)
        const [prior, commentsLoad] = await Promise.all([
          getDeckView(id, user.id),
          getCommentsForDeck(id, user.id, viewingVersion),
        ]);
        initialComments = commentsLoad.rows;
        loadErrors.comments = commentsLoad.failed;

        const stamps: VersionStamp[] = versions.map((vv) => ({
          version: vv.version,
          created_at: vv.created_at,
        }));
        const decision = computeUpdateBanner({
          versions: stamps,
          currentVersion,
          lastViewedAt: prior?.last_viewed_at ?? null,
        });
        if (decision) {
          // Build a real change summary by diffing the version they last saw
          // against the current one (both full snapshots are stored). `html`
          // here is the current deck HTML (we're not viewing a past version).
          const oldHtml = await getDeckVersionHtml(id, decision.fromVersion);
          const change = oldHtml ? summarizeDeckChange(oldHtml, html) : null;
          bannerDetail = describeChange(
            decision.fromVersion,
            decision.toVersion,
            change,
          );
        }
      }

      // Recording the view is a write the reader doesn't need to wait for, so
      // run it AFTER the response is sent — off the render critical path.
      const viewerUserId = user.id;
      after(() => recordDeckView(id, viewerUserId));
    }
  } else {
    // param / sample sources still need the session for the top-nav state.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    currentUserEmail = user?.email ?? null;
  }

  // Stored decks always pass their real id so the comments panel can render
  // and show this version's comments. A historical version is shown read-only
  // (readOnly disables new comments / stubs / flags). Stubs and flags track the
  // CURRENT deck and could mis-align on an older slide set, so they stay hidden
  // on historical views; comments are version-scoped and line up correctly.
  const viewerDeckId = source === "stored" ? id ?? null : null;
  const readOnly = viewingHistorical;
  const viewerStubs = viewingHistorical ? [] : initialStubs;
  const viewerFlags = viewingHistorical ? [] : initialFlags;

  const viewerPath = id
    ? `/viewer?id=${id}${isCaptureSource ? "&source=capture" : ""}`
    : "/viewer";
  const loginHref = `/login?next=${encodeURIComponent(viewerPath)}`;

  const centerSlot =
    source === "stored" && id ? (
      <DeckVersionNav
        deckId={id}
        title={deckTitle}
        currentVersion={currentVersion}
        viewingVersion={viewingVersion}
        versions={versionNav}
      />
    ) : undefined;

  return (
    <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <TopNav loginHref={loginHref} centerSlot={centerSlot} />
      {source === "sample" && (
        <div className="px-8 py-1.5 text-xs text-muted border-b border-border">
          Viewing sample deck
        </div>
      )}
      {viewingHistorical && id && (
        <div className="flex items-center justify-between gap-3 px-8 py-1.5 text-xs border-b border-border bg-[#f6f6fa] text-muted">
          <span>
            You&apos;re viewing version {viewingVersion} — a past version of this
            deck.
          </span>
          <Link
            href={`/viewer?id=${id}`}
            className="font-semibold text-brand hover:text-brand-hover shrink-0"
          >
            Back to current version (v{currentVersion})
          </Link>
        </div>
      )}
      {bannerDetail && <UpdatedBanner detail={bannerDetail} />}
      <SlideViewer
        rawHtml={html}
        deckId={viewerDeckId}
        viewingVersion={viewingVersion}
        readOnly={readOnly}
        initialComments={initialComments}
        initialStubs={viewerStubs}
        initialFlags={viewerFlags}
        currentUserId={currentUserId}
        currentUserEmail={currentUserEmail}
        isOwner={isOwner}
        loadErrors={loadErrors}
        deckLoadFailed={deckLoadFailed}
        loginHref={loginHref}
      />
    </main>
  );
}
