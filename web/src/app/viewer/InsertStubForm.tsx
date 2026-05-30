"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Props = {
  /** Signed-in users can request a slide; others get a sign-in prompt. */
  canInsert: boolean;
  loginHref: string;
  onSubmit: (fields: {
    title: string;
    subtitle: string;
    body: string;
  }) => Promise<void>;
  onClose: () => void;
};

export default function InsertStubForm({
  canInsert,
  loginHref,
  onSubmit,
  onClose,
}: Props) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (!title.trim() && !body.trim()) return; // need at least something
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        subtitle: subtitle.trim(),
        body: body.trim(),
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="rounded-xl border border-border bg-white shadow-[0_12px_40px_rgba(74,63,181,0.18)] p-4"
      role="dialog"
      aria-label="Request a new slide"
    >
      {canInsert ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Request a slide
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cancel"
              className="text-muted hover:text-foreground"
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Title
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
              placeholder="e.g. Pricing tiers"
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Subtitle
            </span>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              maxLength={300}
              placeholder="Optional"
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              What should this slide cover?
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="Describe the content you want here…"
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 resize-none"
            />
          </label>

          <button
            type="submit"
            disabled={submitting || (!title.trim() && !body.trim())}
            className="self-end inline-flex items-center rounded-lg bg-brand text-white text-sm font-semibold px-3.5 py-1.5 hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Adding…" : "Insert slide"}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">
            Sign in to request a new slide here.
          </p>
          <Link
            href={loginHref}
            className="self-start inline-flex items-center rounded-lg bg-brand text-white text-sm font-semibold px-3.5 py-1.5 hover:bg-brand-hover transition-colors"
          >
            Sign in
          </Link>
        </div>
      )}
    </div>
  );
}
