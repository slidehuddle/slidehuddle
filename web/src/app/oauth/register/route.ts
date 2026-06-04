// RFC 7591 — OAuth 2.0 Dynamic Client Registration.
//
// Claude calls this automatically the first time it connects, so the user
// never has to copy/paste a client ID. The client sends its redirect URIs (the
// URL the assistant wants the user bounced back to after login); we mint a
// signed client_id that *encodes* those redirect URIs (see lib/mcp-oauth.ts),
// so later steps can validate redirect_uri without any stored state.
//
// This is a PUBLIC client (no secret): the client proves itself with PKCE at
// the token endpoint instead. So we return no client_secret.

import { mintClientId } from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "Content-Type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(
      { error: "invalid_client_metadata", error_description: "Body must be JSON." },
      400,
    );
  }

  const redirectUris = body.redirect_uris;
  const clientId = mintClientId(redirectUris);
  if (!clientId) {
    return json(
      {
        error: "invalid_redirect_uri",
        error_description:
          "redirect_uris must be a non-empty array of absolute https URLs " +
          "(http://localhost is allowed for local development).",
      },
      400,
    );
  }

  // Echo back a standards-shaped registration response. We don't persist
  // anything: the client_id is self-validating.
  const clientName =
    typeof body.client_name === "string" ? body.client_name : undefined;
  return json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      ...(clientName ? { client_name: clientName } : {}),
    },
    201,
  );
}
