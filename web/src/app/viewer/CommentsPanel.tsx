"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CommentRow, FlagRow } from "@/lib/slide-store";

function CommentBody({ body }: { body: string }) {
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
        className={`text-sm text-foreground whitespace-pre-wrap break-words ${expanded ? "" : "line-clamp-5"}`}
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
  currentUserId: string | null;
  loginHref: string;
  onAdd: (body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
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
  currentUserId,
  loginHref,
  onAdd,
  onDelete,
  onClose,
}: Props) {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      await onAdd(body);
      setDraft("");
    } finally {
      setPosting(false);
    }
  }

  return (
    <aside className="w-[340px] shrink-0 border-l border-border flex flex-col bg-white animate-[slideInRight_180ms_ease-out]">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Slide {slideLabel}
          </h2>
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

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {isStub ? (
          <p className="text-sm text-muted leading-relaxed">
            This slide hasn&apos;t been built yet. Comments open once it&apos;s
            a real slide.
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted leading-relaxed">
            No comments on this slide yet.
          </p>
        ) : (
          entries.map((entry) =>
            entry.kind === "flag" ? (
              // Flag-for-removal event, shown inline in time order using the
              // removal colour scheme and attributed to whoever flagged it.
              <div
                key="flag"
                className="rounded-lg p-3 flex flex-col gap-1.5"
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
                  <time
                    className="text-xs shrink-0 ml-auto"
                    style={{ color: "#791F1F", opacity: 0.7 }}
                  >
                    {formatTime(entry.flag.created_at)}
                  </time>
                </div>
                {entry.flag.reason && (
                  <p
                    className="text-sm whitespace-pre-wrap break-words"
                    style={{ color: "#791F1F" }}
                  >
                    {entry.flag.reason}
                  </p>
                )}
                <span
                  className="text-xs"
                  style={{ color: "#791F1F", opacity: 0.85 }}
                >
                  by {authorName(entry.flag.flagged_by_email)}
                </span>
              </div>
            ) : (
              <article key={entry.comment.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Avatar email={entry.comment.author_email} />
                  <span className="text-xs font-semibold text-foreground truncate">
                    {authorName(entry.comment.author_email)}
                  </span>
                  <time className="text-xs text-muted shrink-0 ml-auto">
                    {formatTime(entry.comment.created_at)}
                  </time>
                </div>
                <CommentBody body={entry.comment.body} />
                {entry.comment.user_id === currentUserId && (
                  <button
                    type="button"
                    onClick={() => onDelete(entry.comment.id)}
                    className="self-start text-xs text-muted hover:text-foreground transition-colors"
                  >
                    Delete
                  </button>
                )}
              </article>
            ),
          )
        )}
      </div>

      {!isStub &&
        (canComment ? (
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
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 resize-none"
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
        ) : (
          <div className="border-t border-border p-3 flex flex-col gap-2">
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
