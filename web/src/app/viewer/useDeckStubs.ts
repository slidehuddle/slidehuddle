"use client";

// Requested-slide ("stub") state + realtime + write handlers for the FLOATING
// viewer only. Like useDeckComments, this replicates the wiring that lives in
// SlideViewer.tsx so the live viewer stays untouched, reusing the same building
// blocks: the browser Supabase client for insert/delete (RLS via session) and
// the server actions (deleteStub / editStubFields / setStubCuration) whose
// "requester OR owner" rules are enforced server-side. The Phase-7 cutover
// removes this duplication when the old viewer is retired.

import { useEffect, useState } from "react";
import {
  deleteStubAction,
  editStubFieldsAction,
  setStubCurationAction,
} from "./actions";
import type { StubRow } from "@/lib/slide-store";

type Params = {
  deckId: string | null;
  currentUserId: string | null;
  currentUserEmail: string | null;
  readOnly: boolean;
  initialStubs: StubRow[];
};

const STUB_COLS =
  "id, deck_id, position, title, subtitle, body, requested_by, created_at, dismissed, owner_edited_body";

export function useDeckStubs({
  deckId,
  currentUserId,
  currentUserEmail,
  readOnly,
  initialStubs,
}: Params) {
  const [stubs, setStubs] = useState<StubRow[]>(initialStubs);

  // Live sync for requested slides (not version-scoped). Current deck only.
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
        .channel(`floating-stubs-${deckId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "slide_stubs", filter },
          (payload) => {
            const row = payload.new as StubRow;
            // The author's email isn't a column on this row; a live-arrived stub
            // shows as "a teammate" until reload.
            setStubs((prev) =>
              prev.some((s) => s.id === row.id)
                ? prev
                : [...prev, { ...row, requested_by_email: null }],
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "slide_stubs", filter },
          (payload) => {
            const row = payload.new as StubRow;
            setStubs((prev) =>
              prev.map((s) => (s.id === row.id ? { ...s, ...row } : s)),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "slide_stubs", filter },
          (payload) => {
            const oldRow = payload.old as { id?: string };
            if (!oldRow?.id) return;
            setStubs((prev) => prev.filter((s) => s.id !== oldRow.id));
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

  // Request a new slide at `position` (number of real slides before it).
  // Returns the new stub's id so the caller can jump to it.
  async function insertStub(
    position: number,
    fields: { title: string; subtitle: string; body: string },
  ): Promise<string | null> {
    if (!deckId || !currentUserId) return null;
    const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
    const supabase = getSupabaseBrowser();
    const { data, error } = await supabase
      .from("slide_stubs")
      .insert({
        deck_id: deckId,
        position,
        title: fields.title || null,
        subtitle: fields.subtitle || null,
        body: fields.body || null,
        requested_by: currentUserId,
      })
      .select(STUB_COLS)
      .single();
    if (error) {
      console.error("[useDeckStubs] stub insert failed:", error);
      return null;
    }
    const row: StubRow = {
      ...(data as Omit<StubRow, "requested_by_email">),
      requested_by_email: currentUserEmail,
    };
    setStubs((prev) => [...prev, row]);
    return row.id;
  }

  // Delete a requested slide (requester or owner — enforced server-side).
  async function deleteStub(stubId: string) {
    if (!deckId) return;
    const snapshot = stubs;
    setStubs((prev) => prev.filter((s) => s.id !== stubId));
    const res = await deleteStubAction(deckId, stubId);
    if (!res.ok) {
      console.error("[useDeckStubs] stub delete failed:", res.error);
      setStubs(snapshot);
    }
  }

  // Owner-only: dismiss/restore a requested slide (exclude from the AI prompt).
  async function dismissStub(stubId: string, dismissed: boolean) {
    if (!deckId) return;
    const snapshot = stubs;
    setStubs((prev) =>
      prev.map((s) => (s.id === stubId ? { ...s, dismissed } : s)),
    );
    const res = await setStubCurationAction(deckId, stubId, { dismissed });
    if (!res.ok) {
      console.error("[useDeckStubs] stub dismiss failed:", res.error);
      setStubs(snapshot);
    }
  }

  // Requester or owner: edit a requested slide's title/subtitle/body. Also clears
  // any legacy owner_edited_body so the structured fields are the source of truth.
  async function editStub(
    stubId: string,
    fields: { title: string; subtitle: string; body: string },
  ) {
    if (!deckId) return;
    const snapshot = stubs;
    setStubs((prev) =>
      prev.map((s) =>
        s.id === stubId
          ? {
              ...s,
              title: fields.title || null,
              subtitle: fields.subtitle || null,
              body: fields.body || null,
              owner_edited_body: null,
            }
          : s,
      ),
    );
    const res = await editStubFieldsAction(deckId, stubId, fields);
    if (!res.ok) {
      console.error("[useDeckStubs] stub edit failed:", res.error);
      setStubs(snapshot);
    }
  }

  return { stubs, insertStub, deleteStub, dismissStub, editStub };
}
