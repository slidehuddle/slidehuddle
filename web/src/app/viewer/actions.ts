"use server";

import { getSupabaseServer } from "@/lib/supabase-server";
import {
  deleteStub,
  editStubFields,
  setCommentCuration,
  setStubCuration,
  setFlagCuration,
} from "@/lib/slide-store";

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

// Server action: owner curation of a comment (dismiss/restore and/or owner
// edit). User is read from cookies; deck-owner enforcement happens inside
// setCommentCuration with the service-role client.
export async function setCommentCurationAction(
  deckId: string,
  commentId: string,
  patch: { dismissed?: boolean; owner_edited_body?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_signed_in" };
  }

  const result = await setCommentCuration(deckId, commentId, user.id, patch);
  return result.ok ? { ok: true } : { ok: false, error: result.reason };
}

// Server action: edit a requested (stub) slide's title/subtitle/body. Allowed
// for the requester OR the deck owner — enforcement lives inside editStubFields
// with the service-role client; the user is read from cookies, never trusted
// from the client.
export async function editStubFieldsAction(
  deckId: string,
  stubId: string,
  fields: { title: string; subtitle: string; body: string },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_signed_in" };
  }

  const result = await editStubFields(deckId, stubId, user.id, fields);
  return result.ok ? { ok: true } : { ok: false, error: result.reason };
}

// Server action: owner curation of a requested (stub) slide.
export async function setStubCurationAction(
  deckId: string,
  stubId: string,
  patch: { dismissed?: boolean; owner_edited_body?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_signed_in" };
  }

  const result = await setStubCuration(deckId, stubId, user.id, patch);
  return result.ok ? { ok: true } : { ok: false, error: result.reason };
}

// Server action: owner curation of a removal flag.
export async function setFlagCurationAction(
  deckId: string,
  flagId: string,
  patch: { dismissed?: boolean; owner_edited_reason?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_signed_in" };
  }

  const result = await setFlagCuration(deckId, flagId, user.id, patch);
  return result.ok ? { ok: true } : { ok: false, error: result.reason };
}
