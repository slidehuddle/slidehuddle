"use client";

// Hydration-safe relative timestamp. Relative time depends on the current moment
// AND the viewer's locale/timezone — none of which the server can know — so
// rendering it during SSR produces HTML that can't match the client and throws a
// React hydration error (the classic SSR/browser-API trap; see project memory
// "Next.js SSR + browser APIs"). We render nothing on the server and on the first
// client render, then the real value once hydrated. `suppressHydrationWarning` is
// belt-and-braces.

import { formatRelativeTime } from "@/lib/relative-time";
import { useHydrated } from "@/lib/use-hydrated";

export default function RelativeTime({ iso }: { iso: string }) {
  const hydrated = useHydrated();
  return (
    <span suppressHydrationWarning>
      {hydrated ? formatRelativeTime(iso) : ""}
    </span>
  );
}
