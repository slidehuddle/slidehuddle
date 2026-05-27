import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase-server";

type DeckRow = {
  id: string;
  title: string | null;
  created_at: string;
  slide_count: number | null;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function DashboardPage() {
  const supabase = await getSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // RLS scopes this to the current user automatically — no need for
  // .eq("user_id", user.id) here. Belt-and-braces: we add it anyway.
  const { data: decks, error } = await supabase
    .from("decks")
    .select("id, title, created_at, slide_count")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[/dashboard] decks query failed:", error);
  }

  const rows: DeckRow[] = decks ?? [];

  return (
    <main className="flex-1 flex flex-col">
      <header className="flex items-center justify-between px-8 py-5 border-b border-border">
        <Link href="/" className="flex items-center gap-2 text-brand font-semibold">
          <span className="inline-block h-6 w-6 rounded-md bg-brand" />
          SlideHuddle
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted">{user.email}</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm font-semibold text-brand hover:text-brand-hover"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="flex-1 px-8 py-10 max-w-5xl w-full mx-auto flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Your decks
          </h1>
          <p className="text-muted">
            Decks you&apos;ve captured from Claude with the SlideHuddle extension.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-8 py-16 text-center flex flex-col items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">
              No decks yet
            </h2>
            <p className="text-muted max-w-md">
              Use the SlideHuddle Chrome extension on claude.ai to capture a
              slide deck. It&apos;ll show up here once you do.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((deck) => (
              <li key={deck.id}>
                <Link
                  href={`/viewer?id=${deck.id}`}
                  className="flex items-center justify-between rounded-xl border border-border px-5 py-4 hover:border-brand hover:bg-brand/[0.03] transition-colors"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-foreground">
                      {deck.title || "Untitled deck"}
                    </span>
                    <span className="text-sm text-muted">
                      {formatDate(deck.created_at)}
                      {deck.slide_count != null &&
                        ` · ${deck.slide_count} slide${deck.slide_count === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  <span className="text-sm text-brand font-semibold">
                    Open →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
