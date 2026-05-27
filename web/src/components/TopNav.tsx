import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";

export default async function TopNav() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const homeHref = user ? "/dashboard" : "/";

  return (
    <header className="flex items-center justify-between px-8 py-4 border-b border-border">
      <Link
        href={homeHref}
        className="flex items-center gap-2 text-brand font-semibold"
      >
        <span className="inline-block h-6 w-6 rounded-md bg-brand" />
        SlideHuddle
      </Link>

      {user ? (
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="text-sm font-semibold text-foreground hover:text-brand transition-colors"
          >
            My decks
          </Link>
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
      ) : (
        <Link
          href="/login"
          className="text-sm font-semibold text-brand hover:text-brand-hover"
        >
          Sign in
        </Link>
      )}
    </header>
  );
}
