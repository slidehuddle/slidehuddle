// Deck write tokens authorise updating a specific deck from the extension,
// which POSTs from claude.ai and therefore has NO SlideHuddle session cookie
// (orphan-deck design, see docs/architecture.md).
//
// The token is minted **at create time** by /api/slides and returned to the
// extension, which stores it locally (chrome.storage), keyed by the Claude
// conversation. Only the browser that created the deck holds the token, so
// only the creator can update it — a recipient who merely has the share link
// never receives one.
//
// HMAC key: we reuse SUPABASE_SERVICE_ROLE_KEY (server-only, high entropy) so
// there's no new env var. The token is a bearer capability, not a session — it
// carries the deck id and an expiry, signed so it can't be forged.

import { createHmac, timingSafeEqual } from "crypto";

// Long-lived: the token is stored locally in the extension and only the
// creator has it, and decks get iterated over days/weeks. 180 days bounds the
// risk of a stale leaked token without getting in the way of normal use.
const TTL_MS = 180 * 24 * 60 * 60 * 1000;

type Payload = { d: string; e: number };

function secret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY missing — required to sign deck write tokens.",
    );
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payloadB64: string): string {
  return b64url(createHmac("sha256", secret()).update(payloadB64).digest());
}

/** Mint a token authorising updates to `deckId`. */
export function mintDeckWriteToken(deckId: string): string {
  const payload: Payload = { d: deckId, e: Date.now() + TTL_MS };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * True iff `token` is well-formed, unexpired, and scoped to `deckId`.
 */
export function verifyDeckWriteToken(
  token: string | null,
  deckId: string,
): boolean {
  if (!token || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payloadB64 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  // Constant-time signature comparison.
  const expectedSig = sign(payloadB64);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  let payload: Payload;
  try {
    const json = Buffer.from(
      payloadB64.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    payload = JSON.parse(json);
  } catch {
    return false;
  }

  if (!payload || typeof payload !== "object") return false;
  if (payload.d !== deckId) return false;
  if (typeof payload.e !== "number" || payload.e < Date.now()) return false;

  return true;
}
