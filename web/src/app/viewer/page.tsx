import SlideViewer from "./SlideViewer";
import ShareBar from "./ShareBar";
import SignInBanner from "./SignInBanner";
import { SAMPLE_SLIDES_HTML } from "@/lib/sample-slides";
import {
  claimOrphanDeck,
  getCommentsForDeck,
  getDeckMeta,
  getStoredSlides,
  trackSharedDeck,
  type CommentRow,
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

  // Decide what extra UI / side effects apply for stored decks.
  // - signed-in creator on orphan deck → claim it
  // - signed-in recipient (not owner) → record in shared_decks
  // - signed-out → show the appropriate sign-in banner
  let bannerVariant: "creator" | "recipient" | null = null;
  let currentUserId: string | null = null;
  let currentUserEmail: string | null = null;
  let initialComments: CommentRow[] = [];

  if (source === "stored" && id) {
    const supabase = await getSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const deck = await getDeckMeta(id);
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
    } else if (!user) {
      bannerVariant = isCaptureSource ? "creator" : "recipient";
    }
  }

  return (
    <main className="flex-1 flex flex-col">
      {bannerVariant && id && (
        <SignInBanner variant={bannerVariant} deckId={id} />
      )}
      {source === "stored" && <ShareBar />}
      {source === "sample" && (
        <div className="px-8 py-2 text-xs text-muted border-b border-border">
          Viewing sample deck
        </div>
      )}
      <SlideViewer
        rawHtml={html}
        deckId={source === "stored" ? id ?? null : null}
        initialComments={initialComments}
        currentUserId={currentUserId}
        currentUserEmail={currentUserEmail}
      />
    </main>
  );
}
