"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  deleteOwnedDeckAction,
  removeSharedDeckAction,
} from "./actions";

// Serializable deck data prepared on the server (page.tsx). Display strings
// (meta) are precomputed there so this client component stays presentational.
export type DeckCardData = {
  id: string;
  title: string | null;
  meta: string;
  role: "owner" | "shared";
  /** Owner of the deck, shown on "Shared with me" cards. */
  ownerEmail?: string;
  /** How many people the deck is shared with (drives the owner-delete warning). */
  shareCount: number;
  commentTotal: number;
  commentUnread: number;
  version: number;
};

// How long the "Undo" window stays open before the delete is committed to the
// server. Gmail-style: the action is deferred, not reversed.
const UNDO_MS = 5000;

type Pending = { deck: DeckCardData };

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function DeckCard({
  deck,
  onRequestDelete,
}: {
  deck: DeckCardData;
  onRequestDelete: (deck: DeckCardData) => void;
}) {
  const accentBase = deck.role === "owner" ? "bg-brand/30" : "bg-muted/30";
  const accentHover =
    deck.role === "owner" ? "group-hover:bg-brand" : "group-hover:bg-muted";
  const hasVersions = deck.version > 1;

  return (
    <li>
      {/* The `group` on this wrapper drives the hover reveal of the delete
          button, which is a SIBLING of the Link (not nested — a button inside
          an anchor is invalid and would also trigger navigation). The Link also
          carries `group` for its own accent hover; both work since group-hover
          matches the nearest hovered ancestor `.group`. */}
      <div className="group relative h-full">
        {hasVersions && (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-2xl border border-border bg-white translate-x-[10px] translate-y-[10px]"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-2xl border border-border bg-white translate-x-[5px] translate-y-[5px]"
            />
          </>
        )}
        <Link
          href={`/viewer?id=${deck.id}`}
          className="group relative z-10 flex flex-col gap-3 h-full rounded-2xl border border-border bg-white p-5 hover:border-brand hover:bg-brand/[0.03] transition-colors"
        >
          {hasVersions && (
            // Version pill fades out on hover so it doesn't collide with the
            // delete button that fades in at the same corner.
            <span
              aria-label={`Latest version: v${deck.version}`}
              className="absolute top-4 right-4 inline-flex items-center rounded-full border border-border bg-white px-2 py-0.5 text-[11px] font-bold text-[#1D1D1B] shadow-sm transition-opacity group-hover:opacity-0"
            >
              v{deck.version}
            </span>
          )}
          <span
            className={`inline-block h-1.5 w-10 rounded-full ${accentBase} ${accentHover} transition-colors`}
          />
          <span className="font-semibold text-foreground line-clamp-2 min-h-[3rem] leading-tight">
            {deck.title || "Untitled deck"}
          </span>
          <div className="mt-auto flex flex-col gap-1">
            <span className="text-sm text-muted">{deck.meta}</span>
            {deck.ownerEmail && (
              <span className="text-xs text-muted">
                from{" "}
                <span className="text-foreground font-medium">
                  {deck.ownerEmail}
                </span>
              </span>
            )}
            {deck.shareCount > 0 && (
              <span className="text-xs text-muted">
                Shared with {deck.shareCount}{" "}
                {deck.shareCount === 1 ? "person" : "people"}
              </span>
            )}
            {deck.commentTotal > 0 && (
              <span className="text-xs text-muted flex items-center gap-1.5">
                <CommentIcon />
                {deck.commentTotal}{" "}
                {deck.commentTotal === 1 ? "comment" : "comments"}
                {deck.commentUnread > 0 && (
                  <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-red-600"
                    />
                    {deck.commentUnread} new
                  </span>
                )}
              </span>
            )}
          </div>
        </Link>

        {/* Hover delete control — mirrors the comment "Dismiss" button's look
            (dark translucent square, icon + tiny label). Hidden (and
            non-interactive) until the card is hovered, so it never intercepts
            clicks meant for the card link. */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRequestDelete(deck);
          }}
          aria-label={deck.role === "owner" ? "Delete deck" : "Remove from your decks"}
          title={deck.role === "owner" ? "Delete deck" : "Remove from your decks"}
          className="absolute top-3 right-3 z-20 flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-lg text-white shadow-md backdrop-blur-md opacity-0 pointer-events-none transition-all group-hover:opacity-100 group-hover:pointer-events-auto hover:scale-105"
          style={{ backgroundColor: "rgba(90,90,90,0.45)" }}
        >
          <TrashIcon />
          <span className="text-[8px] font-semibold leading-none">
            {deck.role === "owner" ? "Delete" : "Remove"}
          </span>
        </button>
      </div>
    </li>
  );
}

function ConfirmDialog({
  deck,
  onCancel,
  onConfirm,
}: {
  deck: DeckCardData;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  if (typeof document === "undefined") return null;

  const isOwner = deck.role === "owner";
  const name = deck.title || "Untitled deck";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground">
          {isOwner ? "Delete this deck?" : "Remove from your decks?"}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {isOwner ? (
            <>
              <span className="font-medium text-foreground">
                &ldquo;{name}&rdquo;
              </span>{" "}
              and all its versions and comments will be deleted
              {deck.shareCount > 0 ? (
                <>
                  {" "}
                  for everyone — including the{" "}
                  <span className="font-medium text-foreground">
                    {deck.shareCount}{" "}
                    {deck.shareCount === 1 ? "person" : "people"}
                  </span>{" "}
                  it&apos;s shared with
                </>
              ) : null}
              . You&apos;ll have a few seconds to undo.
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">
                &ldquo;{name}&rdquo;
              </span>{" "}
              will be removed from your dashboard. The owner and other
              collaborators keep their copy.
            </>
          )}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-black/[0.03]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: "#791F1F" }}
          >
            {isOwner ? "Delete deck" : "Remove"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function DashboardDecks({
  owned,
  shared,
}: {
  owned: DeckCardData[];
  shared: DeckCardData[];
}) {
  // Optimistic removal: ids hidden from the lists immediately on confirm.
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  // The deck awaiting confirmation in the dialog.
  const [dialogDeck, setDialogDeck] = useState<DeckCardData | null>(null);
  // The in-flight undo-able deletion (drives the toast).
  const [pending, setPending] = useState<Pending | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Commit a deletion to the server. Restores the card if it fails.
  async function commit(p: Pending) {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPending((cur) => (cur?.deck.id === p.deck.id ? null : cur));
    const res =
      p.deck.role === "owner"
        ? await deleteOwnedDeckAction(p.deck.id)
        : await removeSharedDeckAction(p.deck.id);
    if (!res.ok) {
      // Roll back the optimistic removal and surface an error.
      setRemoved((prev) => {
        const next = new Set(prev);
        next.delete(p.deck.id);
        return next;
      });
      setErrorMsg(
        p.deck.role === "owner"
          ? "Couldn't delete that deck. Please try again."
          : "Couldn't remove that deck. Please try again.",
      );
      setTimeout(() => setErrorMsg(null), 5000);
    }
  }

  function requestDelete(deck: DeckCardData) {
    setDialogDeck(deck);
  }

  function confirmDelete() {
    const deck = dialogDeck;
    setDialogDeck(null);
    if (!deck) return;

    // Only one undo window at a time: commit any previous pending immediately
    // before starting a new one.
    if (pending) void commit(pending);

    setRemoved((prev) => new Set(prev).add(deck.id));
    const p: Pending = { deck };
    setPending(p);
    timerRef.current = setTimeout(() => void commit(p), UNDO_MS);
  }

  function undo() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pending) {
      setRemoved((prev) => {
        const next = new Set(prev);
        next.delete(pending.deck.id);
        return next;
      });
    }
    setPending(null);
  }

  const visibleOwned = owned.filter((d) => !removed.has(d.id));
  const visibleShared = shared.filter((d) => !removed.has(d.id));
  const bothEmpty = visibleOwned.length === 0 && visibleShared.length === 0;

  return (
    <>
      {bothEmpty ? (
        <div className="rounded-2xl border border-dashed border-border px-8 py-16 text-center flex flex-col items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">No decks yet</h2>
          <p className="text-muted max-w-md">
            Go to Claude.ai and create a presentation, then click{" "}
            <span className="font-semibold text-foreground">
              Open in SlideHuddle
            </span>
            .
          </p>
        </div>
      ) : (
        <>
          {visibleOwned.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-foreground">My decks</h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleOwned.map((deck) => (
                  <DeckCard
                    key={deck.id}
                    deck={deck}
                    onRequestDelete={requestDelete}
                  />
                ))}
              </ul>
            </section>
          )}

          {visibleShared.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-foreground">
                Shared with me
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleShared.map((deck) => (
                  <DeckCard
                    key={deck.id}
                    deck={deck}
                    onRequestDelete={requestDelete}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {dialogDeck && (
        <ConfirmDialog
          deck={dialogDeck}
          onCancel={() => setDialogDeck(null)}
          onConfirm={confirmDelete}
        />
      )}

      {/* Undo toast — appears after a delete; commits when it times out. */}
      {pending && (
        <div className="fixed bottom-6 left-1/2 z-[9998] -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl bg-[#1D1D1B] px-4 py-3 text-sm text-white shadow-2xl">
            <span>
              {pending.deck.role === "owner"
                ? "Deck deleted"
                : "Removed from your decks"}
            </span>
            <button
              type="button"
              onClick={undo}
              className="font-semibold text-white underline underline-offset-2 hover:no-underline"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      {/* Error toast — shown if a commit fails and the card is restored. */}
      {errorMsg && (
        <div className="fixed bottom-6 left-1/2 z-[9998] -translate-x-1/2">
          <div
            role="alert"
            className="rounded-xl px-4 py-3 text-sm font-medium text-white shadow-2xl"
            style={{ backgroundColor: "#791F1F" }}
          >
            {errorMsg}
          </div>
        </div>
      )}
    </>
  );
}
