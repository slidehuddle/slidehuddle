"use client";

// Live version watch for the FLOATING viewer. Like useDeckComments/useDeckStubs,
// this replicates the poll that lives in SlideViewer.tsx so the live viewer stays
// untouched. Every 12s it asks /api/deck-version whether a newer version than the
// one on screen exists — i.e. the deck was revised out-of-band (e.g. the AI
// publishing a new version via the MCP server). It returns the new version number
// (or null) so the viewer can PROMPT a refresh rather than yanking the page out
// from under the reader. Skips historical/read-only views (those are immutable).

import { useEffect, useState } from "react";

export function useDeckVersionWatch({
  deckId,
  readOnly,
  viewingVersion,
}: {
  deckId: string | null;
  readOnly: boolean;
  viewingVersion: number;
}): number | null {
  const [newVersion, setNewVersion] = useState<number | null>(null);

  useEffect(() => {
    if (!deckId || readOnly) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/deck-version?id=${encodeURIComponent(deckId)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as { version?: number };
          if (
            !cancelled &&
            typeof data.version === "number" &&
            data.version > viewingVersion
          ) {
            setNewVersion(data.version);
            return; // stop polling; the refresh prompt takes over
          }
        }
      } catch {
        // Network blip — keep polling.
      }
      if (!cancelled) timer = setTimeout(poll, 12000);
    };
    timer = setTimeout(poll, 12000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deckId, readOnly, viewingVersion]);

  return newVersion;
}
