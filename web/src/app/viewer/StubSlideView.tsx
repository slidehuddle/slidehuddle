"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StubRow } from "@/lib/slide-store";
import PortalPopover from "@/components/PortalPopover";
import StubFieldsForm from "./StubFieldsForm";

// Display for a requested ("stub") slide — a white card with a dashed border
// and the request details, shown in place of the sandboxed iframe when the
// active item is a stub. Left-justified, vertically centred, capped width.
//
// A requested slide is a shared, directly-editable draft: both the requester
// and the deck owner can edit its three fields (title / subtitle / content) via
// the same form used to create one. All three fields are always shown — empty
// ones read "Not set yet" — so it's clear there are three things to fill.

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

// The "…" menu next to the "Requested by" badge. Shown to the requester or the
// deck owner. Offers "Edit this request" and "Delete this request"; delete swaps
// to a confirmation card. Both states render inside a portal so they sit above
// the slide stage (same pattern as the flag menu).
function StubActionsMenu({
  onEdit,
  onDelete,
  placement = "inline",
}: {
  onEdit: () => void;
  onDelete: () => Promise<void>;
  /** "inline" (default, classic viewer) = a light "…" beside the badge;
   *  "bottom-right" (floating viewer) = the dark, hover-revealed circular "…"
   *  in the slide's bottom-right corner, matching the removal-flag control. */
  placement?: "inline" | "bottom-right";
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
        className={
          placement === "bottom-right"
            ? "flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-black/50 transition-opacity backdrop-blur-sm"
            : "flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-black/[0.06] hover:text-foreground transition-colors"
        }
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
        placement={placement === "bottom-right" ? "bottom-end" : "bottom-center"}
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
              onClick={() => {
                close();
                onEdit();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-foreground hover:bg-black/[0.04] transition-colors"
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
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
              Edit this request
            </button>
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

// Centred modal carrying the shared 3-field form. Rendered into a portal so it
// floats above the slide stage (which clips its overflow). Backdrop click and
// Escape both cancel.
function StubEditModal({
  stub,
  onSave,
  onClose,
}: {
  stub: StubRow;
  onSave: (fields: { title: string; subtitle: string; body: string }) => Promise<void>;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-white shadow-[0_20px_60px_rgba(0,0,0,0.25)] p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <StubFieldsForm
          heading="Edit requested slide"
          submitLabel="Save changes"
          submittingLabel="Saving…"
          initialTitle={stub.title ?? ""}
          initialSubtitle={stub.subtitle ?? ""}
          initialBody={stub.body ?? ""}
          onSubmit={onSave}
          onClose={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}

export default function StubSlideView({
  stub,
  currentUserId,
  isOwner,
  canCurate = false,
  onDelete,
  onDismiss,
  onEdit,
  actionsPlacement = "inline",
}: {
  stub: StubRow;
  currentUserId: string | null;
  isOwner: boolean;
  /** Deck owner on the current deck: reveals Dismiss/Edit curation controls. */
  canCurate?: boolean;
  onDelete: (stubId: string) => Promise<void>;
  onDismiss?: (stubId: string, dismissed: boolean) => Promise<void>;
  onEdit?: (
    stubId: string,
    fields: { title: string; subtitle: string; body: string },
  ) => Promise<void>;
  /** Where the edit/delete "…" sits. "inline" (default) = beside the "Requested
   *  by" badge (classic viewer); "bottom-right" = the floating viewer's
   *  hover-revealed corner control, matching the removal-flag "…". */
  actionsPlacement?: "inline" | "bottom-right";
}) {
  // The person who requested the stub or the deck owner may edit or delete it.
  const canEdit =
    isOwner || (!!currentUserId && stub.requested_by === currentUserId);
  const canDelete = canEdit;

  const [editing, setEditing] = useState(false);

  async function handleSave(fields: {
    title: string;
    subtitle: string;
    body: string;
  }) {
    await onEdit?.(stub.id, fields);
    setEditing(false);
  }

  const dim = stub.dismissed ? "line-through text-muted" : "text-foreground";

  // Fills the card it's placed in — the parent sizes that card to match the
  // imported slides (and resizes it when the comments panel opens), so a
  // requested slide reads at the same size, position and aspect ratio.
  return (
    <div
      className={`group relative w-full h-full bg-white rounded-xl flex items-start overflow-hidden transition-opacity ${stub.dismissed ? "opacity-60" : ""}`}
      style={{ border: "2px dashed #c9c6e6" }}
    >
      {/* Content is TOP-anchored (not centred) so the "Requested by" pill sits
          at the same height on every requested slide regardless of how much
          follows it; whatever the user adds flows beneath. */}
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
            {canDelete && actionsPlacement === "inline" && (
              <StubActionsMenu
                placement="inline"
                onEdit={() => setEditing(true)}
                onDelete={() => onDelete(stub.id)}
              />
            )}
          </div>

          {stub.dismissed && (
            <p className="text-xs text-muted self-start">
              Won&apos;t send to Claude
              {canCurate && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => onDismiss?.(stub.id, false)}
                    className="font-semibold text-foreground hover:underline"
                  >
                    Restore
                  </button>
                </>
              )}
            </p>
          )}

          {/* All three fields are always shown; empty ones read "Not set yet"
              so it's clear what can still be filled in. */}
          <div className="flex flex-col gap-1">
            <FieldLabel>Title</FieldLabel>
            {stub.title ? (
              <span className={`text-[22px] font-medium leading-snug ${dim}`}>
                {stub.title}
              </span>
            ) : (
              <span className="text-[13px] leading-snug text-muted/40 italic">
                Not set yet
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>Subtitle</FieldLabel>
            {stub.subtitle ? (
              <span className="text-[16px] text-muted leading-snug">
                {stub.subtitle}
              </span>
            ) : (
              <span className="text-[13px] leading-snug text-muted/40 italic">
                Not set yet
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <FieldLabel>What should this slide cover</FieldLabel>
            {stub.body ? (
              <p
                className={`w-full text-[14px] leading-relaxed whitespace-pre-wrap ${dim}`}
              >
                {stub.body}
              </p>
            ) : (
              <p className="text-[13px] leading-snug text-muted/40 italic">
                Not set yet
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Owner-only hover curation controls — top-right of the card. The card's
          content is left-anchored, so these don't overlap it. */}
      {canCurate && !stub.dismissed && (
        <div className="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit this requested slide"
            title="Edit this requested slide"
            className="pointer-events-auto flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-lg text-white shadow-md backdrop-blur-sm transition-transform hover:scale-105"
            style={{ backgroundColor: "rgba(40,40,38,0.7)" }}
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
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
            <span className="text-[8px] font-semibold leading-none">Edit</span>
          </button>
          <button
            type="button"
            onClick={() => onDismiss?.(stub.id, true)}
            aria-label="Dismiss — won't send to Claude"
            title="Dismiss — won't send to Claude"
            className="pointer-events-auto flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-lg text-white shadow-md backdrop-blur-sm transition-transform hover:scale-105"
            style={{ backgroundColor: "rgba(40,40,38,0.7)" }}
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
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z" />
              <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
            </svg>
            <span className="text-[8px] font-semibold leading-none">
              Dismiss
            </span>
          </button>
        </div>
      )}

      {/* Edit/delete "…" — bottom-right, matching the real-slide flag control's
          look and feel (floating viewer only; classic keeps the inline "…"
          beside the badge). Reveals on card hover via the root's `group`. */}
      {canDelete && actionsPlacement === "bottom-right" && (
        <div className="absolute bottom-3 right-3 z-20">
          <StubActionsMenu
            placement="bottom-right"
            onEdit={() => setEditing(true)}
            onDelete={() => onDelete(stub.id)}
          />
        </div>
      )}

      {editing && (
        <StubEditModal
          stub={stub}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
