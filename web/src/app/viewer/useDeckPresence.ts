"use client";

// PRESENCE — live "who has this deck open right now" (2026-07-05, the parked
// presence system). Supabase Realtime Presence: everyone signed-in viewing a
// deck joins the room `presence:deck:{id}` and announces their user id; the
// room continuously syncs who's in it and drops anyone whose connection dies —
// so the green "online now" dot appears/disappears within seconds with no
// explicit leave action and NOTHING stored (no tables, no schema; presence is
// purely live socket state).
//
// PRIVACY (the parked item's "privacy think"):
//   • The announcement carries the USER ID ONLY — never an email. Emails stay
//     server-resolved behind the signed-in participant gate as ever.
//   • Anonymous link-holders are NOT announced at all — they stay
//     uncounted-by-identity (the hook doesn't even join without a userId).
//   • Caveat, judged acceptable for v1 and documented in BEHAVIOURS: presence
//     rooms aren't RLS-gated like table data — the room is protected by the
//     deck id being unguessable (the same capability-URL model as the share
//     link), and the payload is a bare user id. The stricter Realtime
//     Authorization upgrade is possible later (security-relevant, own change).
//
// Mirrors useDeckComments' channel hygiene: silent-failure logging + re-handing
// the socket a fresh token when the session refreshes (a tab left open past
// the JWT's ~1h expiry would otherwise silently drop off the room).
//
// FRESHNESS TTL (found in verification, 2026-07-05): a CLEAN leave (tab close,
// navigation) drops off the room within seconds — but an ABRUPT death (kill,
// crash, laptop lid) can leave a phantom entry on the server for minutes
// before its reaper notices. So presence is self-healing at the client: every
// announcement carries an `at` timestamp, re-announced every 30s, and readers
// IGNORE entries older than 75s — a crashed viewer's dot clears in ≤ ~90s no
// matter what the server does. (The 75s window dwarfs realistic clock skew.)

import { useEffect, useState } from "react";

const TRACK_INTERVAL_MS = 30_000; // re-announce "still here" this often
const STALE_MS = 75_000; // ignore entries not refreshed within this window
const PRUNE_INTERVAL_MS = 15_000; // re-check staleness even with no sync event

/** The set of user ids currently viewing this deck (yourself included).
 *  Empty for anonymous viewers (they never join) and while connecting. */
export function useDeckPresence(
  deckId: string | null,
  currentUserId: string | null,
): Set<string> {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!deckId || !currentUserId) return;
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
      // Presence key = the user id: one entry per person (a second tab by the
      // same person merges into the same key, so the roster shows people, not
      // tabs).
      const channel = supabase.channel(`presence:deck:${deckId}`, {
        config: { presence: { key: currentUserId } },
      });

      // presenceState() keys are the presence keys — i.e. user ids; each key
      // holds the metas it announced (our `at` stamp). ONLY entries with a
      // fresh numeric stamp count as online — every client has stamped from
      // day one, so a stamp-less entry can only be a server-side phantom.
      const recompute = () => {
        const now = Date.now();
        const fresh = Object.entries(
          channel.presenceState<{ at?: number }>(),
        )
          .filter(([, metas]) =>
            metas.some(
              (m) => typeof m.at === "number" && now - m.at < STALE_MS,
            ),
          )
          .map(([key]) => key);
        setOnlineIds((prev) => {
          if (prev.size === fresh.length && fresh.every((id) => prev.has(id)))
            return prev; // unchanged → no re-render
          return new Set(fresh);
        });
      };

      channel.on("presence", { event: "sync" }, recompute);
      channel.subscribe(async (status, err) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: currentUserId, at: Date.now() });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(
            "[useDeckPresence] realtime channel:",
            status,
            err?.message,
          );
        }
      });
      // Heartbeat re-announce + staleness sweep (a stale phantom generates no
      // sync event of its own, so the sweep is what clears it).
      const trackTimer = setInterval(() => {
        void channel.track({ user_id: currentUserId, at: Date.now() });
      }, TRACK_INTERVAL_MS);
      const pruneTimer = setInterval(recompute, PRUNE_INTERVAL_MS);
      const { data: authSub } = supabase.auth.onAuthStateChange(
        (_event, freshSession) => {
          if (freshSession)
            supabase.realtime.setAuth(freshSession.access_token);
        },
      );
      cleanup = () => {
        clearInterval(trackTimer);
        clearInterval(pruneTimer);
        authSub.subscription.unsubscribe();
        supabase.removeChannel(channel);
      };
    })();
    return () => {
      cancelled = true;
      cleanup();
      setOnlineIds(new Set());
    };
  }, [deckId, currentUserId]);

  return onlineIds;
}
