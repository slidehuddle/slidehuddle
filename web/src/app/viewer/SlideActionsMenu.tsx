"use client";

// The slide-scope "+" (Slice C, 2026-07-05 — design-system §2.5 "position
// answers scope"): actions that act on THIS slide live ON the slide, not in
// the global chrome. One purple "+" button in the slide's bottom-right corner
// (where the old "…" flag control sat; same hover-reveal) opens a small menu
// labelled with its scope — "THIS SLIDE": Add a comment · Flag for removal ·
// Request a slide after this. Each item routes to the EXISTING write path —
// the comments panel/composer, the shared FlagPanel, the shared
// InsertStubForm — no new write features. The classic viewer is untouched (it
// keeps SlideFlagControl's "…").

import { useRef, useState } from "react";
import type { FlagRow } from "@/lib/slide-store";
import PortalPopover from "@/components/PortalPopover";
import { FlagPanel } from "./SlideFlagControl";
import InsertStubForm from "./InsertStubForm";

type View = "menu" | "flag" | "request";

export default function SlideActionsMenu({
  slideNumber,
  flag,
  canFlag,
  canInsert,
  currentUserId,
  loginHref,
  onAddComment,
  onFlag,
  onUnflag,
  onInsertAfter,
}: {
  /** 1-based — names the scope ("Request a slide after this"). */
  slideNumber: number;
  flag: FlagRow | null;
  canFlag: boolean;
  canInsert: boolean;
  currentUserId: string | null;
  loginHref: string;
  /** Opens the comments panel (the existing composer — C2). */
  onAddComment: () => void;
  onFlag: (reason: string) => Promise<void>;
  onUnflag: (flagId: string) => Promise<void>;
  /** Inserts a requested slide AFTER this one (the existing stub path — D3). */
  onInsertAfter: (fields: {
    title: string;
    subtitle: string;
    body: string;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const btnRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    setView("menu");
  };

  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-foreground transition-colors hover:bg-[#f4f3fc]";

  return (
    <div className="absolute bottom-3 right-3 z-20">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setView("menu");
        }}
        aria-label={`This slide — add a comment, flag for removal, or request a slide after it`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="This slide"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4A3FB5] text-white opacity-0 shadow-md group-hover/stage:opacity-100 focus:opacity-100 hover:bg-[#3f35a3] transition-opacity"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <PortalPopover
        anchorRef={btnRef}
        open={open}
        onClose={close}
        width={view === "menu" ? 232 : 300}
        placement="bottom-end"
      >
        {view === "menu" ? (
          <div
            role="menu"
            aria-label={`This slide (slide ${slideNumber})`}
            className="rounded-xl border border-border bg-white p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.15)]"
          >
            {/* The scope label — the whole point of the menu (§2.5 rule 9). */}
            <p className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted">
              This slide
            </p>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                onAddComment();
              }}
              className={item}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Add a comment
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => setView("flag")}
              className={item}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A3412" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              {flag ? "Flagged for removal…" : "Flag for removal"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => setView("request")}
              className={item}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4A3FB5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              Request a slide after this
            </button>
          </div>
        ) : view === "flag" ? (
          <div
            className="rounded-xl border border-border bg-white p-3 shadow-[0_12px_40px_rgba(0,0,0,0.15)]"
            role="dialog"
            aria-label="Flag slide for removal"
          >
            <FlagPanel
              flag={flag}
              canFlag={canFlag}
              currentUserId={currentUserId}
              loginHref={loginHref}
              onFlag={onFlag}
              onUnflag={onUnflag}
              onDone={close}
            />
          </div>
        ) : (
          <InsertStubForm
            canInsert={canInsert}
            loginHref={loginHref}
            onSubmit={async (fields) => {
              await onInsertAfter(fields);
              close();
            }}
            onClose={close}
          />
        )}
      </PortalPopover>
    </div>
  );
}
