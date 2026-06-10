"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import PortalPopover from "./PortalPopover";

// The signed-in user's avatar (first initial) with a click-to-open dropdown
// containing their email and a Sign out action. Sign out posts to the
// existing /auth/signout route handler, which clears the session cookies and
// redirects to /login. Rendered via PortalPopover so the menu can't be
// clipped by the nav.
export default function AvatarMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const letter = (email?.trim()?.[0] ?? "?").toUpperCase();

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
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold select-none cursor-pointer hover:ring-2 hover:ring-brand/20 transition-shadow"
        style={{ backgroundColor: "#EEEDFE", color: "#3C3489" }}
      >
        {letter}
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
