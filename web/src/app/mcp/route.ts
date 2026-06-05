// The SlideHuddle MCP server endpoint.
//
// This is the public "front door" for AI assistants. It speaks MCP over
// Streamable HTTP (POST JSON-RPC). Every request is authenticated by the
// bearer access token our OAuth layer issued (see lib/mcp-oauth.ts and
// app/oauth/*). The authenticated user id is read ONLY from that token — never
// from anything the assistant passes as a tool argument.
//
// The tools are thin wrappers over the same functions the web app and the
// Chrome-extension API route already use (lib/slide-store.ts) and the same
// curated-feedback formatting as the web "Send to Claude" button
// (app/viewer/feedback-prompt.ts), so there is one implementation of each
// capability and the paths can't drift.
//
// Mounted at /mcp: mcp-handler matches requests whose path equals its
// streamableHttpEndpoint (default "/mcp"), so this file's route IS that path.

import { z } from "zod";
import {
  createMcpHandler,
  withMcpAuth,
  getPublicOrigin,
} from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  storeSlides,
  updateDeck,
  getDeckMeta,
  getDecksForOwner,
  getStoredSlides,
  getCommentsForDeck,
  getStubsForDeck,
  getFlagsForDeck,
  clearAddressedFeedback,
  countSlides,
  dependsOnClaudeDesignSystem,
  type DeckMeta,
} from "@/lib/slide-store";
import {
  selectCuratedFeedback,
  buildFeedbackPrompt,
} from "@/app/viewer/feedback-prompt";
import { parseAccessToken } from "@/lib/mcp-oauth";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Same hard cap on slide HTML as the extension's /api/slides route, so all
// entry points reject the same oversized payloads.
const MAX_HTML_BYTES = 2 * 1024 * 1024;

// What we stash in the verified token's `extra`, recovered inside each tool.
type AuthExtra = { userId: string; email: string | null; origin: string };

function getAuthExtra(authInfo: AuthInfo | undefined): AuthExtra | null {
  const extra = authInfo?.extra as Partial<AuthExtra> | undefined;
  if (!extra || typeof extra.userId !== "string") return null;
  return {
    userId: extra.userId,
    email: typeof extra.email === "string" ? extra.email : null,
    origin: typeof extra.origin === "string" ? extra.origin : "",
  };
}

function textResult(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true } : {}),
  };
}

// If the assistant supplied a title but its HTML has no <title>, inject one so
// the deck is named the way the assistant intended. The web app derives a
// deck's title from <title> (then <h1>), so this is enough — we don't touch
// slide-store's derivation logic.
function ensureTitle(html: string, title: string): string {
  if (!title.trim() || /<title[\s>]/i.test(html)) return html;
  const safe = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const tag = `<title>${safe}</title>`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`);
  }
  return `${tag}${html}`;
}

// Shared slide-HTML validation for create + update. Returns an error message,
// or null if the HTML is acceptable. Mirrors /api/slides' checks.
function validateSlidesHtml(html: string): string | null {
  if (!html.trim()) return "`slides` is empty.";
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    return "Slide HTML exceeds the 2MB size limit.";
  }
  // Reject single-page artifacts that depend on Claude's design-system CSS
  // (they render broken outside the chat). Multi-slide decks and self-contained
  // pages pass.
  const slideCount = countSlides(html) ?? 0;
  if (slideCount < 2 && dependsOnClaudeDesignSystem(html)) {
    return (
      "This HTML relies on Claude's design-system styles and won't render " +
      "correctly as a standalone deck. Provide a multi-slide deck or a " +
      "self-contained single-page HTML artifact (all CSS inline)."
    );
  }
  return null;
}

// Owner-only deck lookup. Returns the deck meta only if it exists AND the
// caller owns it; otherwise null. We deliberately don't distinguish "no such
// deck" from "not yours", so a caller can't probe which deck ids exist. The
// owner id comes from the verified token — never from the tool arguments.
async function loadOwnedDeck(
  deckId: string,
  userId: string,
): Promise<DeckMeta | null> {
  if (!deckId) return null;
  const meta = await getDeckMeta(deckId);
  if (!meta || meta.user_id !== userId) return null;
  return meta;
}

// Count feedback items the same way the web "Send to Claude" button does: one
// header line plus one line per item, so the count stays in lockstep with the
// text we return.
function countFeedbackItems(prompt: string | null): number {
  if (!prompt) return 0;
  return prompt.split("\n").length - 1;
}

// Load + curate a deck's feedback the SINGLE canonical way (same as the web
// "Send to Claude" button): comments for the given version, plus per-deck stubs
// and flags, run through selectCuratedFeedback (drops dismissed, applies owner
// edits). Returns the curated set, or { failed: true } on a real load error so
// callers never mistake a failure for "no feedback". Shared by get_feedback,
// list_decks, and get_deck so the three can't drift.
type CuratedFeedback = ReturnType<typeof selectCuratedFeedback>;
async function loadCuratedFeedback(
  deckId: string,
  userId: string,
  version: number,
): Promise<{ curated: CuratedFeedback | null; failed: boolean }> {
  const [comments, stubs, flags] = await Promise.all([
    getCommentsForDeck(deckId, userId, version),
    getStubsForDeck(deckId),
    getFlagsForDeck(deckId),
  ]);
  if (comments.failed || stubs.failed || flags.failed) {
    return { curated: null, failed: true };
  }
  return {
    curated: selectCuratedFeedback(comments.rows, flags.rows, stubs.rows),
    failed: false,
  };
}

// Format an ISO timestamp as a plain YYYY-MM-DD date (UTC) for tool output;
// returns "unknown" for missing/invalid values.
function formatDateOnly(iso: string | null): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toISOString().slice(0, 10);
}

const handler = createMcpHandler(
  (server) => {
    // --- create_deck ------------------------------------------------------
    server.registerTool(
      "create_deck",
      {
        title: "Create a SlideHuddle deck",
        description:
          "Create a new SlideHuddle deck from slide HTML you generated, owned " +
          "by the authenticated user. Accepts the same HTML formats the web " +
          "app renders (a multi-slide deck, or a self-contained single-page " +
          "HTML artifact). Returns the deck_id and a public share_url.",
        inputSchema: {
          title: z
            .string()
            .max(200)
            .describe(
              "A title for the deck. Used to name it when the HTML has no " +
                "<title> of its own.",
            ),
          slides: z.string().min(1).describe("The slide deck as HTML."),
        },
      },
      async (args, extra) => {
        const auth = getAuthExtra(extra.authInfo);
        if (!auth) return textResult("Not authenticated.", true);

        const title = String(args.title ?? "");
        let html = String(args.slides ?? "");
        const invalid = validateSlidesHtml(html);
        if (invalid) return textResult(invalid, true);

        html = ensureTitle(html, title);

        try {
          const { id, title: storedTitle } = await storeSlides(html, {
            userId: auth.userId,
          });
          const shareUrl = `${auth.origin}/viewer?id=${id}`;
          return textResult(
            `Created deck "${storedTitle ?? title ?? "Untitled"}".\n` +
              `deck_id: ${id}\n` +
              `share_url: ${shareUrl}`,
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to create deck";
          console.error("[mcp:create_deck] store failed:", err);
          return textResult(`Failed to create deck: ${message}`, true);
        }
      },
    );

    // --- get_feedback -----------------------------------------------------
    server.registerTool(
      "get_feedback",
      {
        title: "Get curated deck feedback",
        description:
          "Return the owner-curated feedback for one of your decks so you can " +
          "revise it: only included items, with the owner's edits applied and " +
          "dismissed items excluded. Comments are grouped by slide; requested " +
          "slides include title/subtitle/body; removal flags include reasons. " +
          "Owner only.",
        inputSchema: {
          deck_id: z
            .string()
            .min(1)
            .describe(
              "The deck's id (from create_deck, list_decks, or the share URL).",
            ),
        },
      },
      async (args, extra) => {
        const auth = getAuthExtra(extra.authInfo);
        if (!auth) return textResult("Not authenticated.", true);

        const deckId = String(args.deck_id ?? "");
        const meta = await loadOwnedDeck(deckId, auth.userId);
        if (!meta) {
          return textResult("Deck not found, or you are not its owner.", true);
        }

        // Comments are version-scoped; feedback is for the CURRENT version.
        // Stubs and flags are per-deck. Same canonical load + curation as the
        // web "Send to Claude" button.
        const { curated, failed } = await loadCuratedFeedback(
          deckId,
          auth.userId,
          meta.version,
        );
        if (failed || !curated) {
          return textResult(
            "Couldn't load all of this deck's feedback right now — please try " +
              "again.",
            true,
          );
        }

        const prompt = buildFeedbackPrompt(curated);
        const count = countFeedbackItems(prompt);

        if (!prompt) {
          return textResult(
            `No feedback to act on yet for "${meta.title ?? "Untitled"}" ` +
              `(0 items).`,
          );
        }
        return textResult(`(${count} feedback item(s))\n\n${prompt}`);
      },
    );

    // --- update_deck ------------------------------------------------------
    server.registerTool(
      "update_deck",
      {
        title: "Save a revised deck version",
        description:
          "Save revised slide HTML as a NEW version of an existing deck. Keeps " +
          "the same deck id and share link, increments the version number, and " +
          "preserves prior versions in history. Owner only. Returns the new " +
          "version number and the (unchanged) share_url.",
        inputSchema: {
          deck_id: z.string().min(1).describe("The deck to update."),
          slides: z
            .string()
            .min(1)
            .describe("The full revised deck as HTML (replaces the latest version)."),
        },
      },
      async (args, extra) => {
        const auth = getAuthExtra(extra.authInfo);
        if (!auth) return textResult("Not authenticated.", true);

        const deckId = String(args.deck_id ?? "");
        const html = String(args.slides ?? "");

        // Enforce ownership BEFORE updating — updateDeck itself doesn't check
        // (the extension authorises via a write token instead).
        const meta = await loadOwnedDeck(deckId, auth.userId);
        if (!meta) {
          return textResult("Deck not found, or you are not its owner.", true);
        }
        const invalid = validateSlidesHtml(html);
        if (invalid) return textResult(invalid, true);

        try {
          const { version, title } = await updateDeck(deckId, html, {
            userId: auth.userId,
          });
          // The revision was made in response to the deck's feedback, so mark
          // the items it addressed (requested slides + flags) as RESOLVED — the
          // record is kept (auditable) but they stop showing as open, so they're
          // not re-worked next round. Comments are version-scoped, so they
          // already fall out of the new version automatically. Best-effort: a
          // resolution hiccup must not undo the saved revision.
          const resolved = await clearAddressedFeedback(deckId);
          const resolvedCount = resolved.stubs + resolved.flags;
          const resolvedNote =
            resolvedCount > 0
              ? `\nresolved ${resolvedCount} addressed feedback item(s) ` +
                `(requested slides/flags) so v${version} starts clean`
              : "";
          const shareUrl = `${auth.origin}/viewer?id=${deckId}`;
          return textResult(
            `Saved "${title ?? "Untitled"}" as version ${version}.\n` +
              `version: ${version}\n` +
              `share_url: ${shareUrl} (unchanged)` +
              resolvedNote,
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to update deck";
          console.error("[mcp:update_deck] update failed:", err);
          return textResult(`Failed to update deck: ${message}`, true);
        }
      },
    );

    // --- list_decks (read-only) ------------------------------------------
    server.registerTool(
      "list_decks",
      {
        title: "List your SlideHuddle decks",
        description:
          "List the decks owned by the authenticated user, most recently " +
          "updated first, so you can find a deck's id no matter how it was " +
          "created (the Chrome extension, the MCP, or another conversation). " +
          "Read-only — never creates, changes, or deletes anything. For each " +
          "deck it returns: deck_id, title, version, pending_feedback_count " +
          "(included, not-yet-sent feedback items), last_updated, and the " +
          "source Claude conversation link when one is known. Owner only.",
        inputSchema: {},
      },
      async (_args, extra) => {
        const auth = getAuthExtra(extra.authInfo);
        if (!auth) return textResult("Not authenticated.", true);

        const { rows, failed } = await getDecksForOwner(auth.userId);
        // A load error must NOT look like "no decks" — surface it explicitly.
        if (failed) {
          return textResult(
            "Couldn't load your decks right now — please try again.",
            true,
          );
        }
        if (rows.length === 0) {
          return textResult("You don't have any decks yet.");
        }

        // pending_feedback_count per deck via the same curated path as
        // get_feedback. null = couldn't load → shown as "unknown", never a
        // silent 0.
        const pendingCounts = await Promise.all(
          rows.map(async (deck) => {
            const { curated, failed: feedbackFailed } =
              await loadCuratedFeedback(deck.id, auth.userId, deck.version);
            if (feedbackFailed || !curated) return null;
            return countFeedbackItems(buildFeedbackPrompt(curated));
          }),
        );

        const blocks = rows.map((deck, i) => {
          const pending = pendingCounts[i];
          const pendingText =
            pending === null ? "unknown (couldn't load feedback)" : `${pending}`;
          const convo = deck.conversation_id
            ? `\n   conversation: https://claude.ai/chat/${deck.conversation_id}`
            : "";
          return (
            `${i + 1}. ${deck.title ?? "Untitled"} — v${deck.version} · ` +
            `updated ${formatDateOnly(deck.updated_at ?? deck.created_at)} · ` +
            `pending_feedback_count: ${pendingText}\n` +
            `   deck_id: ${deck.id}` +
            convo
          );
        });

        return textResult(
          `Your decks (${rows.length}), most recent first:\n\n` +
            blocks.join("\n\n"),
        );
      },
    );

    // --- get_deck (read-only) --------------------------------------------
    server.registerTool(
      "get_deck",
      {
        title: "Get a deck summary",
        description:
          "Return a summary of one of your decks: title, version, slide_count, " +
          "share_url, and a feedback summary (counts of comments, requested " +
          "slides, and removal flags that are currently included). Read-only. " +
          "Owner only — if the deck doesn't exist or isn't yours, returns a " +
          "neutral 'not found' (it won't reveal whether the id exists).",
        inputSchema: {
          deck_id: z
            .string()
            .uuid()
            .describe("The deck's id (a UUID from list_decks or the share URL)."),
        },
      },
      async (args, extra) => {
        const auth = getAuthExtra(extra.authInfo);
        if (!auth) return textResult("Not authenticated.", true);

        const deckId = String(args.deck_id ?? "");
        // Same owner-only gate as get_feedback/update_deck. Identical response
        // whether the deck is missing, owned by someone else, or merely shared
        // — so this can't be used to probe which deck ids exist.
        const meta = await loadOwnedDeck(deckId, auth.userId);
        if (!meta) {
          return textResult("Deck not found, or you are not its owner.", true);
        }

        const { curated, failed } = await loadCuratedFeedback(
          deckId,
          auth.userId,
          meta.version,
        );
        if (failed || !curated) {
          return textResult(
            "Couldn't load this deck's feedback right now — please try again.",
            true,
          );
        }

        const shareUrl = `${auth.origin}/viewer?id=${deckId}`;
        return textResult(
          `Deck "${meta.title ?? "Untitled"}"\n` +
            `version: ${meta.version}\n` +
            `slide_count: ${meta.slide_count ?? "unknown"}\n` +
            `share_url: ${shareUrl}\n` +
            `feedback (included items):\n` +
            `  comments: ${curated.comments.length}\n` +
            `  requested_slides: ${curated.stubs.length}\n` +
            `  flags: ${curated.flags.length}`,
        );
      },
    );

    // --- get_deck_slides (read-only) -------------------------------------
    server.registerTool(
      "get_deck_slides",
      {
        title: "Read a deck's current slides",
        description:
          "Return the CURRENT version's slide HTML for one of your decks, plus " +
          "its version and title — so you can revise the actual deck instead of " +
          "regenerating it blind. Read-only — never creates, changes, or deletes " +
          "anything. Owner only; if the deck doesn't exist or isn't yours, " +
          "returns a neutral 'not found' (it won't reveal whether the id exists).",
        inputSchema: {
          deck_id: z
            .string()
            .uuid()
            .describe("The deck's id (a UUID from list_decks or the share URL)."),
        },
      },
      async (args, extra) => {
        const auth = getAuthExtra(extra.authInfo);
        if (!auth) return textResult("Not authenticated.", true);

        const deckId = String(args.deck_id ?? "");
        // Same owner-only gate + identical not-found as the other read tools.
        const meta = await loadOwnedDeck(deckId, auth.userId);
        if (!meta) {
          return textResult("Deck not found, or you are not its owner.", true);
        }

        const { html, failed } = await getStoredSlides(deckId);
        // A real load error must NOT look like "no slides".
        if (failed) {
          return textResult(
            "Couldn't load this deck's slides right now — please try again.",
            true,
          );
        }
        if (html == null) {
          // Owned deck with no stored HTML is a data anomaly, not "empty input".
          return textResult(
            "This deck has no stored slide content to read.",
            true,
          );
        }

        return textResult(
          `Deck "${meta.title ?? "Untitled"}" — current slides (version ` +
            `${meta.version}). Revise these and save with update_deck.\n\n` +
            html,
        );
      },
    );
  },
  { serverInfo: { name: "slidehuddle", version: "0.1.0" } },
  { disableSse: true },
);

// Wrap the handler so every request must carry a valid bearer token. The token
// is decoded here; the user id + request origin are stashed into AuthInfo.extra
// for the tools to read. An invalid/missing token yields a 401 whose
// WWW-Authenticate header points clients to our protected-resource metadata.
const authHandler = withMcpAuth(
  handler,
  async (req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
    if (!bearerToken) return undefined;
    const data = parseAccessToken(bearerToken);
    if (!data) return undefined;
    return {
      token: bearerToken,
      clientId: data.clientId,
      scopes: ["slidehuddle"],
      extra: {
        userId: data.userId,
        email: data.email,
        origin: getPublicOrigin(req),
      },
    };
  },
  { required: true },
);

// --- Per-user rate limiting -----------------------------------------------
// A generous ceiling so a connected client can't hammer the API (e.g. scrape
// via list_decks). Keyed by the authenticated user id from the bearer token;
// requests without a valid token aren't counted here — they fall through to the
// 401 path. Tunable via MCP_RATE_LIMIT_PER_MIN (default 120/min ≈ 2/sec, far
// above normal AI use). See lib/rate-limit.ts for the serverless caveat.
const RATE_LIMIT_PER_MIN = (() => {
  const n = Number.parseInt(process.env.MCP_RATE_LIMIT_PER_MIN ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 120;
})();
const RATE_WINDOW_MS = 60_000;

function rateLimited(
  inner: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const authz = req.headers.get("authorization") ?? "";
    const token = /^Bearer\s+(.+)$/i.exec(authz)?.[1];
    const data = token ? parseAccessToken(token) : null;
    if (data) {
      const r = checkRateLimit(
        `mcp:${data.userId}`,
        RATE_LIMIT_PER_MIN,
        RATE_WINDOW_MS,
      );
      if (!r.allowed) {
        // Log the event only — no token, deck contents, or personal data.
        console.warn(`[mcp] rate limit reached (limit ${r.limit}/min)`);
        return new Response(
          JSON.stringify({
            error: "rate_limited",
            error_description:
              `Too many requests — limit is ${r.limit} per minute. ` +
              `Retry in ${r.retryAfterSec}s.`,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(r.retryAfterSec),
              "RateLimit-Limit": String(r.limit),
              "RateLimit-Remaining": String(r.remaining),
              "RateLimit-Reset": String(
                Math.max(0, Math.ceil((r.resetAt - Date.now()) / 1000)),
              ),
            },
          },
        );
      }
    }
    return inner(req);
  };
}

const GET = rateLimited(authHandler);
const POST = rateLimited(authHandler);
const DELETE = rateLimited(authHandler);

export { GET, POST, DELETE };
