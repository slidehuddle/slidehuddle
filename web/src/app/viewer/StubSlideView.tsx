"use client";

import { useRef, useState } from "react";
import type { StubRow } from "@/lib/slide-store";
import PortalPopover from "@/components/PortalPopover";

// Display for a requested ("stub") slide — a white card with a dashed border
// and the request details, shown in place of the sandboxed iframe when the
// active item is a stub. Left-justified, vertically centred, capped width.

const DELETE_RED = "#791F1F"; // menu action text
const CONFIRM_RED = "#B42318"; // confirm button

function displayName(email: string | null): string {
  if (!email) return "a teammate";
  const local = email.split("@")[0];
  return local || email;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
      {children}
    </span>
  );
}

// The "…" menu next to the "Requested by" badge. Shown only to the requester or
// the deck owner. Opens a one-item menu ("Delete this request") that swaps to a
// confirmation card. Both states render inside a portal so they sit above the
// slide stage (same pattern as the flag menu).
function StubDeleteMenu({
  onDelete,
}: {
  onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    setConfirming(false);
  }

  async function handleConfirm() {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete();
      // On success this stub disappears and the component unmounts; closing
      // here keeps things tidy if anything keeps it mounted.
      close();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Requested slide options"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-black/[0.06] hover:text-foreground transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      <PortalPopover
        anchorRef={btnRef}
        open={open}
        onClose={close}
        width={confirming ? 300 : 220}
        placement="bottom-center"
      >
        {confirming ? (
          <div
            className="rounded-xl border border-border bg-white shadow-[0_12px_40px_rgba(0,0,0,0.15)] p-4"
            role="dialog"
            aria-label="Delete this requested slide?"
          >
            <h3 className="text-sm font-semibold text-foreground">
              Delete this requested slide?
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              This removes the request from the deck. It can&apos;t be undone, but
              anyone can request a new slide here again.
            </p>
            <div className="mt-3.5 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={deleting}
                className="inline-flex items-center rounded-lg border border-border bg-white text-sm font-semibold text-foreground px-3 py-1.5 hover:bg-black/[0.04] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={deleting}
                className="inline-flex items-center rounded-lg text-white text-sm font-semibold px-3 py-1.5 transition-colors disabled:opacity-50"
                style={{ backgroundColor: CONFIRM_RED }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="rounded-xl border border-border bg-white shadow-[0_12px_40px_rgba(0,0,0,0.15)] p-1.5"
            role="menu"
            aria-label="Requested slide options"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => setConfirming(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold hover:bg-black/[0.04] transition-colors"
              style={{ color: DELETE_RED }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              Delete this request
            </button>
          </div>
        )}
      </PortalPopover>
    </>
  );
}

export default function StubSlideView({
  stub,
  currentUserId,
  isOwner,
  onDelete,
}: {
  stub: StubRow;
  currentUserId: string | null;
  isOwner: boolean;
  onDelete: (stubId: string) => Promise<void>;
}) {
  // Only the person who requested the stub or the deck owner may delete it.
  const canDelete =
    isOwner || (!!currentUserId && stub.requested_by === currentUserId);

  // Fills the card it's placed in — the parent sizes that card to match the
  // imported slides (and resizes it when the comments panel opens), so a
  // requested slide reads at the same size, position and aspect ratio.
  return (
    <div
      className="w-full h-full bg-white rounded-xl flex items-start overflow-hidden"
      style={{ border: "2px dashed #c9c6e6" }}
    >
      {/* Content is TOP-anchored (not centred) so the "Requested by" pill sits
          at the same height on every requested slide regardless of how much
          follows it; whatever the user adds flows beneath. The pt is a % of
          card width — which tracks card height too since the aspect ratio is
          fixed — so the anchor stays proportional as the card resizes. Uses
          most of the card width and scrolls if a long request overflows. */}
      <div className="w-full max-h-full overflow-auto px-[6%] pt-[8%] pb-8">
        <div className="flex flex-col gap-5 w-full max-w-[920px]">
          <div className="flex items-center gap-1.5 self-start">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: "#E1F5EE", color: "#085041" }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Requested by {displayName(stub.requested_by_email)}
            </span>
            {canDelete && (
              <StubDeleteMenu onDelete={() => onDelete(stub.id)} />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>Title</FieldLabel>
            <span className="text-[22px] font-medium text-foreground leading-snug">
              {stub.title || "Untitled slide"}
            </span>
          </div>

          {stub.subtitle && (
            <div className="flex flex-col gap-1">
              <FieldLabel>Subtitle</FieldLabel>
              <span className="text-[16px] text-muted leading-snug">
                {stub.subtitle}
              </span>
            </div>
          )}

          {stub.body && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel>What should this slide cover</FieldLabel>
              <p className="w-full text-[14px] text-foreground leading-relaxed rounded-lg bg-black/[0.04] px-4 py-3.5 whitespace-pre-wrap">
                {stub.body}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
