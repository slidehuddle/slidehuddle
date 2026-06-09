# SlideHuddle — Security Review

*Reviewed: 5 June 2026. Scope: web app, API, database (RLS), Chrome extension,
auth, MCP/OAuth. Method: full source read of the current `main` branch.*

> **Important caveat on "verify it actually works":** I reviewed the **code and
> the migration SQL**. I could **not** connect to your live Supabase database, so
> I cannot prove from here that the Row Level Security policies are actually
> *switched on in production*. Because your migrations are applied by hand, that's
> a real gap. **Run [docs/verify-rls.sql](docs/verify-rls.sql) in the Supabase SQL
> editor** to confirm it — that script is the missing "does it actually work"
> check. This matters because almost all of the comment/stub/flag protections
> depend on RLS being live.

---

## Headline

**No critical code-level vulnerabilities found.** The authorization model is
genuinely enforced on the server, not just in the UI — which is the thing you
were most worried about, and it holds up. Sensitive HTML is correctly sandboxed.
No secrets are committed. Fixes applied during/after this review: the anonymous
email leak (below), **M1** (rate-limiting on `/api/slides`), and **M4** (comment
author-email spoofing). The remaining items are medium/low hardening for you to
decide on, plus the RLS-is-it-live verification above.

---

## What I FIXED now

### ⬛ Fixed — Collaborator email addresses leaked to anonymous link-holders (Medium)

**Plain English:** When someone requests a slide or flags one for removal, the
server looked up that person's email to show "requested by alice@acme.com". That
email was being sent to **every** viewer of the deck — including someone who
isn't signed in and just has the share link. So a person outside your team who
got hold of a link could see the email addresses of the people collaborating on
the deck, even though they were never knowingly given access to that information.

**Why it's not critical:** it's limited to email addresses, and only to someone
who already holds the (unguessable) share link. No account takeover, no ability
to change anything. But it's an unintended disclosure of personal data, so it's
worth fixing.

**The fix:** in [web/src/app/viewer/page.tsx](web/src/app/viewer/page.tsx), the
requester/flagger email fields are now blanked out unless the viewer is **signed
in**. Signed-in viewers are recorded as the owner or a shared recipient (part of
the collaboration), so they still see who left feedback — exactly as before.
Not-signed-in viewers now get `null` for those emails. Comments were already
gated correctly (anonymous viewers see none); this brings stubs/flags in line.
Verified the app still type-checks cleanly.

---

## 1. Authorization (the permission model) — PASS

I traced every sensitive action to where it's enforced on the server. **None rely
on hiding a button.**

| Action | Who's allowed | Enforced where | Verdict |
|---|---|---|---|
| Dismiss / edit a comment (curation) | Owner only | `setCommentCuration` re-reads the deck and rejects if `deck.user_id !== userId`; user comes from the session cookie, never the client | ✅ server-side |
| Delete a stub | Requester **or** owner | `deleteStub` checks both, via service-role | ✅ server-side |
| Edit a stub's fields | Requester **or** owner | `editStubFields` | ✅ server-side |
| Dismiss a stub / flag (curation) | Owner only | `setStubCuration` / `setFlagCuration` | ✅ server-side |
| Update a deck / new version (MCP) | Owner only | `loadOwnedDeck` gate before `updateDeck` | ✅ server-side |
| Update a deck (extension) | The browser that created it | Signed write-token check (`verifyDeckWriteToken`) | ✅ capability token |
| Delete a whole deck | Owner only | `deleteDeck` re-checks ownership | ✅ server-side |
| Delete your own comment | Comment author | RLS `comments_delete_own` (`auth.uid() = user_id`) | ✅ database |
| Add comment / stub / flag | Any signed-in user with deck access | RLS insert policies (`auth.uid()` must match, deck must be accessible) | ✅ database |

The owner-only server actions ([viewer/actions.ts](web/src/app/viewer/actions.ts),
[dashboard/actions.ts](web/src/app/(shell)/dashboard/actions.ts)) all read the
user from `getSupabaseServer().auth.getUser()` (the session cookie) and **never**
trust an id passed from the client. A share-link viewer calling these APIs
directly gets `forbidden`. **This is the right architecture.**

One nuance worth knowing (not a bug): the `shared_decks.role` column has a
`'commenter'` value, but nothing checks it — **every** signed-in collaborator can
comment/request/flag. There is currently no "view-only" tier. If you intend one,
it isn't built yet. (Listed as Low, below.)

## 2. Supabase RLS — CORRECT IN CODE, must verify it's LIVE

Every migration enables RLS on its table, and every policy is scoped to
`authenticated` with `auth.uid()` checks — **no policy is granted to the `anon`
(logged-out) role**, so a logged-out browser using the public key can read/write
nothing directly. The `decks` SELECT policy correctly widens to "own OR shared
with me." All seven tables (`decks`, `deck_versions`, `shared_decks`,
`deck_views`, `comments`, `slide_stubs`, `slide_flags`) have `enable row level
security`.

**Caveat (repeated because it's the most important item):** this is verified in
the SQL files only. Confirm it's actually applied with
[docs/verify-rls.sql](docs/verify-rls.sql). If any table came back with RLS *off*,
that would be **critical** — but I have no way to check it from the code.

## 3. Service-role key usage — PASS

The service-role key (which bypasses RLS) is read only via
`process.env.SUPABASE_SERVICE_ROLE_KEY` in server-only files
([supabase.ts](web/src/lib/supabase.ts), [slide-store.ts](web/src/lib/slide-store.ts),
[update-token.ts](web/src/lib/update-token.ts), [mcp-oauth.ts](web/src/lib/mcp-oauth.ts)).
It is **never** prefixed `NEXT_PUBLIC_`, so Next.js cannot inline it into the
browser bundle. I confirmed the client components (`SlideViewer`, `CommentsPanel`,
etc.) import only **types** from `slide-store` (`import type …`), which are erased
at compile time — no server code or key reaches the browser. And every server
function that uses the admin client does its **own** ownership check (it doesn't
lean on RLS). ✅

## 4. XSS & HTML rendering — PASS

- Captured slide HTML renders in an iframe with **`sandbox="allow-scripts"` and
  nothing else** ([SlideViewer.tsx:864](web/src/app/viewer/SlideViewer.tsx)). No
  `allow-same-origin` (so scripts run in an opaque origin — they cannot read your
  cookies, `localStorage`, or the parent DOM), no `allow-top-navigation` (cannot
  redirect the page), no `allow-popups`, no `allow-forms`. This is the
  industry-standard safe pattern. **Do not ever add `allow-same-origin` here.**
- `<script>` tags are stripped from the captured head during parsing; thumbnails
  render with `sandbox=""` (no scripts at all).
- The measurement message the iframe posts back is treated as untrusted: the
  parent checks the marker and only reads positive numbers
  ([SlideViewer.tsx:198](web/src/app/viewer/SlideViewer.tsx)).
- All user-entered text (comment bodies, stub titles/subtitles/bodies, removal
  reasons, owner-edited text) is rendered as React children — **React escapes
  these automatically**, and there is **no `dangerouslySetInnerHTML` anywhere** in
  the app. So none of it can inject script into a SlideHuddle page. ✅
- The gated **floating viewer** redesign (`?view=floating`,
  [FloatingViewer.tsx](web/src/app/viewer/FloatingViewer.tsx)) renders slides into
  the **same** `sandbox="allow-scripts"` iframe with the same untrusted-message
  handling, reuses the same server-prepared/role-gated/email-redacted data, and
  escapes all user text as React children — it adds no new HTML-rendering surface.
  See `docs/architecture.md` → "Floating viewer (gated redesign)". ✅

## 5. Authentication & sessions — PASS

- Passwordless magic-link via Supabase. Session lives in `sb-*` cookies managed by
  `@supabase/ssr`, which sets them **HttpOnly + Secure + SameSite=Lax** — so page
  JavaScript can't read the session, and it isn't sent on cross-site requests.
- **Open-redirect: blocked.** `/auth/callback` only honors a `next` value starting
  with a single `/` (rejects `//evil.com` and absolute URLs)
  ([auth/callback/route.ts](web/src/app/auth/callback/route.ts)). The OAuth
  `/authorize` route only redirects to a `redirect_uri` the client registered.
- Magic-link replay: the link carries a one-time code consumed by
  `exchangeCodeForSession`; sessions refresh via [proxy.ts](web/src/proxy.ts) and
  expire/rotate on Supabase's schedule. ✅

## 6. API endpoint security — MOSTLY PASS (two medium items)

- **Deck IDs are unguessable:** 22 chars of `crypto.randomUUID()` (~122 bits) —
  not sequential. ✅
- `/api/slides` validates **origin allowlist**, **content-type**, and a **2 MB
  body cap** (checked twice). MCP tools validate input with `zod` and the same
  2 MB cap. User-text columns have DB length limits (comments ≤4000, etc.). ✅
- **Medium — no rate limiting on `/api/slides`.** Only the MCP endpoint is
  rate-limited. See finding M1.
- **Medium — `/api/slides` create has no real authentication.** It's gated by the
  `Origin` header, which a browser can't forge from another site — but a
  non-browser client (a script) can send any `Origin` header. See finding M2.

## 7. Secrets & environment variables — PASS

No keys are committed. Every `service_role` reference is `process.env.…`. No
`.env*` files are tracked by git, and both `.gitignore` files exclude them. The
three required vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) live only in `web/.env.local` (untracked) and Vercel.
✅ *(Operational note: since the repo is public, if the service-role key was ever
pasted into a commit in the past, rotate it. Nothing in the current tree exposes
it.)*

## 8. CORS — PASS

`/api/slides` reflects an allowed origin **only** for `claude.ai` and Claude's
artifact content domains; any other origin gets no CORS headers, so browsers block
it. The OAuth metadata/token/register endpoints use `Access-Control-Allow-Origin:
*`, which is correct and expected for public OAuth discovery (the token endpoint
still requires the one-time code + PKCE proof). ✅

## 9. Chrome extension — PASS (least privilege)

- Permissions requested: **`storage` only**. No `tabs`, no `<all_urls>`, no
  `scripting`, no `cookies`. ✅
- `host_permissions` are scoped to `claude.ai`, Claude's content domains, the
  Vercel app, and `localhost:3000` — it can't be pointed at arbitrary servers.
- It only ever POSTs captured slide HTML to your own API, and reads feedback from
  the URL fragment (which never leaves the browser). It **never auto-sends** a
  message in Claude and only fills the composer when empty.
- Cross-frame capture uses `postMessage`; the reply path matches on a random
  `requestId`. (Low note L3 below on tightening message-origin checks.) ✅

## 10. CSP & security headers — PARTIAL (one medium)

Present in [next.config.ts](web/next.config.ts): `X-Content-Type-Options:
nosniff`, `X-Frame-Options: SAMEORIGIN` (anti-clickjacking), `Referrer-Policy`,
`Strict-Transport-Security` (HSTS w/ preload), `Permissions-Policy` (camera/mic/
geo/FLoC disabled). **Missing: a Content-Security-Policy.** See finding M3.

## 11. Silent failures — PASS

The data layer uses a `{ rows, failed }` pattern that distinguishes "genuinely
empty" from "the query errored / table missing," logs missing-migration cases
loudly, and the dashboard/viewer surface a "couldn't load" notice instead of
showing a false empty state. A failed permission check returns an explicit
`forbidden`, not an empty result. ✅

---

## Medium findings

**M1 — No rate limiting on `/api/slides`. ✅ FIXED.** A script could repeatedly
POST decks (up to 2 MB each) and flood your database / Vercel bill. *Fix applied:*
per-IP rate limiting added to [api/slides/route.ts](web/src/app/api/slides/route.ts)
using the existing [rate-limit.ts](web/src/lib/rate-limit.ts) helper — default
30/min per IP, tunable via `SLIDES_RATE_LIMIT_PER_MIN`, returning HTTP 429 +
`Retry-After`. *Limitation:* the limiter is in-memory per serverless instance (a
real speed bump, not a hard global cap); swap its store for Redis/Supabase if you
ever need a global ceiling.

**M2 — `/api/slides` create is origin-gated, not authenticated.** The `Origin`
header stops other *websites* but not a direct script that sets the header itself.
*Mitigated by M1's rate limiting* (the practical fix). True per-user auth here is
hard because the extension legitimately posts from claude.ai with no session — left
as-is by design.

**M3 — No Content-Security-Policy.** The slides themselves are safely sandboxed,
but the main app pages have no CSP, so any future HTML-injection bug would have
fewer guardrails. *Risk:* defense-in-depth only. *Fix:* add a CSP header. A strict
one needs nonces (Next.js streams inline hydration scripts), but you can safely add
`object-src 'none'; base-uri 'self'; frame-ancestors 'self'` today with no app
changes. *(Not done — your call.)*

**M4 — Comment author email could be spoofed. ✅ FIXED.** The browser sent
`author_email` itself, and RLS only checked `user_id`, so a signed-in user could
post a comment that *displayed* someone else's email as the author. *Fix applied,
two layers:* (1) [slide-store.ts](web/src/lib/slide-store.ts) `getCommentsForDeck`
now re-resolves the author's email from the trusted `user_id` on read (falling back
to the stored snapshot only for deleted accounts), so the displayed name can't be
faked; (2) a new DB migration
[docs/comments-author-email-migration.sql](docs/comments-author-email-migration.sql)
tightens the comment INSERT policy so Postgres rejects any `author_email` that
isn't NULL or the signed-in user's own JWT email — blocking the spoof at write
time (which also protects the live-update path). **Run that migration in Supabase
to activate layer 2.**

## Low findings (informational)

**L1 — No MCP token revocation.** OAuth access tokens are stateless signed blobs
with no revocation list, so a leaked token is valid until it expires (up to 30
days). Documented trade-off; a revocation table can be added later.

**L2 — `'commenter'` role is unenforced.** There is no read-only-viewer tier today
— every collaborator can comment/request/flag. Fine if intended; a gap if you
expected "view only" sharing.

**L3 — Extension postMessage origin checks are loose.** The capture handlers
accept messages by shape/`requestId` rather than checking `event.origin`. Because
the script only runs on Claude's own domains, exposure is minimal, but adding an
explicit origin allowlist to the message listeners would tighten it.

**L4 — One secret does double duty.** `SUPABASE_SERVICE_ROLE_KEY` is both the
RLS-bypass DB key and (by default) the signing key for deck-write and MCP tokens.
Setting a separate `MCP_TOKEN_SECRET` (already supported) reduces blast radius if
one is rotated.

**L5 — All decks are world-readable by link.** Anyone with a deck's link can view
its slides (the server reads by id with the service-role key). This is the
intended "anyone with the link" sharing model; just be aware there is no
per-recipient access control on *viewing* (only on commenting/editing).
