import { NextRequest, NextResponse } from "next/server";
import {
  clearAddressedFeedback,
  countSlides,
  dependsOnClaudeDesignSystem,
  storeSlides,
  updateDeck,
} from "@/lib/slide-store";
import { getSupabaseServer } from "@/lib/supabase-server";
import { mintDeckWriteToken, verifyDeckWriteToken } from "@/lib/update-token";
import { checkRateLimit } from "@/lib/rate-limit";

// Header the extension sends a deck write token in (see lib/update-token.ts).
// Lower-cased for case-insensitive header lookup.
const UPDATE_TOKEN_HEADER = "x-slidehuddle-update-token";

// Hard cap on captured slide HTML. Claude decks we've seen are well under
// 500KB; 2MB leaves comfortable headroom for image-heavy decks while
// preventing megabyte-scale junk inserts into Supabase.
const MAX_HTML_BYTES = 2 * 1024 * 1024;

// Per-IP rate limit on capture/update. This endpoint is gated by the origin
// allowlist, but a non-browser client can forge an Origin header, so the
// allowlist alone doesn't stop a script from flooding the DB with decks. A
// generous ceiling stops that abuse without getting in a real user's way:
// capturing a deck is a deliberate button click — even a busy session is a
// handful per minute, far under this. Tunable via SLIDES_RATE_LIMIT_PER_MIN.
// NOTE: the limiter is in-memory and per-serverless-instance (see
// lib/rate-limit.ts) — a real speed bump against a single hammering client, not
// a hard global cap. Swap the store for Redis/Supabase if a global cap is ever
// required.
const RATE_LIMIT_PER_MIN = (() => {
  const n = Number.parseInt(process.env.SLIDES_RATE_LIMIT_PER_MIN ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
})();
const RATE_WINDOW_MS = 60_000;

// Best-effort client IP from the proxy headers Vercel sets. Falls back to a
// single shared bucket ("unknown") when no IP header is present — that's a
// stricter-than-intended grouping, which is the safe direction for a limiter.
function clientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

// Only the extension (running on claude.ai or one of Claude's user/MCP
// content origins) should be able to POST. Anything else gets no CORS
// headers back, so browsers block the cross-origin request.
const ALLOWED_ORIGINS = new Set([
  "https://claude.ai",
  "https://a.claude.ai",
  "https://www.claude.ai",
]);

// Additionally allow any *.claudeusercontent.com / *.claudemcpcontent.com
// origin (these vary per artifact preview). Match by suffix.
const ALLOWED_ORIGIN_SUFFIXES = [
  ".claudeusercontent.com",
  ".claudemcpcontent.com",
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return ALLOWED_ORIGIN_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null): HeadersInit {
  // Only reflect the origin if it's on our allowlist. Otherwise omit the
  // CORS headers entirely so the browser blocks the response.
  if (!isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin as string,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-SlideHuddle-Update-Token",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  if (!isAllowedOrigin(origin)) {
    return NextResponse.json(
      { error: "Origin not allowed" },
      { status: 403 },
    );
  }

  // Throttle by IP before we do any work (parse body, hit Supabase). Keyed
  // separately from the MCP limiter so the two don't share buckets.
  const rl = checkRateLimit(
    `slides:${clientIp(request)}`,
    RATE_LIMIT_PER_MIN,
    RATE_WINDOW_MS,
  );
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Too many requests",
        detail: `Rate limit is ${rl.limit} per minute. Retry in ${rl.retryAfterSec}s.`,
      },
      {
        status: 429,
        headers: {
          ...headers,
          "Retry-After": String(rl.retryAfterSec),
          "RateLimit-Limit": String(rl.limit),
          "RateLimit-Remaining": String(rl.remaining),
        },
      },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_HTML_BYTES) {
    return NextResponse.json(
      { error: "Slide HTML exceeds size limit" },
      { status: 413, headers },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  let html: string | undefined;

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    html = body?.html;
  } else if (contentType.includes("text/html") || contentType.includes("text/plain")) {
    html = await request.text();
  } else {
    return NextResponse.json(
      { error: "Unsupported Content-Type" },
      { status: 415, headers },
    );
  }

  if (!html || typeof html !== "string" || html.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing slide HTML in request body" },
      { status: 400, headers },
    );
  }

  // Belt-and-braces: if the client lied about Content-Length, the body
  // may still be bigger than the cap once buffered. Reject after the fact.
  if (html.length > MAX_HTML_BYTES) {
    return NextResponse.json(
      { error: "Slide HTML exceeds size limit" },
      { status: 413, headers },
    );
  }

  // Capture-shape filter. We accept either:
  //   - multi-slide decks (2+ slide-shaped elements), or
  //   - self-contained single-page HTML artifacts.
  // We reject inline-chat-only mockups that depend on Claude's design-
  // system CSS variables (bg-bg-100, font-ui, etc.) defined on claude.ai
  // itself — those capture cleanly but render with broken sizing, missing
  // colors, and wrong proportions anywhere outside the chat. A real
  // standalone artifact has all its CSS inline and doesn't reference
  // Claude-specific class names.
  const slideCount = countSlides(html) ?? 0;
  const isMultiSlideDeck = slideCount >= 2;
  const needsClaudeContext = dependsOnClaudeDesignSystem(html);
  if (!isMultiSlideDeck && needsClaudeContext) {
    return NextResponse.json(
      {
        error: "Sorry — not a slide deck",
        detail:
          "This artifact relies on Claude's design-system styles and won't render correctly outside the chat. SlideHuddle accepts multi-slide decks and self-contained single-page HTML artifacts.",
      },
      { status: 422, headers },
    );
  }

  const viewerOrigin = request.nextUrl.origin;

  // ---- Update mode -------------------------------------------------------
  // `?update=<deckId>` saves `html` as the next version of an EXISTING deck
  // (same id, same share link) instead of creating a new one. The extension
  // POSTs from claude.ai with no session cookie, so we authorise via a
  // capability token minted by the viewer for the deck owner — NOT by session.
  const updateId = request.nextUrl.searchParams.get("update");
  if (updateId) {
    const token = request.headers.get(UPDATE_TOKEN_HEADER);
    if (!verifyDeckWriteToken(token, updateId)) {
      return NextResponse.json(
        {
          error: "Update not authorized",
          detail:
            "The deck write token is missing, expired, or not valid for this " +
            "deck. This deck can only be updated from the browser that created it.",
        },
        { status: 403, headers },
      );
    }
    try {
      const { version, title } = await updateDeck(updateId, html);
      // The revision was made in response to the deck's feedback, so mark the
      // items it addressed (requested slides + flags) as RESOLVED — the record
      // is kept (auditable) but they stop showing as open, so they aren't
      // re-worked next round. Comments are version-scoped, so they fall off the
      // new version on their own. Mirrors the MCP update_deck path
      // (mcp/route.ts) for parity. Best-effort: clearAddressedFeedback
      // logs-and-continues and never throws, so a resolution hiccup can never
      // undo the already-saved revision.
      const resolved = await clearAddressedFeedback(updateId);
      return NextResponse.json(
        {
          id: updateId,
          url: `${viewerOrigin}/viewer?id=${updateId}`,
          version,
          title,
          resolvedFeedbackCount: resolved.stubs + resolved.flags,
        },
        { status: 200, headers },
      );
    } catch (err) {
      console.error("[/api/slides] update failed:", err);
      const message =
        err instanceof Error ? err.message : "Failed to update deck";
      // "Deck not found" is a client problem (stale token / deleted deck);
      // everything else is treated as a server error.
      const status = /not found/i.test(message) ? 404 : 500;
      return NextResponse.json({ error: message }, { status, headers });
    }
  }

  // ---- Create mode -------------------------------------------------------
  // The extension passes the Claude conversation id (claude.ai/chat/<id>) so
  // the deck is bound to its source conversation.
  const conversationId = request.nextUrl.searchParams.get("conversation");

  // Best-effort auth: if the caller has a SlideHuddle session cookie,
  // attach their user id. Extension POSTs from claude.ai won't have one —
  // those decks stay as orphans (user_id NULL), still viewable by link
  // but absent from any dashboard. See docs/architecture.md.
  let userId: string | null = null;
  try {
    const supabase = await getSupabaseServer();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch (err) {
    console.warn("[/api/slides] auth lookup failed, continuing as anon:", err);
  }

  let id: string;
  let title: string | null;
  try {
    ({ id, title } = await storeSlides(html, { userId, conversationId }));
  } catch (err) {
    console.error("[/api/slides] store failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to store deck",
      },
      { status: 500, headers },
    );
  }

  const viewerUrl = `${viewerOrigin}/viewer?id=${id}`;
  // The write token authorises future updates to this deck. The extension
  // stores it locally against the conversation; only the creating browser
  // gets it, so only the creator can update.
  const writeToken = mintDeckWriteToken(id);

  return NextResponse.json(
    {
      id,
      url: viewerUrl,
      version: 1,
      title,
      writeToken,
      conversationId: conversationId ?? null,
    },
    { status: 201, headers },
  );
}
