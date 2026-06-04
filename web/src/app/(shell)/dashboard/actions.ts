"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase-server";
import { deleteDeck, removeSharedDeck } from "@/lib/slide-store";

// Server action: an OWNER permanently deletes a deck. The signed-in user is
// read from the request cookies (never trusted from the client); ownership is
// enforced inside deleteDeck. Cascade removes the deck for all collaborators.
export async function deleteOwnedDeckAction(
  deckId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const result = await deleteDeck(deckId, user.id);
  if (result.ok) revalidatePath("/dashboard");
  return result.ok ? { ok: true } : { ok: false, error: result.reason };
}

// Server action: a COLLABORATOR removes a shared deck from their own dashboard.
// Only their shared_decks link is deleted — the deck and everyone else are
// untouched.
export async function removeSharedDeckAction(
  deckId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const result = await removeSharedDeck(deckId, user.id);
  if (result.ok) revalidatePath("/dashboard");
  return result.ok ? { ok: true } : { ok: false, error: "error" };
}
