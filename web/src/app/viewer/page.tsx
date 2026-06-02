import Link from "next/link";
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

  let html: string;
  let source: "param" | "stored" | "sample";
  // True only when loading the deck's HTML actually errored (vs. the deck not
  // existing, or having no slides) — lets the viewer show a distinct "couldn't
  // load this deck" message rather than the generic empty state.
  let deckLoadFailed = false;

  if (slides) {
    html = slides;
    source = "param";
  } else if (id) {
    const slidesLoad = await getStoredSlides(id);
    html = slidesLoad.html ?? "";
    deckLoadFailed = slidesLoad.failed;
    source = "stored";
  } else {
    html = SAMPLE_SLIDES_HTML;
    source = "sample";
  }

  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let currentUserId: string | null = null;
  let currentUserEmail: string | null = user?.email ?? null;
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
    const [deck, stubsLoad, flagsLoad, versionsLoad] = await Promise.all([
      getDeckMeta(id),
      getStubsForDeck(id),
      getFlagsForDeck(id),
      getDeckVersions(id),
    ]);
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

    // Historical version view: ?v=N for a real, non-current version. Load that
    // version's stored HTML and present it read-only.
    const requestedV = v ? parseInt(v, 10) : NaN;
    if (
      Number.isFinite(requestedV) &&
      requestedV >= 1 &&
      requestedV !== currentVersion
    ) {
      const vHtml = await getDeckVersionHtml(id, requestedV);
      if (vHtml) {
        html = vHtml;
        viewingVersion = requestedV;
        viewingHistorical = true;
      }
    }

    if (user && deck) {
      if (isCaptureSource && deck.user_id === null) {
        await claimOrphanDeck(id, user.id);
      } else if (!isOwner && deck.user_id !== null) {
        await trackSharedDeck(id, user.id);
      }
      currentUserId = user.id;
      currentUserEmail = user.email ?? null;

      // Decide the "updated since you last viewed it" banner BEFORE recording
      // this view (which advances the timestamp). Current version only.
      if (!viewingHistorical) {
        const prior = await getDeckView(id, user.id);
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

        // Comments only make sense on the current deck.
        const commentsLoad = await getCommentsForDeck(id, user.id);
        initialComments = commentsLoad.rows;
        loadErrors.comments = commentsLoad.failed;
      }

      await recordDeckView(id, user.id);
    }
  }

  // Viewing a past version → read-only: pass deckId=null so collaboration
  // overlays (which track the CURRENT deck and could mis-align on an older
  // slide set) are hidden.
  const viewerDeckId =
    source === "stored" && !viewingHistorical ? id ?? null : null;
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
