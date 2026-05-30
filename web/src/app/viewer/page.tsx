import SlideViewer from "./SlideViewer";
import TopNav from "@/components/TopNav";
import { SAMPLE_SLIDES_HTML } from "@/lib/sample-slides";
import {
  claimOrphanDeck,
  getCommentsForDeck,
  getDeckMeta,
  getFlagsForDeck,
  getStoredSlides,
  getStubsForDeck,
  recordDeckView,
  trackSharedDeck,
  type CommentRow,
  type FlagRow,
  type StubRow,
} from "@/lib/slide-store";
import { getSupabaseServer } from "@/lib/supabase-server";

export default async function ViewerPage({
  searchParams,
}: {
  searchParams: Promise<{
    slides?: string;
    id?: string;
    source?: string;
  }>;
}) {
  const { slides, id, source: sourceParam } = await searchParams;
  const isCaptureSource = sourceParam === "capture";

  let html: string;
  let source: "param" | "stored" | "sample";

  if (slides) {
    html = slides;
    source = "param";
  } else if (id) {
    html = (await getStoredSlides(id)) ?? "";
    source = "stored";
  } else {
    html = SAMPLE_SLIDES_HTML;
    source = "sample";
  }

  // Identify the signed-in user once, for every deck source — the viewer
  // nav shows their avatar regardless of whether the deck is stored, a
  // sample, or passed inline.
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Decide what side effects apply for stored decks.
  // - signed-in creator on orphan deck → claim it
  // - signed-in recipient (not owner) → record in shared_decks
  // Signed-out users get no page banner; the only sign-in entry point is the
  // nav "Sign in" link (and the in-popup "Sign in to…" prompts).
  let currentUserId: string | null = null;
  let currentUserEmail: string | null = user?.email ?? null;
  let initialComments: CommentRow[] = [];
  let initialStubs: StubRow[] = [];
  let initialFlags: FlagRow[] = [];

  if (source === "stored" && id) {
    // Stubs and flags are read with the service-role client so anonymous
    // link-viewers still see requested/flagged state in the strip. Load
    // them in parallel with the deck meta.
    const [deck, stubs, flags] = await Promise.all([
      getDeckMeta(id),
      getStubsForDeck(id),
      getFlagsForDeck(id),
    ]);
    initialStubs = stubs;
    initialFlags = flags;
    const isOwner = !!(user && deck && deck.user_id === user.id);

    if (user && deck) {
      if (isCaptureSource && deck.user_id === null) {
        await claimOrphanDeck(id, user.id);
      } else if (!isOwner && deck.user_id !== null) {
        // Only track a "share" when the deck actually has an owner. Orphan
        // decks (user_id NULL) belong to no one — nobody shared them — so
        // they shouldn't show up under "Shared with me".
        await trackSharedDeck(id, user.id);
      }
      currentUserId = user.id;
      currentUserEmail = user.email ?? null;
      // Load comments after any claim/track has settled, so the user has
      // access to the deck under the comments RLS.
      initialComments = await getCommentsForDeck(id, user.id);
      // Record this view so unread counts on the dashboard advance past
      // any comments they're seeing right now. Fire-and-forget; if it
      // fails the worst case is "unread" stays stale until next view.
      await recordDeckView(id, user.id);
    }
  }

  // Where a signed-out user returns to after using the nav's "Sign in"
  // link. Built on the server so SSR and client markup agree. Only the
  // deck id is worth preserving (inline `slides=` HTML would bloat the URL).
  // We keep `source=capture` so a creator who signs in here still lands back
  // in the capture flow and claims their orphan deck — the work the old
  // sign-in banner used to do, now folded into the single nav sign-in link.
  const viewerPath = id
    ? `/viewer?id=${id}${isCaptureSource ? "&source=capture" : ""}`
    : "/viewer";
  const loginHref = `/login?next=${encodeURIComponent(viewerPath)}`;

  return (
    <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <TopNav loginHref={loginHref} />
      {source === "sample" && (
        <div className="px-8 py-1.5 text-xs text-muted border-b border-border">
          Viewing sample deck
        </div>
      )}
      <SlideViewer
        rawHtml={html}
        deckId={source === "stored" ? id ?? null : null}
        initialComments={initialComments}
        initialStubs={initialStubs}
        initialFlags={initialFlags}
        currentUserId={currentUserId}
        currentUserEmail={currentUserEmail}
        loginHref={loginHref}
      />
    </main>
  );
}
