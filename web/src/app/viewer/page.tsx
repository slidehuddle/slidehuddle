import Link from "next/link";
import { after } from "next/server";
import SlideViewer from "./SlideViewer";
import FloatingViewer from "./FloatingViewer";
import DeckFeed from "./DeckFeed";
import TopNav from "@/components/TopNav";
import DeckVersionNav, { type VersionNavItem } from "./DeckVersionNav";
import UpdatedBanner from "./UpdatedBanner";
import { SAMPLE_SLIDES_HTML } from "@/lib/sample-slides";
import {
  claimOrphanDeck,
  getAllCommentsForDeck,
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
  type DeckVersionRow,
  type FlagRow,
  type StubRow,
} from "@/lib/slide-store";
import { computeUpdateBanner, type VersionStamp } from "./version-banner";
import { computeArrivalActivity, type ArrivalActivity } from "./arrival-activity";
import { describeChange, summarizeDeckChange } from "./deck-diff";
import { getSupabaseServer } from "@/lib/supabase-server";

// The new full-bleed "floating" viewer ships ON by default. FLOATING_VIEWER_DEFAULT
// is a server-side kill switch: set it to "0", "false", or "off" (in Vercel's env
// settings) to roll the default back to the classic viewer with no code change.
// Unset — or any other value — keeps the new viewer on. A ?view=classic /
// ?view=floating URL param always overrides this default per-request.
function floatingViewerDefault(): boolean {
  const raw = (process.env.FLOATING_VIEWER_DEFAULT ?? "").trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

// Design-partner allowlist for the read-only conversation feed (P1.2). Reuses
// Stage F's "env flag + ?view= escape hatch" pattern, but as a per-account
// allowlist (a global default would put EVERYONE on the feed; the brief wants
// the feed default-on for partners only, deck for everyone else). FEED_PARTNER_EMAILS
// is a comma-separated list of emails; a signed-in viewer whose email is on it
// LANDS on the feed by default. The wildcard "*" means EVERY signed-in viewer
// lands on the feed (anonymous link-holders still get the deck). ?view=feed /
// ?view=deck always override per-URL.
// A true per-account/admin toggle rides with P2 workspaces/profiles.
function feedPartnerEmails(): string[] {
  return (process.env.FEED_PARTNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export default async function ViewerPage({
  searchParams,
}: {
  searchParams: Promise<{
    slides?: string;
    id?: string;
    source?: string;
    v?: string;
    view?: string;
    slide?: string;
  }>;
}) {
  const { slides, id, source: sourceParam, v, view, slide } = await searchParams;
  // "Open slide N" deep-link from the feed: a 0-based real-slide index the deck
  // viewer should open on. Ignored by the feed/classic paths.
  const slideParam = slide ? parseInt(slide, 10) : NaN;
  const initialSlideIndex =
    Number.isFinite(slideParam) && slideParam >= 0 ? slideParam : null;
  const isCaptureSource = sourceParam === "capture";
  // Which viewer to render. The new full-bleed "floating" viewer is now the
  // DEFAULT; the classic SlideViewer is the fallback. The URL always wins over
  // the env default, so there's an escape hatch either way:
  //   ?view=floating → force the new viewer
  //   ?view=classic  → force the old viewer (safety net if the new one misbehaves)
  // With no ?view param we fall back to FLOATING_VIEWER_DEFAULT (a kill switch —
  // see floatingViewerDefault above). (`view` is a separate param from `v`, the
  // version selector — they don't collide.)
  const useFloatingViewer =
    view === "floating"
      ? true
      : view === "classic"
        ? false
        : floatingViewerDefault();

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
  // Raw version rows (not just the nav items) — the feed turns these into "Deck
  // vN shared · N slides" events. Hoisted out of the stored-deck block below so
  // the feed branch can read them at render time.
  let allVersionRows: DeckVersionRow[] = [];
  let isOwner = false;
  // The deck owner's user id (decks.user_id), captured from the metadata load so
  // the floating viewer's "huddle" can mark who the owner is without re-querying.
  let deckOwnerId: string | null = null;
  // The viewer's PREVIOUS last_viewed_at (read before this visit records a new
  // one). Drives the floating viewer's "comments since you were here" banner.
  let priorLastViewedAt: string | null = null;
  // Orphan deck = captured with no signed-in user, so it has no owner yet and
  // nobody (signed-in or not) can comment/stub/flag until the creator claims
  // it. Drives the P0.4 "claim to enable collaboration" nudge. Set after the
  // claim logic below so a just-claimed capturer is correctly excluded.
  let isOrphanDeck = false;

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
    allVersionRows = versions;
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

    // Orphan = the deck exists but has no owner (captured with no session).
    // After a successful claim above, isOwner is true, so the just-claimed
    // capturer is excluded; a recipient or anonymous viewer of an unclaimed
    // deck gets isOrphanDeck = true and sees the nudge instead of a comment box
    // that would silently fail at the database (no owner → not accessible).
    isOrphanDeck = !!deck && deck.user_id === null && !isOwner;
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

  // ── Landing decision: the conversation FEED vs the DECK (P1.2) ────────────
  // The feed is an alternative LANDING surface for a stored deck, default-on for
  // design partners. URL always wins (the ?view= escape hatch, like ?view=classic):
  //   ?view=feed                 → feed
  //   ?view=deck/classic/floating → deck (the deck-flavor choice stays useFloatingViewer)
  //   no ?view                    → feed iff a signed-in partner, else deck
  // Only stored decks (real id) can have a feed; sample/param decks always deck.
  // A signed-in viewer lands on the feed if their email is on the allowlist, OR
  // if the allowlist contains the wildcard "*" (= every signed-in viewer → feed).
  // Anonymous link-holders never match (no email) → always the deck.
  const partners = feedPartnerEmails();
  const isFeedPartner = !!(
    currentUserEmail &&
    (partners.includes("*") ||
      partners.includes(currentUserEmail.toLowerCase()))
  );
  const showFeed =
    source === "stored" &&
    !!id &&
    (view === "feed" ||
      (view !== "deck" &&
        view !== "classic" &&
        view !== "floating" &&
        isFeedPartner));

  // "In this huddle" people cluster — floating viewer only. Identities (emails)
  // are computed server-side and gated by the SAME rule that redacts stub/flag
  // emails above (canSeeCollaboratorEmails === signed in): an anonymous
  // link-holder is never sent any participant. We also only do the work for the
  // floating viewer + stored decks, so the current viewer's behaviour and
  // round-trips are completely unchanged.
  let participants: DeckParticipant[] = [];
  // "N reviewing" count for the anonymous guest chip — a COUNT ONLY, never
  // identities. Computed for every floating-viewer stored-deck view; the full
  // participant rows (with emails) are still gated to signed-in viewers below.
  let reviewingCount = 0;
  if ((useFloatingViewer || showFeed) && source === "stored" && id) {
    const loaded = await getDeckParticipants(id, deckOwnerId);
    reviewingCount = loaded.rows.length;
    if (canSeeCollaboratorEmails) participants = loaded.rows;
  }

  // ── Feed data (feed branch only) ─────────────────────────────────────────
  // The feed is one chronological stream across the whole deck history (not
  // scoped to a single version), and it shows RESOLVED stubs/flags struck-out
  // ("✓ Addressed in vN"), so it loads its OWN stubs/flags WITH resolved items
  // (the deck viewer keeps its open-only `viewerStubs`/`viewerFlags`). It also
  // loads each version's stored HTML for the per-version thumbnail strips.
  // All gated to the feed branch so the deck path's round-trips are untouched.
  let feedComments: CommentRow[] = [];
  let feedStubs: StubRow[] = [];
  let feedFlags: FlagRow[] = [];
  let versionsHtml: Record<number, string> = {};
  if (showFeed && source === "stored" && id) {
    const [commentsLoad, stubsLoad, flagsLoad] = await Promise.all([
      getAllCommentsForDeck(id, currentUserId),
      getStubsForDeck(id, { includeResolved: true }),
      getFlagsForDeck(id, { includeResolved: true }),
    ]);
    feedComments = commentsLoad.rows;
    feedStubs = redactStubEmails(stubsLoad.rows); // same anon redaction as the deck
    feedFlags = redactFlagEmails(flagsLoad.rows);

    // Per-version HTML for the spine thumbnail strips. Cap to the most recent
    // VERSION_HTML_CAP versions + v1 if a deck has a very large history, so the
    // page payload stays bounded; log what's dropped.
    const VERSION_HTML_CAP = 20;
    let toLoad = allVersionRows;
    if (allVersionRows.length > VERSION_HTML_CAP) {
      const recent = [...allVersionRows]
        .sort((a, b) => b.version - a.version)
        .slice(0, VERSION_HTML_CAP - 1);
      const v1 = allVersionRows.find((v) => v.version === 1);
      toLoad = v1 ? [...recent, v1] : recent;
      console.warn(
        `[viewer] feed thumbnail strips: deck ${id} has ${allVersionRows.length} ` +
          `versions; loading HTML for ${toLoad.length} (recent + v1), skipping the rest.`,
      );
    }
    const htmlEntries = await Promise.all(
      toLoad.map(
        async (v) =>
          [v.version, (await getDeckVersionHtml(id, v.version)) ?? ""] as const,
      ),
    );
    versionsHtml = Object.fromEntries(htmlEntries.filter(([, h]) => h));
  }

  // Arrival activity — "N comments since you were here". Computed from data
  // already loaded (the PRE-update last_viewed_at), with no extra query. Same
  // signed-in gate as participants: anonymous viewers have no comments and no
  // prior view, so they never get one. The feed draws on ALL comments; the deck
  // view on the current-version comments. Returns null for first-time viewers
  // and when nothing is new.
  let arrivalActivity: ArrivalActivity | null = null;
  if (
    (useFloatingViewer || showFeed) &&
    source === "stored" &&
    id &&
    canSeeCollaboratorEmails
  ) {
    arrivalActivity = computeArrivalActivity({
      comments: showFeed ? feedComments : initialComments,
      lastViewedAt: priorLastViewedAt,
      currentUserId,
    });
  }

  // The read-only conversation FEED (P1.2) — an alternative landing surface for
  // a stored deck, default-on for design partners. It composes the same
  // server-loaded collaboration data (now spanning all versions for comments)
  // into one chronological stream and demotes the deck to a side "peek". Falls
  // through to the deck viewer below for everyone else / ?view=deck.
  if (showFeed && id) {
    return (
      <main className="flex-1 flex min-h-0 overflow-hidden">
        <DeckFeed
          rawHtml={html}
          deckId={id}
          deckTitle={deckTitle}
          currentVersion={currentVersion}
          versions={allVersionRows}
          currentUserId={currentUserId}
          currentUserEmail={currentUserEmail}
          isOwner={isOwner}
          deckOwnerId={deckOwnerId}
          isPartner={isFeedPartner}
          // All-version comments — signed-in viewers only ([] for anonymous, so
          // no comment authors ever reach an anonymous viewer).
          comments={feedComments}
          // Requested slides + removal flags INCLUDING resolved ones (shown
          // struck "✓ Addressed in vN"); email-redacted for anonymous viewers.
          stubs={feedStubs}
          flags={feedFlags}
          // Each version's stored HTML, for the per-version thumbnail strips.
          versionsHtml={versionsHtml}
          participants={participants}
          reviewingCount={reviewingCount}
          arrivalActivity={arrivalActivity}
          loginHref={loginHref}
        />
      </main>
    );
  }

  // Gated new viewer. Renders the SAME server-prepared deck HTML full-bleed,
  // with floating control clusters over it (Phase 1). All the data-fetching and
  // role-gating above is shared and untouched; we only swap the presentation.
  // When the flag is off we fall through to the existing viewer unchanged.
  if (useFloatingViewer) {
    return (
      <main className="flex-1 flex min-h-0 overflow-hidden">
        <FloatingViewer
          // Remount on version switch (and after a live "Load vN" refresh) so
          // comments/flags/stubs re-seed from the server's per-version data —
          // mirrors the classic viewer's key.
          key={`${viewerDeckId ?? "none"}:v${viewingVersion}`}
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
          // "N reviewing" count for the anonymous guest chip (count only — no
          // identities ever reach an anonymous viewer).
          reviewingCount={reviewingCount}
          // "N comments since you were here" banner data — only for returning
          // signed-in viewers with new comments; null otherwise (no banner).
          arrivalActivity={arrivalActivity}
          // Requested slides shown in the strip + navigation for ALL viewers —
          // email-redacted for anonymous viewers, same as the current viewer.
          initialStubs={viewerStubs}
          // Removal flags — seed for the flag-for-removal UI AND the owner's
          // "Send to AI" prompt. Same redaction as the classic viewer:
          // `flagged_by` emails are nulled for anonymous viewers (viewerFlags),
          // and flags are hidden on historical views.
          initialFlags={viewerFlags}
          // Orphan deck → show a "ask the creator to claim it" nudge instead of
          // a comment/flag composer that would silently fail at the DB.
          isOrphanDeck={isOrphanDeck}
          loginHref={loginHref}
          // Analytics segmentation — splits the feed-vs-deck landing comparison
          // by design partner. Presentation is identical regardless.
          isPartner={isFeedPartner}
          // "Open slide N" deep-link from the feed peek.
          initialSlideIndex={initialSlideIndex}
          // Deck owner id → the Huddlers cluster's <Avatar> (single owner rule).
          deckOwnerId={deckOwnerId}
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
        isOrphanDeck={isOrphanDeck}
        loginHref={loginHref}
      />
    </main>
  );
}
