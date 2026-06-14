"use client";

// Removal-flag state + realtime + write handlers for the FLOATING viewer only.
// Like useDeckComments/useDeckStubs, this replicates the wiring in SlideViewer.tsx
// so the live viewer stays untouched, reusing the same building blocks: the
// browser Supabase client for insert/delete (RLS via the user's session — any
// collaborator may flag, and only the flagger may unflag) and the
// setFlagCurationAction server action for owner dismiss/restore (ownership
// enforced server-side). Phase-7 cutover removes this duplication.

import { useEffect, useState } from "react";
import { setFlagCurationAction } from "./actions";
import type { FlagRow } from "@/lib/slide-store";

type Params = {
  deckId: string | null;
  currentUserId: string | null;
  currentUserEmail: string | null;
  readOnly: boolean;
  initialFlags: FlagRow[];
};

const FLAG_COLS =
  "id, deck_id, slide_index, reason, flagged_by, created_at, dismissed, owner_edited_reason";

export function useDeckFlags({
  deckId,
  currentUserId,
  currentUserEmail,
  readOnly,
  initialFlags,
}: Params) {
  const [flags, setFlags] = useState<FlagRow[]>(initialFlags);

  // Live sync for removal flags (not version-scoped). Current deck only.
  useEffect(() => {
    if (!deckId || readOnly) return;
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);
      const filter = `deck_id=eq.${deckId}`;
      const channel = supabase
        .channel(`floating-flags-${deckId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "slide_flags", filter },
          (payload) => {
            const row = payload.new as FlagRow;
            // The flagger's email isn't a column on this row; a live-arrived flag
            // shows as "Someone" until reload.
            setFlags((prev) =>
              prev.some((f) => f.id === row.id)
                ? prev
                : [...prev, { ...row, flagged_by_email: null }],
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "slide_flags", filter },
          (payload) => {
            const row = payload.new as FlagRow;
            setFlags((prev) =>
              prev.map((f) => (f.id === row.id ? { ...f, ...row } : f)),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "slide_flags", filter },
          (payload) => {
            const oldRow = payload.old as { id?: string };
            if (!oldRow?.id) return;
            setFlags((prev) => prev.filter((f) => f.id !== oldRow.id));
          },
        )
        .subscribe();
      cleanup = () => {
        supabase.removeChannel(channel);
      };
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [deckId, readOnly]);

  // Flag a real slide for removal (any signed-in collaborator — RLS enforced).
  async function addFlag(slideIndex: number, reason: string) {
    if (!deckId || !currentUserId) return;
    const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
    const supabase = getSupabaseBrowser();
    const { data, error } = await supabase
      .from("slide_flags")
      .insert({
        deck_id: deckId,
        slide_index: slideIndex,
        reason: reason || null,
        flagged_by: currentUserId,
      })
      .select(FLAG_COLS)
      .single();
    if (error) {
      console.error("[useDeckFlags] flag insert failed:", error);
      return;
    }
    const row: FlagRow = {
      ...(data as Omit<FlagRow, "flagged_by_email">),
      flagged_by_email: currentUserEmail,
    };
    setFlags((prev) => (prev.some((f) => f.id === row.id) ? prev : [...prev, row]));
  }

  // Remove your own flag (RLS: flagger only). Optimistic with revert.
  async function removeFlag(flagId: string) {
    const snapshot = flags;
    setFlags((prev) => prev.filter((f) => f.id !== flagId));
    const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.from("slide_flags").delete().eq("id", flagId);
    if (error) {
      console.error("[useDeckFlags] flag delete failed:", error);
      setFlags(snapshot);
    }
  }

  // Owner-only: dismiss/restore a flag (exclude from the AI prompt). The server
  // action enforces ownership; revert on failure.
  async function dismissFlag(flagId: string, dismissed: boolean) {
    if (!deckId) return;
    const snapshot = flags;
    setFlags((prev) =>
      prev.map((f) => (f.id === flagId ? { ...f, dismissed } : f)),
    );
    const res = await setFlagCurationAction(deckId, flagId, { dismissed });
    if (!res.ok) {
      console.error("[useDeckFlags] flag dismiss failed:", res.error);
      setFlags(snapshot);
    }
  }

  return { flags, addFlag, removeFlag, dismissFlag };
}
