"use client";

// Initialises analytics on the client, once, after mount. Kept as a plain React
// client component (not a Next-version-specific instrumentation hook) so it's
// portable across Next versions and SSR-safe — initAnalytics() guards on
// `typeof window` and no-ops without a PostHog key, so this is inert in CI/dev
// and on any deployment that hasn't set NEXT_PUBLIC_POSTHOG_KEY.
//
// It renders its children unchanged (no context needed): event call sites import
// track()/identifyUser() from "@/lib/analytics" directly.

import { useEffect } from "react";
import { initAnalytics } from "@/lib/analytics";

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    initAnalytics();
  }, []);
  return <>{children}</>;
}
