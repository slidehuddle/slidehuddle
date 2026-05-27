import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase-server";

type DeckRow = {
  id: string;
  title: string | null;
  created_at: string;
  slide_count: number | null;
  version: number | null;
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
  const parts: string[] = [formatDate(dateOverride ?? deck.created_at)];
  if (deck.slide_count != null) {
    parts.push(
      `${deck.slide_count} slide${deck.slide_count === 1 ? "" : "s"}`,
    );
  }
  const version = deck.version ?? 1;
  if (version > 1) parts.push(`v${version}`);
  return parts.join(" · ");
}

function DeckCard({
  deck,
  meta,
  accent,
}: {
  deck: DeckRow;
  meta: string;
  accent: "brand" | "muted";
}) {
  const accentBase = accent === "brand" ? "bg-brand/30" : "bg-muted/30";
  const accentHover =
    accent === "brand" ? "group-hover:bg-brand" : "group-hover:bg-muted";
  return (
    <li>
      <Link
        href={`/viewer?id=${deck.id}`}
        className="group flex flex-col gap-3 h-full rounded-2xl border border-border p-5 hover:border-brand hover:bg-brand/[0.03] transition-colors"
      >
        <span
          className={`inline-block h-1.5 w-10 rounded-full ${accentBase} ${accentHover} transition-colors`}
        />
        <span className="font-semibold text-foreground line-clamp-2 min-h-[3rem] leading-tight">
          {deck.title || "Untitled deck"}
        </span>
        <span className="text-sm text-muted mt-auto">{meta}</span>
      </Link>
    </li>
  );
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
      .select("id, title, created_at, slide_count, version")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("shared_decks")
      .select(
        "created_at, deck:decks(id, title, created_at, slide_count, version)",
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
  // Supabase types the embedded `deck` as an array when the relationship
  // can't be inferred as single-row; we know each shared_decks row points
  // to one deck, so we coerce. Filter out any null deck (defensive).
  const sharedRows: SharedDeckRow[] = (
    (sharedDecksResult.data ?? []) as unknown as SharedDeckRow[]
  ).filter((r) => r.deck != null);

  const bothEmpty = ownDecks.length === 0 && sharedRows.length === 0;

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
        </div>

        {bothEmpty ? (
          <div className="rounded-2xl border border-dashed border-border px-8 py-16 text-center flex flex-col items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">
              No decks yet
            </h2>
            <p className="text-muted max-w-md">
              Go to Claude.ai and create a presentation, then click{" "}
              <span className="font-semibold text-foreground">
                Open in SlideHuddle
              </span>
              .
            </p>
          </div>
        ) : (
          <>
            {ownDecks.length > 0 && (
              <section className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-foreground">
                  My decks
                </h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ownDecks.map((deck) => (
                    <DeckCard
                      key={deck.id}
                      deck={deck}
                      meta={deckMeta(deck)}
                      accent="brand"
                    />
                  ))}
                </ul>
              </section>
            )}

            {sharedRows.length > 0 && (
              <section className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-foreground">
                  Shared with me
                </h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sharedRows.map((row) => {
                    const deck = row.deck!;
                    return (
                      <DeckCard
                        key={deck.id}
                        deck={deck}
                        // Sort/display by when *they* received the share,
                        // not when the deck was originally created.
                        meta={deckMeta(deck, row.created_at)}
                        accent="muted"
                      />
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}
