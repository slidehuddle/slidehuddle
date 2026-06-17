"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import PortalPopover from "./PortalPopover";
import Avatar from "@/app/viewer/Avatar";

// The signed-in user's avatar with a click-to-open dropdown containing their
// email and a Sign out action. Sign out posts to the existing /auth/signout
// route handler, which clears the session cookies and redirects to /login.
// Rendered via PortalPopover so the menu can't be clipped by the nav.
//
// In a DECK context (the viewer + feed) the caller passes the current user's
// `userId` and the deck's `ownerId`, so this avatar renders via the SHARED
// owner-aware <Avatar> — i.e. the owner's own avatar in the top-right matches
// exactly how they appear in the feed/cluster (filled purple if they own the
// deck, their person colour if not). Without those props (e.g. the global
// TopNav, where there's no deck) it falls back to the simple initial chip.
export default function AvatarMenu({
  email,
  userId,
  ownerId,
}: {
  email: string;
  userId?: string | null;
  ownerId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const letter = (email?.trim()?.[0] ?? "?").toUpperCase();
  // Owner-aware shared avatar only when we know the deck context.
  const useSharedAvatar = userId !== undefined;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${email}`}
        title={email}
        className={`inline-flex items-center justify-center rounded-full select-none cursor-pointer hover:ring-2 hover:ring-brand/20 transition-shadow ${
          useSharedAvatar ? "" : "h-8 w-8 text-sm font-semibold"
        }`}
        style={useSharedAvatar ? undefined : { backgroundColor: "#EEEDFE", color: "#3C3489" }}
      >
        {useSharedAvatar ? (
          <Avatar userId={userId ?? null} ownerId={ownerId ?? null} email={email} size={32} />
        ) : (
          letter
        )}
      </button>

      <PortalPopover
        anchorRef={btnRef}
        open={open}
        onClose={() => setOpen(false)}
        width={224}
        placement="bottom-end"
      >
        <div
          className="rounded-xl border border-border bg-white shadow-[0_12px_40px_rgba(0,0,0,0.15)] p-2"
          role="menu"
        >
          <div
            className="px-2 py-1.5 text-xs text-muted truncate border-b border-border mb-1"
            title={email}
          >
            {email}
          </div>
          <Link
            href="/dashboard"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-2 py-1.5 text-sm font-semibold text-foreground hover:bg-black/[0.04] transition-colors"
          >
            My huddles
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="w-full text-left rounded-lg px-2 py-1.5 text-sm font-semibold text-foreground hover:bg-black/[0.04] transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </PortalPopover>
    </>
  );
}
