// Server-side analytics capture — the counterpart to the client seam in
// `lib/analytics.ts`. Used for events that originate on the server, where the
// browser SDK (posthog-js) can't run: today, `version_published` in the two deck
// save paths (MCP `update_deck` + the extension `?update=` route).
//
// SERVER-ONLY. Import this only from route handlers / server code — never from a
// "use client" component (it pulls in posthog-node, the Node SDK). The `server-only`
// guard package isn't installed, so this comment is the contract.
//
// Mirrors the client seam's two guarantees:
//   1. NO-OP without a key — with no NEXT_PUBLIC_POSTHOG_KEY set, nothing is sent.
//   2. NEVER throws — every path is wrapped so an analytics failure can't block
//      or break the write it follows. Telemetry is strictly fire-and-forget.

import { PostHog } from "posthog-node";

const DEFAULT_HOST = "https://us.i.posthog.com";

/**
 * Record a server-side product event. `distinctId` is the Supabase user id of
 * the person the event belongs to (the deck owner, for `version_published`).
 * No-ops without a key; never throws.
 *
 * Delivery: we create a fresh client per call and `await shutdown()`. In a
 * serverless runtime the function can freeze the instant it returns, killing any
 * in-flight HTTP request. `flush()` resolves BEFORE the network send completes
 * (with flushAt:1 the capture is already draining the queue), so a flush-only
 * send is silently dropped on return — verified against live PostHog: a
 * flush-only event never arrived, the same event followed by shutdown() did.
 * `shutdown()` flushes AND awaits the in-flight request, guaranteeing delivery
 * before we return. version_published is low-frequency, so a per-call client is
 * cheap.
 */
export async function captureServer(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  try {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return; // not configured → no-op
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_HOST;
    const client = new PostHog(key, { host, flushAt: 1, flushInterval: 0 });
    client.capture({ distinctId, event, properties });
    await client.shutdown();
  } catch {
    // Telemetry must never break or block the write it follows.
  }
}
