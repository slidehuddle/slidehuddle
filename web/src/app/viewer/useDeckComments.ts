"use client";

// Comment state + realtime + write handlers for the FLOATING viewer only.
// This deliberately replicates the comment wiring that lives inside
// SlideViewer.tsx (rather than extracting a shared hook), so SlideViewer — the
// live viewer — stays completely untouched. It reuses the SAME building blocks:
// the browser Supabase client for insert/delete (RLS enforced by the user's
// session), the `setCommentCurationAction` server action for owner curation
// (ownership enforced server-side), and the same Realtime channel pattern.
// The Phase-7 cutover removes this duplication when the old viewer is retired.

import { useEffect, useRef, useState } from "react";
import { setCommentCurationAction } from "./actions";
import { track } from "@/lib/analytics";
import type { CommentRow } from "@/lib/slide-store";

type Params = {
  deckId: string | null;
  currentUserId: string | null;
  currentUserEmail: string | null;
  /** Version being viewed — new comments are stamped with it, and inserts from
   *  realtime are filtered to it (matches how the server seeded them). */
  viewingVersion: number;
  /** Historical (read-only) view: no realtime, no writes. */
  readOnly: boolean;
  initialComments: CommentRow[];
  /** G1 analytics context (docs/G1-MEASUREMENT.md §4): the landing the session
   *  started on, and this viewer's role. Stamped onto feedback_added. */
  surface: "feed" | "deck";
  role: "owner" | "collaborator" | "anon";
  /** Fires when ANOTHER person's comment lands via realtime on the version
   *  being viewed (own inserts are excluded — they echo back but the author
   *  already knows). Powers the in-session comment nudge; held in a ref so a
   *  changing callback never resubscribes the channel. */
  onRemoteInsert?: (row: CommentRow) => void;
};

const COMMENT_COLS =
  "id, deck_id, user_id, author_email, slide_index, body, created_at, version, dismissed, owner_edited_body";

export function useDeckComments({
  deckId,
  currentUserId,
  currentUserEmail,
  viewingVersion,
  readOnly,
  initialComments,
  surface,
  role,
  onRemoteInsert,
}: Params) {
  const [comments, setComments] = useState<CommentRow[]>(initialComments);

  // Latest callback without making it a channel-effect dependency (the
  // subscription must not tear down/resubscribe on every render).
  const onRemoteInsertRef = useRef(onRemoteInsert);
  useEffect(() => {
    onRemoteInsertRef.current = onRemoteInsert;
  }, [onRemoteInsert]);

  // Live sync: subscribe to this deck's comment changes so a teammate's
  // add/edit/dismiss/delete shows up without a refresh. Current deck only
  // (historical versions are immutable). Realtime respects RLS via the user's
  // session; inserts are filtered to the version being viewed.
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
      // Authorize Realtime with the user's token so RLS applies.
      if (session) supabase.realtime.setAuth(session.access_token);
      const filter = `deck_id=eq.${deckId}`;
      const channel = supabase
        .channel(`floating-deck-${deckId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "comments", filter },
          (payload) => {
            const row = payload.new as CommentRow;
            if (row.version !== viewingVersion) return;
            // A teammate's comment (own inserts echo back too — skip those;
            // the optimistic path already showed them).
            if (row.user_id !== currentUserId)
              onRemoteInsertRef.current?.(row);
            setComments((prev) =>
              prev.some((c) => c.id === row.id) ? prev : [...prev, row],
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "comments", filter },
          (payload) => {
            const row = payload.new as CommentRow;
            setComments((prev) =>
              prev.map((c) => (c.id === row.id ? { ...c, ...row } : c)),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "comments", filter },
          (payload) => {
            const oldRow = payload.old as { id?: string };
            if (!oldRow?.id) return;
            setComments((prev) => prev.filter((c) => c.id !== oldRow.id));
          },
        )
        // Surface silent failures: without this callback a dead channel (auth
        // expiry, network) just stops delivering with no trace.
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("[useDeckComments] realtime channel:", status, err?.message);
          }
        });
      // Keep the Realtime socket authorized past the JWT's ~1h expiry: the
      // browser client auto-refreshes the session, but the socket keeps the
      // token it was given at mount — re-hand it the fresh one, or live sync
      // silently dies in any tab left open longer than the token's lifetime.
      const { data: authSub } = supabase.auth.onAuthStateChange(
        (_event, freshSession) => {
          if (freshSession) supabase.realtime.setAuth(freshSession.access_token);
        },
      );
      cleanup = () => {
        authSub.subscription.unsubscribe();
        supabase.removeChannel(channel);
      };
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [deckId, readOnly, viewingVersion, currentUserId]);

  // Add a comment to a given slide (optimistic; reconciled on save). Returns
  // the saved comment's id (for the undo stack). `opts.track: false` skips the
  // feedback_added analytics event — used by undo re-creates, so undo cycles
  // never inflate the Gate-G1 numbers.
  async function addComment(
    slideIndex: number,
    body: string,
    opts?: { track?: boolean },
  ): Promise<string | null> {
    if (!deckId || !currentUserId) return null;
    const optimisticId = `temp-${Date.now()}`;
    const optimistic: CommentRow = {
      id: optimisticId,
      deck_id: deckId,
      user_id: currentUserId,
      author_email: currentUserEmail,
      slide_index: slideIndex,
      body,
      created_at: new Date().toISOString(),
      version: viewingVersion,
      dismissed: false,
      owner_edited_body: null,
    };
    setComments((prev) => [...prev, optimistic]);
    const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
    const supabase = getSupabaseBrowser();
    const { data, error } = await supabase
      .from("comments")
      .insert({
        deck_id: deckId,
        user_id: currentUserId,
        author_email: currentUserEmail,
        slide_index: slideIndex,
        body,
        version: viewingVersion,
      })
      .select(COMMENT_COLS)
      .single();
    if (error) {
      console.error("[useDeckComments] comment insert failed:", error);
      setComments((prev) => prev.filter((c) => c.id !== optimisticId));
      return null;
    }
    // Swap the optimistic row for the saved one; dedupe in case the Realtime
    // INSERT for this same row already echoed back.
    const real = data as CommentRow;
    setComments((prev) => {
      const withoutTemp = prev.filter((c) => c.id !== optimisticId);
      return withoutTemp.some((c) => c.id === real.id)
        ? withoutTemp
        : [...withoutTemp, real];
    });
    // Gate evidence: "did feedback volume go up". Fired only on a confirmed save.
    if (opts?.track !== false) {
      track("feedback_added", {
        kind: "comment",
        surface,
        deck_id: deckId,
        version: viewingVersion,
        role,
      });
    }
    return real.id;
  }

  // Delete a comment (author only — enforced by RLS). Optimistic with revert.
  async function deleteComment(id: string) {
    const snapshot = comments;
    setComments((prev) => prev.filter((c) => c.id !== id));
    const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) {
      console.error("[useDeckComments] comment delete failed:", error);
      setComments(snapshot);
    }
  }

  // Owner-only: dismiss/restore a comment (exclude from the AI prompt). The
  // owner check happens server-side in the action; revert on failure.
  // `opts.track: false` skips the feedback_curated event (undo re-flips).
  async function dismissComment(
    id: string,
    dismissed: boolean,
    opts?: { track?: boolean },
  ) {
    if (!deckId) return;
    const snapshot = comments;
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, dismissed } : c)),
    );
    const res = await setCommentCurationAction(deckId, id, { dismissed });
    if (!res.ok) {
      console.error("[useDeckComments] comment dismiss failed:", res.error);
      setComments(snapshot);
      return;
    }
    // Moat-health evidence (docs/G1-MEASUREMENT.md §4, optional event): is the
    // owner-curation feature actually used? Fired only on a confirmed save.
    if (opts?.track !== false) {
      track("feedback_curated", {
        action: dismissed ? "dismiss" : "restore",
        kind: "comment",
        deck_id: deckId,
        role,
      });
    }
  }

  // Owner-only: set/clear the owner-edited text sent to the AI. The author's
  // original `body` is never mutated. Server action enforces ownership.
  async function editComment(
    id: string,
    ownerEditedBody: string | null,
    opts?: { track?: boolean },
  ) {
    if (!deckId) return;
    const snapshot = comments;
    setComments((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, owner_edited_body: ownerEditedBody } : c,
      ),
    );
    const res = await setCommentCurationAction(deckId, id, {
      owner_edited_body: ownerEditedBody,
    });
    if (!res.ok) {
      console.error("[useDeckComments] comment edit failed:", res.error);
      setComments(snapshot);
      return;
    }
    if (opts?.track !== false) {
      track("feedback_curated", {
        action: "edit",
        kind: "comment",
        deck_id: deckId,
        role,
      });
    }
  }

  return { comments, addComment, deleteComment, dismissComment, editComment };
}
