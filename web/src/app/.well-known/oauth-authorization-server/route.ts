// RFC 8414 — OAuth 2.0 Authorization Server Metadata.
//
// After reading the protected-resource metadata, the client fetches this to
// learn the three URLs it needs:
//   - registration_endpoint : where to dynamically register itself (RFC 7591)
//   - authorization_endpoint: where to send the user to log in + consent
//   - token_endpoint        : where to swap an authorization code for a token
//
// We are a *public client* authorization server: clients authenticate with
// PKCE (S256), not a client secret — so token_endpoint_auth_methods_supported
// is ["none"]. This matches how Claude connects to remote MCP servers.

import { getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(req: Request): Response {
  const origin = getPublicOrigin(req);
  const metadata = {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["slidehuddle"],
  };
  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
