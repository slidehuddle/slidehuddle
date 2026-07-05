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
export default function AvatarMenu({
  email,
  viewerSettings = null,
}: {
  email: string;
  /** Viewer-only (Slice C, 2026-07-05): the floating viewer passes its
   *  "Pin toolbars" toggle so the setting lives in the account menu — the
   *  stray bottom gear is retired. Other surfaces (dashboard, feed top bar)
   *  omit it and see no settings section. */
  viewerSettings?: { pinned: boolean; onTogglePin: () => void } | null;
}) {
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
          {viewerSettings && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={viewerSettings.pinned}
              onClick={viewerSettings.onTogglePin}
              className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-black/[0.04]"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                style={
                  viewerSettings.pinned
                    ? {
                        backgroundColor: "#4A3FB5",
                        borderColor: "#4A3FB5",
                        color: "#ffffff",
                      }
                    : { borderColor: "#c9c8d3", color: "transparent" }
                }
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span className="leading-snug">
                <span className="block text-sm font-semibold text-[#1d1d1b]">
                  Pin toolbars
                </span>
                <span className="block text-xs text-muted">
                  Keep the floating bars from tucking away.
                </span>
              </span>
            </button>
          )}
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
