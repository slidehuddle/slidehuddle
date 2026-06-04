// The SlideHuddle MCP server endpoint.
//
// This is the public "front door" for AI assistants. It speaks MCP over
// Streamable HTTP (POST JSON-RPC). Every request is authenticated by the
// bearer access token our OAuth layer issued (see lib/mcp-oauth.ts and
// app/oauth/*). The authenticated user id is read ONLY from that token — never
// from anything the assistant passes as a tool argument.
//
// The tools are thin wrappers over the same functions the web app and the
// Chrome-extension API route already use (lib/slide-store.ts), so there is one
// implementation of each capability and the paths can't drift.
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
  countSlides,
  dependsOnClaudeDesignSystem,
} from "@/lib/slide-store";
import { parseAccessToken } from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Same hard cap on slide HTML as the extension's /api/slides route, so both
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
  return { content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) };
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

const handler = createMcpHandler(
  (server) => {
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
          slides: z
            .string()
            .min(1)
            .describe("The slide deck as HTML."),
        },
      },
      async (args, extra) => {
        const auth = getAuthExtra(extra.authInfo);
        if (!auth) return textResult("Not authenticated.", true);

        let html = String(args.slides ?? "");
        const title = String(args.title ?? "");
        if (!html.trim()) return textResult("`slides` is empty.", true);
        if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
          return textResult("Slide HTML exceeds the 2MB size limit.", true);
        }

        html = ensureTitle(html, title);

        // Same capture-shape guard as /api/slides: reject single-page artifacts
        // that depend on Claude's design-system CSS (they render broken outside
        // the chat). Multi-slide decks and self-contained pages pass.
        const slideCount = countSlides(html) ?? 0;
        if (slideCount < 2 && dependsOnClaudeDesignSystem(html)) {
          return textResult(
            "This HTML relies on Claude's design-system styles and won't " +
              "render correctly as a standalone deck. Provide a multi-slide " +
              "deck or a self-contained single-page HTML artifact (all CSS " +
              "inline).",
            true,
          );
        }

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

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
