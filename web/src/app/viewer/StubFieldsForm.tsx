"use client";

import { useState, type FormEvent } from "react";

// The shared title / subtitle / content form behind BOTH "Request a slide"
// (InsertStubForm) and "Edit requested slide" (StubSlideView). Keeping it in one
// place guarantees the create and edit experiences stay literally identical —
// same fields, same validation (need at least a title or some content), same
// styling. The caller supplies the heading, the submit label, and the initial
// values (blank for create, the stub's current fields for edit).

type Fields = { title: string; subtitle: string; body: string };

type Props = {
  heading: string;
  submitLabel: string;
  submittingLabel: string;
  initialTitle?: string;
  initialSubtitle?: string;
  initialBody?: string;
  onSubmit: (fields: Fields) => Promise<void>;
  onClose: () => void;
};

export default function StubFieldsForm({
  heading,
  submitLabel,
  submittingLabel,
  initialTitle = "",
  initialSubtitle = "",
  initialBody = "",
  onSubmit,
  onClose,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [subtitle, setSubtitle] = useState(initialSubtitle);
  const [body, setBody] = useState(initialBody);
  const [submitting, setSubmitting] = useState(false);

  // Need at least a title or some content — a subtitle alone isn't a slide.
  const canSubmit = !!title.trim() || !!body.trim();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || !canSubmit) return;
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
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
        disabled={submitting || !canSubmit}
        className="self-end inline-flex items-center rounded-lg bg-brand text-white text-sm font-semibold px-3.5 py-1.5 hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
