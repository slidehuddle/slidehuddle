"use client";

import Link from "next/link";
import StubFieldsForm from "./StubFieldsForm";

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
  return (
    <div
      className="rounded-xl border border-border bg-white shadow-[0_12px_40px_rgba(74,63,181,0.18)] p-4"
      role="dialog"
      aria-label="Request a new slide"
    >
      {canInsert ? (
        // Shared with the "Edit requested slide" modal so create and edit stay
        // identical.
        <StubFieldsForm
          heading="Request a slide"
          submitLabel="Insert slide"
          submittingLabel="Adding…"
          onSubmit={onSubmit}
          onClose={onClose}
        />
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
