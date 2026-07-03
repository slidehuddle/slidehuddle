"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import PortalPopover from "./PortalPopover";

// The signed-in user's ACCOUNT chip with a click-to-open dropdown (email, My
// huddles, Sign out). Sign out posts to the existing /auth/signout route
// handler, which clears the session cookies and redirects to /login. Rendered
// via PortalPopover so the menu can't be clipped by the nav.
//
// DELIBERATELY DISTINCT from the huddler avatars (founder call 2026-07-03):
// this is not "you as a person in the huddle" (that's the shared <Avatar> in
// the feed/stack) — it's YOUR ACCOUNT: a purple person icon + a green
// "signed in" dot, the same everywhere (viewer, feed, dashboard), your door to
// your other huddles. For your own avatar "signed in" and "online" are the
// same fact, so the dot reuses the presence green. It also keeps every edge
// inside the button's bounds, so the collapsible top-right cluster (which
// clips horizontally) can never slice it — the bug the shared Avatar's outer
// owner-ring hit there.
export default function AvatarMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${email} — signed in`}
        title={`${email} — signed in`}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-full select-none cursor-pointer hover:ring-2 hover:ring-brand/20 transition-shadow"
        style={{ backgroundColor: "#EEEDFE", color: "#3C3489" }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        {/* Green "signed in" dot — kept fully INSIDE the button bounds so
            clipping containers can't cut it. */}
        <span
          aria-hidden="true"
          className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full ring-2 ring-white"
          style={{ backgroundColor: "#3FA344" }}
        />
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
