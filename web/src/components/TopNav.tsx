import Link from "next/link";
import type { ReactNode } from "react";
import { getSupabaseServer } from "@/lib/supabase-server";
import AvatarMenu from "./AvatarMenu";

// The single, shared top navigation bar used on every page (dashboard, home,
// login, and the viewer). Change it here and it updates everywhere.
//
// Left: the SlideHuddle logo (→ dashboard when signed in, home otherwise).
// Right: the user's avatar with a dropdown (My decks · Sign out), or a single
// "Sign in" link when signed out.
//
// It fetches the signed-in user itself so it can be dropped into any layout
// or page with no wiring. The optional `loginHref` lets a page send the user
// back to where they were after signing in (the viewer uses this to carry a
// `?next=` back to the deck).
export default async function TopNav({
  loginHref = "/login",
  centerSlot,
}: {
  loginHref?: string;
  /** Optional middle content (the viewer puts the deck title + version chip
   *  here). Rendered between the logo and the avatar/sign-in. */
  centerSlot?: ReactNode;
}) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? null;
  const homeHref = user ? "/dashboard" : "/";

  return (
    <header className="flex items-center justify-between gap-4 px-6 h-14 shrink-0 border-b border-border bg-white">
      <Link
        href={homeHref}
        className="flex items-center gap-2 text-brand font-semibold"
        aria-label="SlideHuddle — go to your dashboard"
      >
        <span className="inline-block h-6 w-6 rounded-md bg-brand" />
        SlideHuddle
      </Link>

      {centerSlot && (
        <div className="flex-1 flex items-center justify-center min-w-0">
          {centerSlot}
        </div>
      )}

      {email ? (
        <AvatarMenu email={email} />
      ) : (
        <Link
          href={loginHref}
          className="text-sm font-semibold text-brand hover:text-brand-hover"
        >
          Sign in
        </Link>
      )}
    </header>
  );
}
