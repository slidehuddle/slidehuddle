import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { recomputeOwnedDeckMeta } from "@/lib/slide-store";

// One-shot backfill route. POST while signed in to re-derive title and
// slide_count for every deck you own, writing back any rows where the
// derivation has changed (e.g. after the slide_count counting fix).
//
// Hit from the browser console while signed in:
//   fetch("/api/recount-my-decks", { method: "POST" })
//     .then(r => r.json()).then(console.log)
//
// Or with curl, if you have a session cookie handy.
export async function POST() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await recomputeOwnedDeckMeta(user.id);
  return NextResponse.json(result);
}
