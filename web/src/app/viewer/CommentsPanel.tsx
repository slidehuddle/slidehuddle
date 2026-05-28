"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CommentRow } from "@/lib/slide-store";

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
  currentSlideIndex: number;
  comments: CommentRow[];
  currentUserId: string;
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

export default function CommentsPanel({
  currentSlideIndex,
  comments,
  currentUserId,
  onAdd,
  onDelete,
  onClose,
}: Props) {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const visible = comments.filter((c) => c.slide_index === currentSlideIndex);

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
    <aside className="w-[320px] shrink-0 border-l border-border flex flex-col bg-white">
      <header className="flex items-center justify-between px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">
          Comments on slide {currentSlideIndex + 1}
        </h2>
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

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
        {visible.length === 0 ? (
          <p className="text-sm text-muted leading-relaxed">
            No comments on this slide yet. Be the first — your team will see
            your comment when they open the deck.
          </p>
        ) : (
          visible.map((c) => (
            <article key={c.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground truncate">
                  {c.author_email || "Someone"}
                </span>
                <time className="text-xs text-muted shrink-0">
                  {formatTime(c.created_at)}
                </time>
              </div>
              <CommentBody body={c.body} />
              {c.user_id === currentUserId && (
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  className="self-start text-xs text-muted hover:text-foreground transition-colors"
                >
                  Delete
                </button>
              )}
            </article>
          ))
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-border p-4 flex flex-col gap-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Leave a comment…"
          rows={3}
          maxLength={4000}
          className="rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 resize-none"
          disabled={posting}
        />
        <button
          type="submit"
          disabled={posting || !draft.trim()}
          className="self-end inline-flex items-center rounded-lg bg-brand text-white text-sm font-semibold px-4 py-2 hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {posting ? "Posting…" : "Post"}
        </button>
      </form>
    </aside>
  );
}
