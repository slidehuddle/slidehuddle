"use server";

import { getSupabaseServer } from "@/lib/supabase-server";
import { deleteStub } from "@/lib/slide-store";

// Server action: delete a requested (stub) slide. The authenticated user is
// read from the request cookies (never trusted from the client), then the
// "requester OR deck owner" rule is enforced inside deleteStub using the
// service-role client. Returns a plain result the client can branch on.
export async function deleteStubAction(
  deckId: string,
  stubId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_signed_in" };
  }

  const result = await deleteStub(deckId, stubId, user.id);
  return result.ok ? { ok: true } : { ok: false, error: result.reason };
}
