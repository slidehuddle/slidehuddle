import Link from "next/link";
import { after } from "next/server";
import SlideViewer from "./SlideViewer";
import FloatingViewer from "./FloatingViewer";
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
  getDeckParticipants,
  getStubsForDeck,
  recordDeckView,
  trackSharedDeck,
  type CommentRow,
  type DeckParticipant,
  type FlagRow,
  type StubRow,
} from "@/lib/slide-store";
import { computeUpdateBanner, type VersionStamp } from "./version-banner";
import { computeArrivalActivity, type ArrivalActivity } from "./arrival-activity";
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
    view?: string;
  }>;
}) {
  const { slides, id, source: sourceParam, v, view } = await searchParams;
  const isCaptureSource = sourceParam === "capture";
  // Opt-in flag for the new, full-bleed "floating" viewer. Default off: with no
  // ?view=floating in the URL, the current viewer renders through its existing,
  // unchanged code path below. (`view` is a separate param from `v`, which is
  // the version selector — they don't collide.)
  const useFloatingViewer = view === "floating";

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
  // The deck owner's user id (decks.user_id), captured from the metadata load so
  // the floating viewer's "huddle" can mark who the owner is without re-querying.
  let deckOwnerId: string | null = null;
  // The viewer's PREVIOUS last_viewed_at (read before this visit records a new
  // one). Drives the floating viewer's "comments since you were here" banner.
  let priorLastViewedAt: string | null = null;

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

  // The Claude conversation this deck was captured from, if known. Powers the
  // "Send to Claude" action (opens the bound chat). Null = unbound / orphan /
  // pre-migration deck → the button falls back to a new chat + clipboard.
  let conversationId: string | null = null;

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
    deckOwnerId = deck?.user_id ?? null;
    conversationId = deck?.conversation_id ?? null;
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
        const claimed = await claimOrphanDeck(id, user.id);
        // The capturer becomes the owner. isOwner was computed above BEFORE
        // this claim (when deck.user_id was still null), so promote it now —
        // otherwise owner-only UI (the "Send to Claude" feedback button) stays
        // hidden on the capture view until a manual reload.
        if (claimed) isOwner = true;
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
        // Capture the PRE-update timestamp for the arrival banner (this same
        // value also feeds the version "updated" banner below).
        priorLastViewedAt = prior?.last_viewed_at ?? null;

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

  // Privacy: the email of the teammate who requested a slide or flagged one is
  // resolved server-side (getStubsForDeck / getFlagsForDeck) and would otherwise
  // be serialized into the page for EVERY viewer — including anonymous people who
  // merely hold the share link. Collaborator identities must not leak to
  // not-signed-in viewers, so null those email fields unless the viewer is signed
  // in. (Signed-in viewers are recorded as the owner or a shared recipient, i.e.
  // part of the deck's collaboration, so they may see who left feedback.)
  const canSeeCollaboratorEmails = currentUserId !== null;
  const redactStubEmails = (rows: StubRow[]): StubRow[] =>
    canSeeCollaboratorEmails
      ? rows
      : rows.map((r) => ({ ...r, requested_by_email: null }));
  const redactFlagEmails = (rows: FlagRow[]): FlagRow[] =>
    canSeeCollaboratorEmails
      ? rows
      : rows.map((r) => ({ ...r, flagged_by_email: null }));
  const viewerStubs = viewingHistorical ? [] : redactStubEmails(initialStubs);
  const viewerFlags = viewingHistorical ? [] : redactFlagEmails(initialFlags);

  const viewerPath = id
    ? `/viewer?id=${id}${isCaptureSource ? "&source=capture" : ""}`
    : "/viewer";
  const loginHref = `/login?next=${encodeURIComponent(viewerPath)}`;

  // "In this huddle" people cluster — floating viewer only. Identities (emails)
  // are computed server-side and gated by the SAME rule that redacts stub/flag
  // emails above (canSeeCollaboratorEmails === signed in): an anonymous
  // link-holder is never sent any participant. We also only do the work for the
  // floating viewer + stored decks, so the current viewer's behaviour and
  // round-trips are completely unchanged.
  let participants: DeckParticipant[] = [];
  if (useFloatingViewer && source === "stored" && id && canSeeCollaboratorEmails) {
    const loaded = await getDeckParticipants(id, deckOwnerId);
    participants = loaded.rows;
  }

  // Arrival activity — "N comments since you were here" — for the floating
  // viewer. Computed from data already loaded (initialComments + the PRE-update
  // last_viewed_at), with no extra query. Same signed-in gate as participants:
  // anonymous viewers have no comments and no prior view, so they never get one.
  // Returns null for first-time viewers and when nothing is new.
  let arrivalActivity: ArrivalActivity | null = null;
  if (useFloatingViewer && source === "stored" && id && canSeeCollaboratorEmails) {
    arrivalActivity = computeArrivalActivity({
      comments: initialComments,
      lastViewedAt: priorLastViewedAt,
      currentUserId,
    });
  }

  // Gated new viewer. Renders the SAME server-prepared deck HTML full-bleed,
  // with floating control clusters over it (Phase 1). All the data-fetching and
  // role-gating above is shared and untouched; we only swap the presentation.
  // When the flag is off we fall through to the existing viewer unchanged.
  if (useFloatingViewer) {
    return (
      <main className="flex-1 flex min-h-0 overflow-hidden">
        <FloatingViewer
          rawHtml={html}
          deckId={viewerDeckId}
          deckTitle={deckTitle}
          currentVersion={currentVersion}
          viewingVersion={viewingVersion}
          versions={versionNav}
          readOnly={readOnly}
          currentUserId={currentUserId}
          currentUserEmail={currentUserEmail}
          isOwner={isOwner}
          conversationId={conversationId}
          // Comments seed. Loaded server-side only for signed-in viewers (so
          // anonymous viewers get [] — no comment authors ever reach them).
          initialComments={initialComments}
          // "In this huddle" participants — owner + collaborators + commenters,
          // with identities. Computed server-side ONLY for signed-in viewers
          // (anonymous link-holders get [] — no names/emails ever reach them).
          participants={participants}
          // "N comments since you were here" banner data — only for returning
          // signed-in viewers with new comments; null otherwise (no banner).
          arrivalActivity={arrivalActivity}
          // Requested slides shown in the strip + navigation for ALL viewers —
          // email-redacted for anonymous viewers, same as the current viewer.
          initialStubs={viewerStubs}
          // Removal flags are not shown in the floating viewer; they're only an
          // input to the owner-only "Send to AI" prompt, so send them to the
          // owner alone (others get []).
          initialFlags={isOwner ? initialFlags : []}
          loginHref={loginHref}
        />
      </main>
    );
  }

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
        // Remount on version switch so comments/stubs/flags re-seed from the
        // server's per-version data. Without this, soft-navigating between
        // versions reuses the component and keeps the previous version's
        // collaboration state (e.g. v1 comments lingering on v2).
        key={`${id ?? "none"}:v${viewingVersion}`}
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
        conversationId={conversationId}
        loadErrors={loadErrors}
        deckLoadFailed={deckLoadFailed}
        loginHref={loginHref}
      />
    </main>
  );
}
