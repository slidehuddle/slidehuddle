import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  getDeckCommentCountsForUser,
  getDeckShareCounts,
  getOwnerEmails,
} from "@/lib/slide-store";
import DashboardDecks, { type DeckCardData } from "./DashboardDecks";

type DeckRow = {
  id: string;
  title: string | null;
  created_at: string;
  slide_count: number | null;
  version: number | null;
  user_id: string | null;
};

type SharedDeckRow = {
  created_at: string;
  deck: DeckRow | null;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function deckMeta(deck: DeckRow, dateOverride?: string): string {
  // The version is shown as a pill on the card (see DeckCard), so it's not
  // repeated here. slide_count reflects the latest version (it's rewritten on
  // every update), so this line already describes the current deck.
  const parts: string[] = [formatDate(dateOverride ?? deck.created_at)];
  if (deck.slide_count != null) {
    parts.push(
      `${deck.slide_count} slide${deck.slide_count === 1 ? "" : "s"}`,
    );
  }
  return parts.join(" · ");
}

export default async function DashboardPage() {
  const supabase = await getSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Two parallel queries. RLS handles user-scoping; the explicit filters
  // are defence-in-depth and make the intent obvious.
  const [ownDecksResult, sharedDecksResult] = await Promise.all([
    supabase
      .from("decks")
      .select("id, title, created_at, slide_count, version, user_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("shared_decks")
      .select(
        "created_at, deck:decks(id, title, created_at, slide_count, version, user_id)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (ownDecksResult.error) {
    console.error(
      "[/dashboard] own decks query failed:",
      ownDecksResult.error,
    );
  }
  if (sharedDecksResult.error) {
    console.error(
      "[/dashboard] shared decks query failed:",
      sharedDecksResult.error,
    );
  }

  const ownDecks: DeckRow[] = ownDecksResult.data ?? [];
  const sharedRows: SharedDeckRow[] = (
    (sharedDecksResult.data ?? []) as unknown as SharedDeckRow[]
  ).filter((r) => r.deck != null);

  // Fetch the extras shown on cards: share counts across both sections,
  // plus owner emails for the "Shared with me" section. Done with the
  // admin client because RLS would otherwise hide other recipients' rows
  // and block reading auth.users.
  const ownerIdsForShared = sharedRows
    .map((r) => r.deck?.user_id)
    .filter((id): id is string => !!id);
  const allDeckIds = [
    ...ownDecks.map((d) => d.id),
    ...sharedRows.map((r) => r.deck!.id),
  ];
  const [shareCountByDeck, emailByOwnerId, commentCountsResult] =
    await Promise.all([
      getDeckShareCounts(allDeckIds),
      getOwnerEmails(ownerIdsForShared),
      getDeckCommentCountsForUser(allDeckIds, user.id),
    ]);
  const commentCountsByDeck = commentCountsResult.counts;
  // A real failure loading comment counts — show a notice rather than letting
  // every deck silently read as "0 comments".
  const commentCountsFailed = commentCountsResult.failed;

  // Shape serializable card data for the client component (which owns the
  // hover-delete / confirm / undo interactions).
  const ownedCards: DeckCardData[] = ownDecks.map((deck) => {
    const cc = commentCountsByDeck[deck.id];
    return {
      id: deck.id,
      title: deck.title,
      meta: deckMeta(deck),
      role: "owner",
      shareCount: shareCountByDeck[deck.id] ?? 0,
      commentTotal: cc?.total ?? 0,
      commentUnread: cc?.unread ?? 0,
      version: deck.version ?? 1,
    };
  });

  const sharedCards: DeckCardData[] = sharedRows.map((row) => {
    const deck = row.deck!;
    const cc = commentCountsByDeck[deck.id];
    return {
      id: deck.id,
      title: deck.title,
      // Sort/display by when *they* received the share, not when the deck was
      // originally created.
      meta: deckMeta(deck, row.created_at),
      role: "shared",
      ownerEmail: deck.user_id ? emailByOwnerId[deck.user_id] : undefined,
      shareCount: shareCountByDeck[deck.id] ?? 0,
      commentTotal: cc?.total ?? 0,
      commentUnread: cc?.unread ?? 0,
      version: deck.version ?? 1,
    };
  });

  return (
    <main className="flex-1 flex flex-col">
      <section className="flex-1 px-8 py-10 max-w-5xl w-full mx-auto flex flex-col gap-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Your decks
          </h1>
          <p className="text-muted">
            Decks you&apos;ve captured from Claude with the SlideHuddle extension,
            plus decks others have shared with you.
          </p>
          {commentCountsFailed && (
            <div
              role="alert"
              className="mt-1 inline-flex items-center gap-2 self-start rounded-lg px-3 py-1.5 text-[13px] font-medium"
              style={{ backgroundColor: "#FEF3F2", color: "#791F1F" }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Couldn&apos;t load comment activity — counts may be missing. Try
              refreshing.
            </div>
          )}
        </div>

        <DashboardDecks owned={ownedCards} shared={sharedCards} />
      </section>
    </main>
  );
}
