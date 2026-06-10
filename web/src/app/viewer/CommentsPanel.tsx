"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CommentRow, FlagRow } from "@/lib/slide-store";

function CommentBody({
  body,
  strikethrough = false,
}: {
  body: string;
  strikethrough?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  // Measure on mount and whenever the body content changes — if the
  // line-clamped paragraph is taller than what it actually shows, the
  // comment is truncated and we need the More toggle.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setTruncated(el.scrollHeight > el.clientHeight + 1);
  }, [body]);

  return (
    <div className="flex flex-col gap-1">
      <p
        ref={ref}
        className={`text-sm whitespace-pre-wrap break-words ${strikethrough ? "line-through text-muted" : "text-foreground"} ${expanded ? "" : "line-clamp-5"}`}
      >
        {body}
      </p>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-xs font-semibold text-brand hover:text-brand-hover transition-colors"
        >
          {expanded ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

type Props = {
  /** 1-based number shown in the header for the active item. */
  slideLabel: number;
  isStub: boolean;
  /** The flag on the current slide, if any (drives the header pill + the
   *  flag entry at the top of the comment list). */
  flag: FlagRow | null;
  comments: CommentRow[];
  canComment: boolean;
  /** Deck owner on the current deck: reveals hover Dismiss/Edit controls. */
  canCurate?: boolean;
  /** Viewing a past version: comments are visible but can't be added. Drives a
   *  "read-only" footer instead of the "sign in to comment" prompt. */
  readOnly?: boolean;
  currentUserId: string | null;
  loginHref: string;
  onAdd: (body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Owner curation: toggle whether a comment is sent to Claude. */
  onDismiss: (id: string, dismissed: boolean) => Promise<void>;
  /** Owner curation: set (or clear, via null) the edited text sent to Claude. */
  onEdit: (id: string, ownerEditedBody: string | null) => Promise<void>;
  /** Owner curation of the slide's removal flag (dismiss only). */
  onFlagDismiss: (id: string, dismissed: boolean) => Promise<void>;
  onClose: () => void;
  /** Floating viewer only: render the panel body translucent (so the slide
   *  shows through, like the thumbnail strip) with each comment on its own
   *  opaque white card. Header + compose footer stay opaque so all text and
   *  inputs remain fully legible. Defaults off → the current viewer's panel is
   *  unchanged. */
  translucent?: boolean;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Short, muted relative time for a comment: "just now" (<1m), "3m", "2h",
// "yesterday", then a short date for anything older. `now` is injected so it
// stays a pure function (and testable); defaults to the current time.
function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function authorName(email: string | null): string {
  if (!email) return "Someone";
  return email.split("@")[0] || email;
}

function Avatar({ email }: { email: string | null }) {
  const letter = (email?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold select-none"
      style={{ backgroundColor: "#EEEDFE", color: "#3C3489" }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

export default function CommentsPanel({
  slideLabel,
  isStub,
  flag,
  comments,
  canComment,
  canCurate = false,
  readOnly = false,
  currentUserId,
  loginHref,
  onAdd,
  onDelete,
  onDismiss,
  onEdit,
  onFlagDismiss,
  onClose,
  translucent = false,
}: Props) {
  // When translucent, each comment / placeholder sits on its own opaque white
  // card so the text stays readable over the see-through panel; off, the entries
  // sit flat on the panel's solid white exactly as before. `shrink-0` is
  // essential: the card's `overflow-hidden` (for rounded corners) otherwise
  // gives it a flex min-size of 0, so the cards squeeze to fit the column
  // instead of keeping their height and letting the list scroll.
  const cardClass = translucent
    ? "shrink-0 overflow-hidden rounded-xl border border-border bg-white p-3 shadow-sm"
    : "";
  // Owner hover controls (Edit / Dismiss). In the floating viewer they're
  // icon-only (no text), a lighter grey, and nudged in from the card's rounded
  // edge; the current viewer keeps the original labelled buttons.
  const curationBtnClass = translucent
    ? "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-md backdrop-blur-sm transition-transform hover:scale-105"
    : "pointer-events-auto flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-lg text-white shadow-md backdrop-blur-sm transition-transform hover:scale-105";
  const curationBtnStyle = {
    backgroundColor: translucent ? "rgba(90,90,95,0.7)" : "rgba(40,40,38,0.7)",
  };
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  // Floating viewer: the composer stays collapsed to a "+" until the user opens
  // it, freeing the vertical space the always-on textarea + Send used to take.
  const [composing, setComposing] = useState(false);
  // Floating viewer: scroll the list to the newest comment (the bottom, since
  // the list is oldest→newest) right after the user posts, so they can see it
  // landed. `scrollPendingRef` is armed on submit and consumed once the list
  // actually grows.
  const listRef = useRef<HTMLDivElement>(null);
  const scrollPendingRef = useRef(false);
  // Owner inline edit: which comment is open in the editor, and its draft text.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // Merge the comments and the (optional) flag into one list ordered by time
  // — the flag is just another timestamped event, not a pinned banner.
  type Entry =
    | { kind: "comment"; at: string; comment: CommentRow }
    | { kind: "flag"; at: string; flag: FlagRow };
  const entries: Entry[] = [
    ...comments.map(
      (c): Entry => ({ kind: "comment", at: c.created_at, comment: c }),
    ),
    ...(flag ? [{ kind: "flag" as const, at: flag.created_at, flag }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));

  async function submitDraft() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    scrollPendingRef.current = true;
    try {
      await onAdd(body);
      setDraft("");
      setComposing(false);
    } finally {
      setPosting(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await submitDraft();
  }

  // Once the just-posted comment has rendered (the list grew), scroll to the
  // bottom so the user sees it. Floating viewer only; the current viewer keeps
  // its existing scroll behaviour.
  useEffect(() => {
    if (!translucent || !scrollPendingRef.current) return;
    scrollPendingRef.current = false;
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [comments.length, translucent]);

  return (
    <aside
      className={`w-[340px] shrink-0 flex flex-col animate-[slideInRight_180ms_ease-out] ${
        translucent ? "" : "border-l border-border bg-white"
      }`}
    >
      <header
        className={`flex items-center justify-between px-4 py-3 border-b border-border ${
          translucent ? "bg-white" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Slide {slideLabel}
          </h2>
          {/* Comment-count pill — all comments on this slide (including any the
              owner dismissed; they're still here). Hidden when there are none. */}
          {!isStub && comments.length > 0 && (
            <span
              aria-label={`${comments.length} comment${comments.length === 1 ? "" : "s"} on this slide`}
              className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none"
              style={{ backgroundColor: "#E1F5EE", color: "#085041" }}
            >
              {comments.length}
            </span>
          )}
          {isStub && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ backgroundColor: "#E1F5EE", color: "#085041" }}
            >
              requested
            </span>
          )}
          {flag && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ backgroundColor: "#FCEBEB", color: "#791F1F" }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              flagged
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comments"
          className="text-muted hover:text-foreground transition-colors"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4"
      >
        {isStub ? (
          <p className={`text-sm text-muted leading-relaxed ${cardClass}`}>
            This slide hasn&apos;t been built yet. Comments open once it&apos;s
            a real slide.
          </p>
        ) : entries.length === 0 ? (
          <p className={`text-sm text-muted leading-relaxed ${cardClass}`}>
            No comments on this slide yet.
          </p>
        ) : (
          entries.map((entry) =>
            entry.kind === "flag" ? (
              // Flag-for-removal event, shown inline in time order using the
              // removal colour scheme and attributed to whoever flagged it.
              <div
                key="flag"
                className={`group relative rounded-lg p-3 flex flex-col gap-1.5 transition-opacity ${entry.flag.dismissed ? "opacity-60" : ""} ${translucent ? "shadow-sm" : ""}`}
                style={{ backgroundColor: "#FCEBEB" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: "#791F1F", color: "#ffffff" }}
                    aria-hidden="true"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </span>
                  <span
                    className="text-sm font-bold"
                    style={{ color: "#791F1F" }}
                  >
                    Flagged for removal
                  </span>
                  {entry.flag.owner_edited_reason != null && (
                    <span
                      title="The owner edited what's sent to Claude"
                      className="text-[10px] shrink-0"
                      style={{ color: "#791F1F", opacity: 0.7 }}
                    >
                      · edited
                    </span>
                  )}
                  <time
                    title={formatTime(entry.flag.created_at)}
                    className="text-xs shrink-0 ml-auto"
                    style={{ color: "#791F1F", opacity: 0.7 }}
                  >
                    {formatRelativeTime(entry.flag.created_at)}
                  </time>
                </div>
                {(entry.flag.owner_edited_reason ?? entry.flag.reason) && (
                  <p
                    className={`text-sm whitespace-pre-wrap break-words ${entry.flag.dismissed ? "line-through" : ""}`}
                    style={{ color: "#791F1F" }}
                  >
                    {entry.flag.owner_edited_reason ?? entry.flag.reason}
                  </p>
                )}
                <span
                  className="text-xs"
                  style={{ color: "#791F1F", opacity: 0.85 }}
                >
                  by {authorName(entry.flag.flagged_by_email)}
                </span>
                {entry.flag.dismissed && (
                  <p className="text-xs" style={{ color: "#791F1F" }}>
                    Won&apos;t send to Claude
                    {canCurate && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          onClick={() => onFlagDismiss(entry.flag.id, false)}
                          className="font-semibold underline"
                        >
                          Restore
                        </button>
                      </>
                    )}
                  </p>
                )}
                {/* Flags get Dismiss only — there's no edit (the reason is just
                    a removal note). */}
                {canCurate && !entry.flag.dismissed && (
                  <div
                    className={`pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end gap-1.5 ${translucent ? "pr-4" : "pr-3"} pl-12 opacity-0 transition-opacity group-hover:opacity-100`}
                    style={{
                      background:
                        "linear-gradient(to right, transparent, #FCEBEB 45%)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onFlagDismiss(entry.flag.id, true)}
                      aria-label="Dismiss — won't send to Claude"
                      title="Dismiss — won't send to Claude"
                      className={curationBtnClass}
                      style={curationBtnStyle}
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
                      {!translucent && (
                        <span className="text-[8px] font-semibold leading-none">
                          Dismiss
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <article
                key={entry.comment.id}
                className={`group relative flex flex-col gap-1 transition-opacity ${entry.comment.dismissed ? "opacity-60" : ""} ${cardClass}`}
              >
                <div className="flex items-center gap-2">
                  <Avatar email={entry.comment.author_email} />
                  <span className="text-xs font-semibold text-foreground truncate">
                    {authorName(entry.comment.author_email)}
                  </span>
                  {entry.comment.owner_edited_body != null && (
                    <span
                      title="The owner edited what's sent to Claude"
                      className="text-[10px] text-muted shrink-0"
                    >
                      · edited
                    </span>
                  )}
                  <time
                    title={formatTime(entry.comment.created_at)}
                    className="text-xs text-muted shrink-0 ml-auto"
                  >
                    {formatRelativeTime(entry.comment.created_at)}
                  </time>
                </div>
                {editingId === entry.comment.id ? (
                  // Owner inline editor — changes only what's sent to Claude.
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                      maxLength={4000}
                      autoFocus
                      className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 resize-none"
                    />
                    <p className="text-[11px] text-muted leading-snug">
                      Changes what&apos;s sent to Claude — the original comment
                      won&apos;t change.
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={!editDraft.trim()}
                        onClick={async () => {
                          const text = editDraft.trim();
                          if (!text) return;
                          await onEdit(entry.comment.id, text);
                          setEditingId(null);
                        }}
                        className="inline-flex items-center rounded-lg bg-brand text-white text-xs font-semibold px-3 py-1.5 hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-xs text-muted hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <CommentBody
                      body={
                        entry.comment.owner_edited_body ?? entry.comment.body
                      }
                      strikethrough={entry.comment.dismissed}
                    />
                    {/* Dismissed → show why. Only the owner can Restore. */}
                    {entry.comment.dismissed && (
                      <p className="text-xs text-muted">
                        Won&apos;t send to Claude
                        {canCurate && (
                          <>
                            {" · "}
                            <button
                              type="button"
                              onClick={() => onDismiss(entry.comment.id, false)}
                              className="font-semibold text-foreground hover:underline"
                            >
                              Restore
                            </button>
                          </>
                        )}
                      </p>
                    )}
                    {canComment &&
                      !entry.comment.dismissed &&
                      entry.comment.user_id === currentUserId && (
                        <button
                          type="button"
                          onClick={() => onDelete(entry.comment.id)}
                          className="self-start text-xs text-muted hover:text-foreground transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    {/* Owner-only hover controls. Greyscale, overlaying the
                        right of the comment with a left-to-right fade so the
                        start stays readable. Hidden once dismissed (Restore
                        lives inline). */}
                    {canCurate && !entry.comment.dismissed && (
                      <div
                        className={`pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end gap-1.5 ${translucent ? "pr-4" : ""} pl-12 opacity-0 transition-opacity group-hover:opacity-100`}
                        style={{
                          background:
                            "linear-gradient(to right, transparent, #ffffff 45%)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(entry.comment.id);
                            setEditDraft(
                              entry.comment.owner_edited_body ??
                                entry.comment.body,
                            );
                          }}
                          aria-label="Edit what's sent to Claude"
                          title="Edit what's sent to Claude"
                          className={curationBtnClass}
                          style={curationBtnStyle}
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
                          {!translucent && (
                            <span className="text-[8px] font-semibold leading-none">
                              Edit
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDismiss(entry.comment.id, true)}
                          aria-label="Dismiss — won't send to Claude"
                          title="Dismiss — won't send to Claude"
                          className={curationBtnClass}
                          style={curationBtnStyle}
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
                          {!translucent && (
                            <span className="text-[8px] font-semibold leading-none">
                              Dismiss
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </article>
            ),
          )
        )}
      </div>

      {!isStub &&
        (canComment ? (
          translucent ? (
            composing ? (
              // Inline composer — mirrors the owner edit flow (textarea + Save /
              // Cancel). Opening it on demand keeps the footer tiny the rest of
              // the time, leaving more room for the comment list.
              <div className="border-t border-border p-3 bg-white flex flex-col gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Add a comment…"
                  rows={3}
                  maxLength={4000}
                  autoFocus
                  disabled={posting}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 resize-none"
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={posting || !draft.trim()}
                    onClick={submitDraft}
                    className="inline-flex items-center rounded-lg bg-brand text-white text-xs font-semibold px-3 py-1.5 hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {posting ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setComposing(false);
                      setDraft("");
                    }}
                    className="text-xs text-muted hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // Collapsed state — just a "+" that opens the composer above.
              <div className="border-t border-border p-3 bg-white">
                <button
                  type="button"
                  onClick={() => setComposing(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-sm font-semibold text-brand hover:border-brand hover:bg-brand/5 transition-colors"
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
                  Add a comment
                </button>
              </div>
            )
          ) : (
            <form
              onSubmit={handleSubmit}
              className="border-t border-border p-3 flex flex-col gap-2"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment…"
                rows={3}
                maxLength={4000}
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 resize-none"
                disabled={posting}
              />
              <button
                type="submit"
                disabled={posting || !draft.trim()}
                className="self-end inline-flex items-center gap-1.5 rounded-lg bg-brand text-white text-sm font-semibold px-3.5 py-1.5 hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                {posting ? "Posting…" : "Send"}
              </button>
            </form>
          )
        ) : readOnly ? (
          <div className={`border-t border-border p-3 ${translucent ? "bg-white" : ""}`}>
            <p className="text-sm text-muted">
              Comments are read-only on past versions.
            </p>
          </div>
        ) : (
          <div className={`border-t border-border p-3 flex flex-col gap-2 ${translucent ? "bg-white" : ""}`}>
            <p className="text-sm text-muted">Sign in to comment.</p>
            <Link
              href={loginHref}
              className="self-start inline-flex items-center rounded-lg bg-brand text-white text-sm font-semibold px-3.5 py-1.5 hover:bg-brand-hover transition-colors"
            >
              Sign in to comment
            </Link>
          </div>
        ))}
    </aside>
  );
}
