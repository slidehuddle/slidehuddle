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

// Upper bound on the slide HTML get_deck_slides will return INLINE in a single
// tool result. A deck can legitimately be up to MAX_HTML_BYTES (2MB), but
// dumping that into one assistant response is risky (oversized context, client
// limits), so above this ceiling we degrade gracefully — return the deck's
// metadata + share link instead of the raw HTML — rather than emitting
// something oversized. Generous so ordinary decks (well under 500KB) are always
// returned in full; only pathologically large decks hit the fallback. Tunable
// via MCP_MAX_SLIDES_OUTPUT_BYTES (default 1MB).
const MAX_SLIDES_OUTPUT_BYTES = (() => {
  const n = Number.parseInt(process.env.MCP_MAX_SLIDES_OUTPUT_BYTES ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1024 * 1024;
})();

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

// A successful result that ALSO carries machine-readable structuredContent
// (required by the SDK whenever a tool declares an outputSchema). We keep the
// human-readable text block too, so clients that don't read structuredContent
// still get a sensible answer. Error results never carry structuredContent —
// the SDK exempts isError results from output-schema validation — so failures
// keep using textResult(..., true).
function dataResult(text: string, structured: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: structured,
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
          "Publish a slide deck to SlideHuddle and get a shareable link the " +
          "user's team can view and comment on. Call this after you have " +
          "generated the deck's HTML. Pass the FULL, self-contained, " +
          "multi-slide HTML of the deck as `slides`: all CSS inline and no " +
          "external stylesheets or fonts required to render (a standalone .html " +
          "file you could open in any browser). SlideHuddle hosts it and " +
          "returns a deck_id and a public share_url to give the user. Use this " +
          "whenever the user asks to create, publish, or share a deck / slides " +
          "/ presentation.",
        annotations: {
          // Creates a new resource: not read-only, but it only ever adds a new
          // deck — it never overwrites or deletes existing data.
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
        inputSchema: {
          title: z
            .string()
            .max(200)
            .describe(
              "A title for the deck. Used to name it when the HTML has no " +
                "<title> of its own.",
            ),
          slides: z
            .string()
            .min(1)
            .describe(
              "The complete deck as a single self-contained HTML document " +
                "(all CSS inline; multiple slides).",
            ),
        },
        outputSchema: {
          deck_id: z.string(),
          title: z.string(),
          share_url: z.string(),
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
          const finalTitle = storedTitle ?? title ?? "Untitled";
          return dataResult(
            `Created deck "${finalTitle}".\n` +
              `deck_id: ${id}\n` +
              `share_url: ${shareUrl}`,
            { deck_id: id, title: finalTitle, share_url: shareUrl },
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
          "Pull the team's curated feedback on one of the user's SlideHuddle " +
          "decks so you can revise it. Call this before revising a deck to see " +
          "what changes are requested. Returns only the feedback the deck owner " +
          "chose to include (dismissed items excluded, owner edits applied): " +
          "comments grouped by slide, requested new slides (with " +
          "title/subtitle/body), and slides flagged for removal (with reasons). " +
          "Read-only. You must own the deck.",
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          deck_id: z
            .string()
            .min(1)
            .describe(
              "The deck's id (from create_deck, list_decks, or the share URL).",
            ),
        },
        outputSchema: {
          deck_id: z.string(),
          title: z.string(),
          feedback_count: z.number(),
          feedback_text: z.string(),
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
        const title = meta.title ?? "Untitled";

        if (!prompt) {
          return dataResult(
            `No feedback to act on yet for "${title}" (0 items).`,
            { deck_id: deckId, title, feedback_count: 0, feedback_text: "" },
          );
        }
        return dataResult(`(${count} feedback item(s))\n\n${prompt}`, {
          deck_id: deckId,
          title,
          feedback_count: count,
          feedback_text: prompt,
        });
      },
    );

    // --- update_deck ------------------------------------------------------
    server.registerTool(
      "update_deck",
      {
        title: "Save a revised deck version",
        description:
          "Save a revised version of an existing SlideHuddle deck. Use this " +
          "after get_feedback and get_deck_slides to apply revisions to the " +
          "real deck. Pass the deck_id and the FULL revised, self-contained " +
          "multi-slide HTML (all CSS inline) as `slides`. Keeps the same " +
          "deck_id and share link, bumps the version number, and preserves all " +
          "previous versions in history (non-destructive). You must own the " +
          "deck. Returns the new version number and the unchanged share_url.",
        annotations: {
          // Writes a new version but is non-destructive: prior versions are kept
          // in history, and the share link is unchanged.
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
        inputSchema: {
          deck_id: z.string().min(1).describe("The deck to update."),
          slides: z
            .string()
            .min(1)
            .describe(
              "The complete revised deck as a single self-contained HTML " +
                "document (all CSS inline). Saved as the new latest version.",
            ),
        },
        outputSchema: {
          deck_id: z.string(),
          title: z.string(),
          version: z.number(),
          share_url: z.string(),
          resolved_feedback_count: z.number(),
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
          const finalTitle = title ?? "Untitled";
          return dataResult(
            `Saved "${finalTitle}" as version ${version}.\n` +
              `version: ${version}\n` +
              `share_url: ${shareUrl} (unchanged)` +
              resolvedNote,
            {
              deck_id: deckId,
              title: finalTitle,
              version,
              share_url: shareUrl,
              resolved_feedback_count: resolvedCount,
            },
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
          "List the user's SlideHuddle decks, most recently updated first, so " +
          "you can find a deck_id. Use this when the user refers to 'my deck' " +
          "or 'my slides' without giving an id, or to see how much feedback is " +
          "waiting across their decks. Read-only — never creates, changes, or " +
          "deletes anything. Finds decks no matter how they were created (the " +
          "Chrome extension, this MCP, or another conversation). For each deck " +
          "it returns: deck_id, title, version, pending_feedback_count " +
          "(included, not-yet-acted-on feedback items), last_updated, and the " +
          "source conversation link when one is known.",
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
        inputSchema: {},
        outputSchema: {
          count: z.number(),
          decks: z.array(
            z.object({
              deck_id: z.string(),
              title: z.string(),
              version: z.number(),
              pending_feedback_count: z.number().nullable(),
              last_updated: z.string(),
              share_url: z.string(),
              conversation_url: z.string().nullable(),
            }),
          ),
        },
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
          return dataResult("You don't have any decks yet.", {
            count: 0,
            decks: [],
          });
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

        const decks = rows.map((deck, i) => ({
          deck_id: deck.id,
          title: deck.title ?? "Untitled",
          version: deck.version,
          pending_feedback_count: pendingCounts[i],
          last_updated: formatDateOnly(deck.updated_at ?? deck.created_at),
          share_url: `${auth.origin}/viewer?id=${deck.id}`,
          conversation_url: deck.conversation_id
            ? `https://claude.ai/chat/${deck.conversation_id}`
            : null,
        }));

        return dataResult(
          `Your decks (${rows.length}), most recent first:\n\n` +
            blocks.join("\n\n"),
          { count: rows.length, decks },
        );
      },
    );

    // --- get_deck (read-only) --------------------------------------------
    server.registerTool(
      "get_deck",
      {
        title: "Get a deck summary",
        description:
          "Get a quick summary of one of the user's SlideHuddle decks: title, " +
          "version, slide_count, share_url, and how much feedback is currently " +
          "included (counts of comments, requested slides, and removal flags). " +
          "Use it to check a deck's status without pulling its full HTML. " +
          "Read-only. You must own the deck — if it doesn't exist or isn't " +
          "yours, returns a neutral 'not found' (it won't reveal whether the id " +
          "exists).",
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          deck_id: z
            .string()
            .min(1)
            .describe(
              "The deck's id (from list_decks, create_deck, or the share URL).",
            ),
        },
        outputSchema: {
          deck_id: z.string(),
          title: z.string(),
          version: z.number(),
          slide_count: z.number().nullable(),
          share_url: z.string(),
          feedback: z.object({
            comments: z.number(),
            requested_slides: z.number(),
            flags: z.number(),
          }),
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
        const title = meta.title ?? "Untitled";
        return dataResult(
          `Deck "${title}"\n` +
            `version: ${meta.version}\n` +
            `slide_count: ${meta.slide_count ?? "unknown"}\n` +
            `share_url: ${shareUrl}\n` +
            `feedback (included items):\n` +
            `  comments: ${curated.comments.length}\n` +
            `  requested_slides: ${curated.stubs.length}\n` +
            `  flags: ${curated.flags.length}`,
          {
            deck_id: deckId,
            title,
            version: meta.version,
            slide_count: meta.slide_count ?? null,
            share_url: shareUrl,
            feedback: {
              comments: curated.comments.length,
              requested_slides: curated.stubs.length,
              flags: curated.flags.length,
            },
          },
        );
      },
    );

    // --- get_deck_slides (read-only) -------------------------------------
    server.registerTool(
      "get_deck_slides",
      {
        title: "Read a deck's current slides",
        description:
          "Read the CURRENT slide HTML of one of the user's SlideHuddle decks, " +
          "plus its version and title — so you can revise the real deck instead " +
          "of regenerating it from scratch. Call this together with " +
          "get_feedback before saving changes with update_deck. Read-only — " +
          "never creates, changes, or deletes anything. You must own the deck; " +
          "if it doesn't exist or isn't yours, returns a neutral 'not found' " +
          "(it won't reveal whether the id exists).",
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          deck_id: z
            .string()
            .min(1)
            .describe(
              "The deck's id (from list_decks, create_deck, or the share URL).",
            ),
        },
        outputSchema: {
          deck_id: z.string(),
          title: z.string(),
          version: z.number(),
          slides_html: z.string().nullable(),
          truncated: z.boolean(),
          share_url: z.string(),
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

        const shareUrl = `${auth.origin}/viewer?id=${deckId}`;
        const title = meta.title ?? "Untitled";

        // Bound the inline response. A deck can be up to MAX_HTML_BYTES (2MB);
        // returning that in one tool result risks oversized model context and
        // client limits. Above the ceiling, degrade gracefully: return the
        // deck's metadata + share link instead of dumping the raw HTML, so the
        // caller gets a clear, actionable result rather than something
        // oversized. (Not isError: the read succeeded; the deck is just large.)
        const htmlBytes = Buffer.byteLength(html, "utf8");
        if (htmlBytes > MAX_SLIDES_OUTPUT_BYTES) {
          const kb = (n: number) => Math.round(n / 1024);
          return dataResult(
            `Deck "${title}" (version ${meta.version}) is ` +
              `${kb(htmlBytes)}KB — too large to return inline (limit ` +
              `${kb(MAX_SLIDES_OUTPUT_BYTES)}KB). Open it to view or revise: ` +
              `${shareUrl}\nYou can still save a revised version with ` +
              `update_deck.`,
            {
              deck_id: deckId,
              title,
              version: meta.version,
              slides_html: null,
              truncated: true,
              share_url: shareUrl,
            },
          );
        }

        return dataResult(
          `Deck "${title}" — current slides (version ` +
            `${meta.version}). Revise these and save with update_deck.\n\n` +
            html,
          {
            deck_id: deckId,
            title,
            version: meta.version,
            slides_html: html,
            truncated: false,
            share_url: shareUrl,
          },
        );
      },
    );

    // --- search (ChatGPT-style discovery alias, read-only) ---------------
    // ChatGPT (and other "connector" clients) have a strong default toward
    // generic `search` + `fetch` retrieval and may not reach for our named
    // tools on their own. These two aliases map that default behaviour onto the
    // existing owner-scoped read paths, so a client that only knows how to
    // "search the connector" can still find and read the user's decks. They add
    // NO new capability or access — same token-only identity and owner gating as
    // list_decks / get_deck_slides; they're just a second doorway to the same
    // data. `search` returns the {id,title,url} result shape these clients
    // expect (also as JSON text for clients that read content, not
    // structuredContent).
    server.registerTool(
      "search",
      {
        title: "Search your SlideHuddle decks",
        description:
          "Search the user's SlideHuddle decks by title and return matches as a " +
          "list of results (id, title, url). Pass an empty query to list every " +
          "deck. Use the returned id with `fetch` to read a deck's slides. " +
          "Read-only; only ever returns decks the user owns.",
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          query: z
            .string()
            .describe(
              "Words to match against deck titles (case-insensitive). Empty " +
                "string returns all of the user's decks.",
            ),
        },
        outputSchema: {
          results: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              url: z.string(),
            }),
          ),
        },
      },
      async (args, extra) => {
        const auth = getAuthExtra(extra.authInfo);
        if (!auth) return textResult("Not authenticated.", true);

        const query = String(args.query ?? "").trim().toLowerCase();
        const { rows, failed } = await getDecksForOwner(auth.userId);
        if (failed) {
          return textResult(
            "Couldn't search your decks right now — please try again.",
            true,
          );
        }
        const matched = query
          ? rows.filter((d) => (d.title ?? "").toLowerCase().includes(query))
          : rows;
        const results = matched.map((d) => ({
          id: d.id,
          title: d.title ?? "Untitled",
          url: `${auth.origin}/viewer?id=${d.id}`,
        }));
        // Text body is the JSON result set (the contract some connector clients
        // read from content rather than structuredContent).
        return dataResult(JSON.stringify({ results }), { results });
      },
    );

    // --- fetch (ChatGPT-style document read alias, read-only) ------------
    server.registerTool(
      "fetch",
      {
        title: "Fetch a SlideHuddle deck's contents",
        description:
          "Fetch one of the user's SlideHuddle decks by id (from `search`) and " +
          "return its current slide HTML as a document (id, title, text, url). " +
          "Use this to read a deck before revising it. Read-only; you must own " +
          "the deck, otherwise a neutral 'not found' is returned.",
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          id: z
            .string()
            .min(1)
            .describe("The deck id to fetch (from `search` or the share URL)."),
        },
        outputSchema: {
          id: z.string(),
          title: z.string(),
          text: z.string(),
          url: z.string(),
          metadata: z.record(z.string(), z.string()).nullable(),
        },
      },
      async (args, extra) => {
        const auth = getAuthExtra(extra.authInfo);
        if (!auth) return textResult("Not authenticated.", true);

        const deckId = String(args.id ?? "");
        // Same owner-only gate + neutral not-found as the other read tools.
        const meta = await loadOwnedDeck(deckId, auth.userId);
        if (!meta) {
          return textResult("Deck not found, or you are not its owner.", true);
        }

        const { html, failed } = await getStoredSlides(deckId);
        if (failed) {
          return textResult(
            "Couldn't load this deck right now — please try again.",
            true,
          );
        }

        const shareUrl = `${auth.origin}/viewer?id=${deckId}`;
        const title = meta.title ?? "Untitled";
        const metadata = {
          version: String(meta.version),
          share_url: shareUrl,
        };

        // Same inline-size bound as get_deck_slides: if the deck HTML is too
        // large to return in one result, hand back a pointer instead of the raw
        // document rather than something oversized.
        const body = html ?? "";
        const htmlBytes = Buffer.byteLength(body, "utf8");
        const tooLarge = htmlBytes > MAX_SLIDES_OUTPUT_BYTES;
        const text = tooLarge
          ? `This deck is too large to return inline. Open it at ${shareUrl}.`
          : body;

        const doc = { id: deckId, title, text, url: shareUrl, metadata };
        return dataResult(JSON.stringify(doc), doc);
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
