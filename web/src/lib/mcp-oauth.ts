// Stateless OAuth crypto for the MCP server's authorization layer.
//
// The MCP server is a *second* way into SlideHuddle (alongside the Chrome
// extension and the web app). Remote AI assistants like Claude connect over
// OAuth 2.1: they register, send the user through a login + consent flow, and
// receive an access token they attach to every tool call.
//
// To avoid adding new database tables (and the migrations / drift risk that
// come with them), every OAuth artefact here is a *self-describing, signed
// blob* rather than a row in a table:
//
//   - client_id          → carries the client's allowed redirect URIs
//   - authorization code  → carries the user, client, redirect URI and PKCE
//   - access token        → carries the user the AI is acting as
//
// Each blob is `base64url(JSON).base64url(HMAC-SHA256(...))`, signed with a
// server-only secret, with a `t` (type) tag so one kind can't be replayed as
// another, and an `e` (expiry, ms epoch) so old blobs stop working. This is the
// same construction as lib/update-token.ts, generalised.
//
// Trade-offs accepted for v1 (documented deliberately):
//   - No server-side revocation list: a leaked token is valid until it expires.
//     Expiries are kept short-ish to bound this; a revocation table can be added
//     later without changing the wire format.
//   - Authorization codes are single-use only by virtue of their 5-minute TTL,
//     not a used-codes table. PKCE (which we enforce) means a stolen code is
//     useless without the client's secret verifier, so replay risk is minimal.

import { createHmac, timingSafeEqual, createHash } from "crypto";

// --- Secret ---------------------------------------------------------------
// Prefer a dedicated secret; fall back to the service-role key (always present)
// so the server works out-of-the-box. Setting MCP_TOKEN_SECRET lets the OAuth
// signing key be rotated independently of Supabase.
function secret(): string {
  const s =
    process.env.MCP_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      "MCP_TOKEN_SECRET (or SUPABASE_SERVICE_ROLE_KEY) missing — required to " +
        "sign MCP OAuth tokens.",
    );
  }
  return s;
}

// --- Lifetimes ------------------------------------------------------------
const CLIENT_TTL_MS = 365 * 24 * 60 * 60 * 1000; // a registration lasts a year
const CODE_TTL_MS = 5 * 60 * 1000; // authorization code: 5 minutes
const ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // access token: 30 days
export const ACCESS_TTL_SECONDS = Math.floor(ACCESS_TTL_MS / 1000);

// --- Input bounds (reject absurd input rather than sign it) ---------------
const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 2048;
const MAX_FIELD_LENGTH = 4096;

// --- base64url helpers ----------------------------------------------------
function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(payloadB64: string): string {
  return b64url(createHmac("sha256", secret()).update(payloadB64).digest());
}

// Generic mint: JSON-encode the payload, sign it, return `payload.signature`.
function mint(payload: Record<string, unknown>): string {
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadB64}.${sign(payloadB64)}`;
}

// Generic verify: constant-time signature check, expiry check, and type-tag
// check. Returns the decoded payload or null. Never throws on bad input.
function verify<T extends { t: string; e: number }>(
  token: string | null | undefined,
  expectedType: T["t"],
): T | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const expectedSig = sign(payloadB64);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: T;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as T;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (payload.t !== expectedType) return null;
  if (typeof payload.e !== "number" || payload.e < Date.now()) return null;
  return payload;
}

// --- Client registration (DCR) -------------------------------------------
type ClientPayload = { t: "client"; ru: string[]; e: number };

/**
 * Mint a client_id for a dynamically-registered OAuth client. The id encodes
 * the client's allowed redirect URIs, so we can validate redirect_uri at
 * /authorize and /token without storing anything. Returns null if the redirect
 * URIs are missing/invalid.
 */
export function mintClientId(redirectUris: unknown): string | null {
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) return null;
  if (redirectUris.length > MAX_REDIRECT_URIS) return null;
  const uris: string[] = [];
  for (const u of redirectUris) {
    if (typeof u !== "string" || u.length === 0 || u.length > MAX_URI_LENGTH) {
      return null;
    }
    // Must be an absolute https URL (the one common exception some clients use
    // is an http://localhost loopback for local development).
    try {
      const parsed = new URL(u);
      const isHttps = parsed.protocol === "https:";
      const isLoopback =
        parsed.protocol === "http:" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
      if (!isHttps && !isLoopback) return null;
    } catch {
      return null;
    }
    uris.push(u);
  }
  return mint({ t: "client", ru: uris, e: Date.now() + CLIENT_TTL_MS });
}

/** Decode a client_id back to its allowed redirect URIs, or null if invalid. */
export function parseClientId(
  clientId: string | null | undefined,
): { redirectUris: string[] } | null {
  const p = verify<ClientPayload>(clientId, "client");
  if (!p || !Array.isArray(p.ru)) return null;
  return { redirectUris: p.ru };
}

/** True iff `redirectUri` is one this client registered (exact match). */
export function clientAllowsRedirect(
  clientId: string,
  redirectUri: string,
): boolean {
  const c = parseClientId(clientId);
  if (!c) return false;
  return c.redirectUris.includes(redirectUri);
}

// --- Authorization code ---------------------------------------------------
type CodePayload = {
  t: "code";
  c: string; // client_id
  u: string; // user id (Supabase auth.users.id)
  em: string | null; // user email (for display / convenience)
  ru: string; // redirect_uri the code was issued for
  cc: string; // PKCE code_challenge
  e: number;
};

export type AuthCodeData = {
  clientId: string;
  userId: string;
  email: string | null;
  redirectUri: string;
  codeChallenge: string;
};

/** Mint a short-lived authorization code bound to a user + client + PKCE. */
export function mintAuthCode(data: AuthCodeData): string {
  return mint({
    t: "code",
    c: data.clientId,
    u: data.userId,
    em: data.email ?? null,
    ru: data.redirectUri,
    cc: data.codeChallenge,
    e: Date.now() + CODE_TTL_MS,
  });
}

/** Decode + verify an authorization code, or null if invalid/expired. */
export function parseAuthCode(
  code: string | null | undefined,
): AuthCodeData | null {
  const p = verify<CodePayload>(code, "code");
  if (!p) return null;
  if (typeof p.c !== "string" || typeof p.u !== "string") return null;
  if (typeof p.ru !== "string" || typeof p.cc !== "string") return null;
  return {
    clientId: p.c,
    userId: p.u,
    email: typeof p.em === "string" ? p.em : null,
    redirectUri: p.ru,
    codeChallenge: p.cc,
  };
}

// --- Access token ---------------------------------------------------------
type AccessPayload = {
  t: "access";
  u: string;
  em: string | null;
  c: string;
  e: number;
};

export type AccessTokenData = {
  userId: string;
  email: string | null;
  clientId: string;
};

/** Mint the bearer access token the AI attaches to every MCP tool call. */
export function mintAccessToken(data: AccessTokenData): string {
  return mint({
    t: "access",
    u: data.userId,
    em: data.email ?? null,
    c: data.clientId,
    e: Date.now() + ACCESS_TTL_MS,
  });
}

/**
 * Decode + verify an access token. This is the ONLY source of caller identity
 * on a tool call — the user id is taken from here, never from anything the AI
 * passes in its arguments.
 */
export function parseAccessToken(
  token: string | null | undefined,
): AccessTokenData | null {
  const p = verify<AccessPayload>(token, "access");
  if (!p || typeof p.u !== "string" || typeof p.c !== "string") return null;
  return {
    userId: p.u,
    email: typeof p.em === "string" ? p.em : null,
    clientId: p.c,
  };
}

// --- PKCE -----------------------------------------------------------------
/**
 * Verify a PKCE code_verifier against the stored S256 challenge:
 *   challenge === base64url(SHA-256(verifier))
 * Constant-time comparison. S256 only (plain is disallowed by OAuth 2.1).
 */
export function verifyPkceS256(
  verifier: string | null | undefined,
  challenge: string,
): boolean {
  if (!verifier || typeof verifier !== "string") return false;
  if (verifier.length < 43 || verifier.length > 128) return false; // RFC 7636
  const computed = b64url(createHash("sha256").update(verifier).digest());
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Re-exported bound so route handlers can reuse the same cap as /api/slides.
export { MAX_FIELD_LENGTH };
