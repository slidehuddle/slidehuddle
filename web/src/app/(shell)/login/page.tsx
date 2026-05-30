"use client";

import { useState, type FormEvent } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus({ kind: "sending" });

    // Forward any ?next=<path> through to /auth/callback so the user lands
    // back where they started after signing in (e.g. a viewer URL).
    const here = new URLSearchParams(window.location.search);
    const next = here.get("next") ?? "";
    const callbackUrl = next
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : `${window.location.origin}/auth/callback`;

    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: callbackUrl,
      },
    });

    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }
    setStatus({ kind: "sent", email: trimmed });
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm flex flex-col gap-8">
        {status.kind === "sent" ? (
          <div className="flex flex-col gap-3 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Check your email
            </h1>
            <p className="text-muted leading-relaxed">
              We sent a sign-in link to{" "}
              <span className="font-semibold text-foreground">
                {status.email}
              </span>
              . Click it to finish signing in.
            </p>
            <button
              type="button"
              onClick={() => setStatus({ kind: "idle" })}
              className="text-sm text-brand hover:text-brand-hover mt-2"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Sign in to SlideHuddle
              </h1>
              <p className="text-muted">
                We&apos;ll email you a one-time link — no password needed.
              </p>
            </div>

            <label htmlFor="email" className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-foreground">
                Email
              </span>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status.kind === "sending"}
                className="rounded-lg border border-border px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
              />
            </label>

            <button
              type="submit"
              disabled={status.kind === "sending"}
              className="inline-flex items-center justify-center rounded-xl bg-brand text-white font-semibold px-6 py-3 hover:bg-brand-hover transition-colors disabled:opacity-60"
            >
              {status.kind === "sending" ? "Sending…" : "Send magic link"}
            </button>

            {status.kind === "error" && (
              <p className="text-sm text-red-600" role="alert">
                {status.message}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
