// Vendor-agnostic analytics seam (PostHog under the hood).
//
// Every call site imports from HERE, never from posthog-js directly, so the
// product code stays decoupled from the vendor and — crucially — every entry
// point NO-OPS safely when analytics isn't configured. With no
// NEXT_PUBLIC_POSTHOG_KEY set (CI, local dev, a fork without a key) nothing is
// sent and nothing throws; the moment the key is present in the environment,
// real events start flowing with zero code change. (P0.2 chose PostHog; this is
// where that decision lives.)
//
// This module is browser-only: posthog-js is a client library and every export
// guards on `typeof window`, so importing it from a "use client" component is
// safe and importing it from a server component would simply no-op. Do NOT
// import it from server code (page.tsx etc.) — keep the seam on the client.

import posthog from "posthog-js";

// Default to PostHog US cloud; override with NEXT_PUBLIC_POSTHOG_HOST (e.g. an
// EU instance or a reverse-proxy). Only read at init time.
const DEFAULT_HOST = "https://us.i.posthog.com";

let enabled = false;
let initialized = false;

// In dev, mirror events to the console so they're visible/testable even without
// a key wired up. Prod stays silent unless PostHog is actually configured.
const isDev = process.env.NODE_ENV !== "production";

function debug(event: string, properties?: Record<string, unknown>) {
  if (isDev && typeof window !== "undefined") {
    console.debug("[analytics]", event, properties ?? {});
  }
}

/**
 * Initialise the analytics vendor. Called once from PostHogProvider in a client
 * effect. Safe to call repeatedly (guards against double-init). No key → stays
 * disabled and every other export no-ops.
 */
export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return; // not configured — analytics stays a no-op
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_HOST;
  posthog.init(key, {
    api_host: host,
    // Only create person profiles for users we identify (signed-in viewers) —
    // anonymous link-holders never get a stored profile (privacy + cost).
    person_profiles: "identified_only",
    capture_pageview: true,
  });
  enabled = true;
}

/** Record a product event. No-ops unless analytics is configured. */
export function track(
  event: string,
  properties?: Record<string, unknown>,
): void {
  debug(event, properties);
  if (!enabled || typeof window === "undefined") return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Never let analytics break the app.
  }
}

/**
 * Associate subsequent events with a stable user id (the Supabase user id) and
 * attach person properties (e.g. whether they're a design partner) so usage can
 * be segmented. No-ops unless configured. Anonymous viewers are never identified.
 */
export function identifyUser(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  if (!enabled || typeof window === "undefined") return;
  try {
    posthog.identify(distinctId, properties);
  } catch {
    // ignore
  }
}
