"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import type { FlagRow } from "@/lib/slide-store";
import PortalPopover from "@/components/PortalPopover";

type Props = {
  /** Existing flag on the current slide, if any. */
  flag: FlagRow | null;
  /** Whether the current user may flag (signed in) and owns the flag. */
  canFlag: boolean;
  currentUserId: string | null;
  loginHref: string;
  onFlag: (reason: string) => Promise<void>;
  onUnflag: (flagId: string) => Promise<void>;
  /** Which corner of the slide the "…" sits in. Defaults to "top-left" (the
   *  classic viewer); the floating viewer passes "bottom-right". */
  position?: "top-left" | "bottom-right";
};

// The flag flow's CONTENT, extracted so two hosts share one copy (Slice C,
// 2026-07-05): SlideFlagControl's "…" popover (the classic viewer) and the
// floating viewer's "This slide" + menu. Three states: sign-in prompt →
// existing flag (with "Remove flag" for its author) → the reason form.
export function FlagPanel({
  flag,
  canFlag,
  currentUserId,
  loginHref,
  onFlag,
  onUnflag,
  onDone,
}: {
  flag: FlagRow | null;
  canFlag: boolean;
  currentUserId: string | null;
  loginHref: string;
  onFlag: (reason: string) => Promise<void>;
  onUnflag: (flagId: string) => Promise<void>;
  /** Called after a successful flag/unflag — the host closes its popover. */
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onFlag(reason.trim());
      setReason("");
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  const ownsFlag = !!flag && !!currentUserId && flag.flagged_by === currentUserId;

  if (!canFlag) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground">
          Sign in to flag this slide for removal.
        </p>
        <Link
          href={loginHref}
          className="self-start inline-flex items-center rounded-lg bg-brand text-white text-sm font-semibold px-3 py-1.5 hover:bg-brand-hover transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }
  if (flag) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">
          Flagged for removal
        </p>
        {flag.reason && (
          <p className="text-sm text-muted whitespace-pre-wrap">{flag.reason}</p>
        )}
        {ownsFlag && (
          <button
            type="button"
            onClick={async () => {
              await onUnflag(flag.id);
              onDone();
            }}
            className="self-start text-sm font-semibold text-brand hover:text-brand-hover"
          >
            Remove flag
          </button>
        )}
      </div>
    );
  }
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-foreground">
        Why should this slide be removed?
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={2000}
        autoFocus
        placeholder="Optional reason…"
        className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 resize-none"
      />
      <button
        type="submit"
        disabled={submitting}
        className="self-end inline-flex items-center rounded-lg text-white text-sm font-semibold px-3 py-1.5 transition-colors disabled:opacity-50"
        style={{ backgroundColor: "#791F1F" }}
      >
        {submitting ? "Flagging…" : "Flag for removal"}
      </button>
    </form>
  );
}

// The subtle "…" menu in a corner of a real slide (the CLASSIC viewer's flag
// entry — the floating viewer uses the "This slide" + menu instead, Slice C).
// Opens the shared FlagPanel.
export default function SlideFlagControl({
  flag,
  canFlag,
  currentUserId,
  loginHref,
  onFlag,
  onUnflag,
  position = "top-left",
}: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const posClass =
    position === "bottom-right" ? "bottom-3 right-3" : "top-3 left-3";

  return (
    <div className={`absolute ${posClass} z-20`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Slide options"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white opacity-0 group-hover/stage:opacity-100 focus:opacity-100 hover:bg-black/50 transition-opacity backdrop-blur-sm"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      <PortalPopover
        anchorRef={btnRef}
        open={open}
        onClose={() => setOpen(false)}
        width={256}
        placement={position === "bottom-right" ? "bottom-end" : "bottom-center"}
      >
        <div
          className="rounded-xl border border-border bg-white shadow-[0_12px_40px_rgba(0,0,0,0.15)] p-3"
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
            onDone={() => setOpen(false)}
          />
        </div>
      </PortalPopover>
    </div>
  );
}
