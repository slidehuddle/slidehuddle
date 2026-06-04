// RFC 9728 — OAuth 2.0 Protected Resource Metadata.
//
// This is the FIRST thing an MCP client (Claude) fetches. It answers: "this
// resource (the MCP server) is protected; here is the authorization server you
// must use to get a token." The client then reads that authorization server's
// own metadata to discover where to register, log in, and get a token.
//
// We point at ourselves as the authorization server (issuer = our origin); the
// AS metadata lives at /.well-known/oauth-authorization-server.

import {
  generateProtectedResourceMetadata,
  getPublicOrigin,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(req: Request): Response {
  const origin = getPublicOrigin(req);
  const metadata = generateProtectedResourceMetadata({
    // The issuer URL of our authorization server (matches `issuer` in the AS
    // metadata document).
    authServerUrls: [origin],
    // The protected resource identifier: the MCP endpoint itself.
    resourceUrl: `${origin}/mcp`,
  });
  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: {
      "content-type": "application/json",
      // Discovery is fetched cross-origin from the assistant's web client.
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

// Browser-based MCP clients preflight the metadata fetch.
export const OPTIONS = metadataCorsOptionsRequestHandler();
