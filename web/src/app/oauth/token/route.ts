// OAuth 2.1 token endpoint.
//
// The assistant calls this after the user approves, swapping the one-time
// authorization code (plus its PKCE verifier) for an access token. We:
//   1. require grant_type=authorization_code
//   2. decode + verify the code (signature, expiry, type)
//   3. check client_id and redirect_uri match what the code was issued for
//   4. verify PKCE: SHA-256(code_verifier) must equal the stored challenge
//   5. mint a bearer access token carrying the user id
//
// Public client: no client_secret is required (PKCE is the proof instead).

import {
  parseAuthCode,
  verifyPkceS256,
  mintAccessToken,
  ACCESS_TTL_SECONDS,
} from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });
}

function oauthError(error: string, description: string, status = 400): Response {
  return json({ error, error_description: description }, status);
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request): Promise<Response> {
  // The token endpoint takes application/x-www-form-urlencoded per OAuth, but
  // accept JSON too for resilience across clients.
  let params: URLSearchParams;
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as Record<string, unknown>;
      params = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        if (typeof v === "string") params.set(k, v);
      }
    } else {
      const form = await req.formData();
      params = new URLSearchParams();
      for (const [k, v] of form.entries()) {
        if (typeof v === "string") params.set(k, v);
      }
    }
  } catch {
    return oauthError("invalid_request", "Could not parse request body.");
  }

  const grantType = params.get("grant_type");
  if (grantType !== "authorization_code") {
    return oauthError(
      "unsupported_grant_type",
      "Only the authorization_code grant is supported.",
    );
  }

  const code = params.get("code");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const codeVerifier = params.get("code_verifier");

  const decoded = parseAuthCode(code);
  if (!decoded) {
    return oauthError(
      "invalid_grant",
      "The authorization code is invalid or has expired.",
    );
  }
  if (!clientId || clientId !== decoded.clientId) {
    return oauthError("invalid_client", "client_id does not match the code.");
  }
  if (!redirectUri || redirectUri !== decoded.redirectUri) {
    return oauthError(
      "invalid_grant",
      "redirect_uri does not match the authorization request.",
    );
  }
  if (!verifyPkceS256(codeVerifier, decoded.codeChallenge)) {
    return oauthError("invalid_grant", "PKCE verification failed.");
  }

  const accessToken = mintAccessToken({
    userId: decoded.userId,
    email: decoded.email,
    clientId: decoded.clientId,
  });

  return json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_SECONDS,
      scope: "slidehuddle",
    },
    200,
  );
}
