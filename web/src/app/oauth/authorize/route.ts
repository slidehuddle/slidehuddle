// OAuth 2.1 authorization endpoint.
//
// This is where the user actually approves the connection. Claude opens this
// URL in the user's browser. The flow:
//
//   1. Validate the request (client_id, redirect_uri, PKCE). A bad client_id or
//      redirect_uri renders an error page — we must NEVER redirect to an
//      unverified URI. Other errors go back to the (verified) redirect_uri.
//   2. If the user has no SlideHuddle session, bounce them to the EXISTING
//      /login page with ?next set back here. That login flow (magic link) is
//      untouched and already returns the user to `next` after sign-in.
//   3. If signed in, show a small consent screen ("Allow Claude to access your
//      SlideHuddle account?"). On Allow (a same-origin POST), mint a one-time
//      authorization code bound to this user + client + PKCE challenge, and
//      redirect back to the assistant's redirect_uri with the code.
//
// The user's identity comes entirely from their Supabase session here — never
// from anything the client sends.

import { getPublicOrigin } from "mcp-handler";
import { getSupabaseServer } from "@/lib/supabase-server";
import { clientAllowsRedirect, mintAuthCode, parseClientId } from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BRAND = "#4A3FB5";

type AuthParams = {
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string | null;
};

// Pull the OAuth parameters from either a query string (GET) or form body (POST).
function readParams(src: URLSearchParams): {
  responseType: string | null;
  codeChallengeMethod: string | null;
} & Partial<AuthParams> {
  return {
    clientId: src.get("client_id") ?? undefined,
    redirectUri: src.get("redirect_uri") ?? undefined,
    state: src.get("state"),
    codeChallenge: src.get("code_challenge") ?? undefined,
    scope: src.get("scope"),
    responseType: src.get("response_type"),
    codeChallengeMethod: src.get("code_challenge_method"),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlPage(title: string, bodyInner: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         background:#f6f6f8; color:#1d1d1b; display:flex; min-height:100vh; align-items:center; justify-content:center; }
  .card { background:#fff; max-width:420px; width:calc(100% - 32px); border:1px solid #e6e6ea; border-radius:16px;
          padding:32px; box-shadow:0 12px 32px rgba(17,17,17,0.08); }
  h1 { font-size:20px; margin:0 0 8px; }
  p { color:#55555f; line-height:1.5; margin:0 0 16px; }
  .row { display:flex; gap:12px; margin-top:24px; }
  button { flex:1; font-size:15px; font-weight:600; padding:11px 16px; border-radius:10px; cursor:pointer; border:1px solid transparent; }
  .allow { background:${BRAND}; color:#fff; }
  .deny { background:#fff; color:#1d1d1b; border-color:#d9d9e0; }
  .muted { font-size:13px; color:#8a8a93; }
  .err { color:#791f1f; }
</style></head><body><div class="card">${bodyInner}</div></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function errorPage(message: string): Response {
  return htmlPage(
    "Connection error",
    `<h1 class="err">Couldn't connect</h1><p>${escapeHtml(message)}</p>
     <p class="muted">Nothing was changed. You can close this window and try again.</p>`,
    400,
  );
}

// Redirect back to the (already-validated) client redirect_uri with an error.
function redirectError(
  redirectUri: string,
  state: string | null,
  error: string,
  description?: string,
): Response {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  if (description) u.searchParams.set("error_description", description);
  if (state) u.searchParams.set("state", state);
  return Response.redirect(u.toString(), 302);
}

// Validate the client + redirect first (these gate whether we may redirect at
// all), then the protocol params. Returns either validated params or a Response
// to return immediately.
function validate(
  p: ReturnType<typeof readParams>,
):
  | { ok: true; params: AuthParams }
  | { ok: false; response: Response } {
  const clientId = p.clientId;
  const redirectUri = p.redirectUri;

  if (!clientId || !redirectUri) {
    return { ok: false, response: errorPage("Missing client_id or redirect_uri.") };
  }
  if (!clientAllowsRedirect(clientId, redirectUri)) {
    return {
      ok: false,
      response: errorPage(
        "This app isn't registered, or the redirect URL doesn't match its registration.",
      ),
    };
  }
  // From here, redirect_uri is trusted — protocol errors go back to the client.
  if (p.responseType !== "code") {
    return {
      ok: false,
      response: redirectError(redirectUri, p.state ?? null, "unsupported_response_type"),
    };
  }
  if (!p.codeChallenge || p.codeChallengeMethod !== "S256") {
    return {
      ok: false,
      response: redirectError(
        redirectUri,
        p.state ?? null,
        "invalid_request",
        "PKCE with code_challenge_method=S256 is required.",
      ),
    };
  }
  return {
    ok: true,
    params: {
      clientId,
      redirectUri,
      state: p.state ?? null,
      codeChallenge: p.codeChallenge,
      scope: p.scope ?? null,
    },
  };
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const v = validate(readParams(url.searchParams));
  if (!v.ok) return v.response;
  const { params } = v;

  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in → use the existing magic-link login, returning here after.
  if (!user) {
    const origin = getPublicOrigin(req);
    const next = `${url.pathname}${url.search}`;
    return Response.redirect(
      `${origin}/login?next=${encodeURIComponent(next)}`,
      302,
    );
  }

  // Signed in → render the consent screen. All params are re-submitted as
  // hidden fields so the POST re-validates them.
  const email = user.email ?? "your account";
  // The destination host is where the access token will actually be sent, so
  // it's the authoritative trust signal — show it prominently. The app name is
  // self-reported at registration, so it's shown only as secondary context.
  let destHost: string;
  try {
    destHost = new URL(params.redirectUri).host;
  } catch {
    destHost = params.redirectUri;
  }
  const appName = parseClientId(params.clientId)?.clientName ?? null;
  const hidden = (name: string, value: string) =>
    `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
  return htmlPage(
    "Connect to SlideHuddle",
    `<h1>Connect to SlideHuddle</h1>
     <p>An app wants to access <strong>${escapeHtml(email)}</strong>'s
        SlideHuddle account — to create decks, read your team's feedback, and
        save revisions on your behalf.</p>
     <div style="border:1px solid #e6e6ea;border-radius:10px;padding:12px 14px;margin:0 0 16px;background:#faf9ff">
       <div style="font-size:13px;color:#8a8a93;margin-bottom:2px">Connecting to</div>
       <div style="font-size:16px;font-weight:700;color:${BRAND};word-break:break-all">${escapeHtml(destHost)}</div>
       ${appName ? `<div style="font-size:13px;color:#55555f;margin-top:4px">App name (self-reported): ${escapeHtml(appName)}</div>` : ""}
     </div>
     <p class="muted">Only continue if you recognise this destination — your
        access token will be sent to <strong>${escapeHtml(destHost)}</strong>.</p>
     <form method="POST">
       ${hidden("client_id", params.clientId)}
       ${hidden("redirect_uri", params.redirectUri)}
       ${hidden("code_challenge", params.codeChallenge)}
       ${hidden("code_challenge_method", "S256")}
       ${hidden("response_type", "code")}
       ${params.state ? hidden("state", params.state) : ""}
       ${params.scope ? hidden("scope", params.scope) : ""}
       <div class="row">
         <button class="deny" type="submit" name="action" value="deny">Deny</button>
         <button class="allow" type="submit" name="action" value="allow">Allow</button>
       </div>
     </form>
     <p class="muted" style="margin-top:20px">Signed in as ${escapeHtml(email)}.</p>`,
  );
}

export async function POST(req: Request): Promise<Response> {
  // CSRF defence-in-depth: only accept the consent POST from our own origin.
  // (Supabase session cookies are SameSite=Lax, so a cross-site POST wouldn't
  // carry the session anyway — this is a second layer.)
  const origin = getPublicOrigin(req);
  const reqOrigin = req.headers.get("origin");
  if (reqOrigin && reqOrigin !== origin) {
    return errorPage("Request origin mismatch.");
  }

  const form = await req.formData();
  const src = new URLSearchParams();
  for (const [k, val] of form.entries()) {
    if (typeof val === "string") src.set(k, val);
  }
  const action = src.get("action");

  const v = validate(readParams(src));
  if (!v.ok) return v.response;
  const { params } = v;

  if (action !== "allow") {
    return redirectError(params.redirectUri, params.state, "access_denied");
  }

  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Session expired between rendering and submitting — send back to login.
    const next = `/oauth/authorize?${src.toString()}`;
    return Response.redirect(
      `${origin}/login?next=${encodeURIComponent(next)}`,
      302,
    );
  }

  const code = mintAuthCode({
    clientId: params.clientId,
    userId: user.id,
    email: user.email ?? null,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
  });

  const out = new URL(params.redirectUri);
  out.searchParams.set("code", code);
  if (params.state) out.searchParams.set("state", params.state);
  return Response.redirect(out.toString(), 302);
}
