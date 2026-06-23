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

let client: PostHog | null = null;
let resolved = false;

// Lazily build a single client (reused across invocations). Reads the SAME
// public project key + host the browser seam uses, so prod/EU routing matches.
function getClient(): PostHog | null {
  if (resolved) return client;
  resolved = true;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    client = null; // not configured → stay a no-op
    return client;
  }
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_HOST;
  // flushAt:1 / flushInterval:0 → send each event promptly rather than batching,
  // which suits low-volume, fire-once-per-save events in a serverless runtime.
  client = new PostHog(key, { host, flushAt: 1, flushInterval: 0 });
  return client;
}

/**
 * Record a server-side product event. `distinctId` is the Supabase user id of
 * the person the event belongs to (the deck owner, for `version_published`).
 * Awaits a flush so the event is delivered before a serverless function can
 * suspend. No-ops without a key; never throws.
 */
export async function captureServer(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  try {
    const c = getClient();
    if (!c) return;
    c.capture({ distinctId, event, properties });
    await c.flush();
  } catch {
    // Telemetry must never break or block the write it follows.
  }
}
