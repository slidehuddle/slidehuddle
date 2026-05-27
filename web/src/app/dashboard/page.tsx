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
    .select("id, title, created_at, slide_count, version")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[/dashboard] decks query failed:", error);
  }

  const rows: DeckRow[] = decks ?? [];

  return (
    <main className="flex-1 flex flex-col">
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
              Go to Claude.ai and create a presentation, then click{" "}
              <span className="font-semibold text-foreground">
                Open in SlideHuddle
              </span>
              .
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((deck) => {
              const slideCount = deck.slide_count;
              const version = deck.version ?? 1;
              const metaParts: string[] = [formatDate(deck.created_at)];
              if (slideCount != null) {
                metaParts.push(
                  `${slideCount} slide${slideCount === 1 ? "" : "s"}`,
                );
              }
              if (version > 1) metaParts.push(`v${version}`);

              return (
                <li key={deck.id}>
                  <Link
                    href={`/viewer?id=${deck.id}`}
                    className="group flex flex-col gap-3 h-full rounded-2xl border border-border p-5 hover:border-brand hover:bg-brand/[0.03] transition-colors"
                  >
                    <span className="inline-block h-1.5 w-10 rounded-full bg-brand/30 group-hover:bg-brand transition-colors" />
                    <span className="font-semibold text-foreground line-clamp-2 min-h-[3rem] leading-tight">
                      {deck.title || "Untitled deck"}
                    </span>
                    <span className="text-sm text-muted mt-auto">
                      {metaParts.join(" · ")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
