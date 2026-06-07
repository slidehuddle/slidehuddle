# SlideHuddle — Technical Reference

*How it's actually built, as of 5 June 2026.*

This document describes the **real, current state** of the SlideHuddle codebase —
what exists in the code today, not what's planned. It's written to pair with the
product brief: a non-technical founder should be able to follow the structure,
while the technical detail stays precise. Where something is incomplete, fragile,
or only half-wired, it says so plainly (see **Known gaps & tech debt** at the end).

There is also a companion deep-dive at [docs/architecture.md](docs/architecture.md)
with ASCII diagrams of the capture and sign-in flows. This file is the broader
reference; that one goes deeper on the security boundaries.

---

## 1. The big picture

SlideHuddle has **three parts** that work together:

1. **A Chrome extension** (lives at the repo root) — runs on `claude.ai`, spots
   slide decks Claude generates, and adds an "Open in SlideHuddle" button.
2. **A web app** (lives in `/web`) — a Next.js site, hosted on Vercel, that
   stores decks, renders them, and runs the collaboration features (comments,
   requested slides, removal flags, version history).
3. **An MCP server** (lives *inside* the web app, at `/web/src/app/mcp`) — a
   second "front door" that lets an AI assistant (like Claude) read a deck's
   feedback and save revisions directly, over a standard protocol.

They share **one database** (Supabase/Postgres) and one set of business-logic
helpers, so the three entry points can't drift apart.

The data flow in one sentence: *the extension captures slide HTML from Claude →
sends it to the web app → the web app stores it in Supabase and gives back a
shareable link → collaborators open the link, leave feedback → the owner sends
that feedback back to Claude (by button or via the MCP connector) to revise the
deck.*

---

## 2. Repository structure — what lives where

```
Slidehuddle/
├── manifest.json          ← Chrome extension config (permissions, where it runs)
├── content.js             ← The entire extension logic (one file, ~1060 lines)
├── popup.html             ← Tiny info popup shown when you click the extension icon
├── icons/                 ← Extension icons (16/48/128px)
│
├── docs/
│   ├── architecture.md    ← Deep-dive on flows & security boundaries
│   └── *.sql              ← Database migrations (one file per schema change — see §4)
│
└── web/                   ← The Next.js web app + MCP server (deployed to Vercel)
    ├── package.json        ← Dependencies & versions
    ├── next.config.ts      ← Security headers
    ├── src/
    │   ├── proxy.ts        ← Runs on every request to keep sessions fresh
    │   ├── lib/            ← Shared business logic (the "engine room")
    │   ├── components/     ← Shared UI (top nav, avatar menu, popovers)
    │   └── app/            ← All pages and API endpoints (Next.js App Router)
    └── scripts/            ← A dev/test helper script
```

### The extension (repo root)

The extension is deliberately tiny — **three files plus icons**:

| File | What it does |
|---|---|
| [manifest.json](manifest.json) | Declares the extension's name, version (`0.4.0`), permissions, and which web pages it's allowed to run on. |
| [content.js](content.js) | The whole brain. Detects slides on `claude.ai`, injects the button, captures the HTML, talks to the web app, and (separately) auto-fills feedback back into Claude's message box. |
| [popup.html](popup.html) | A static info card shown when you click the toolbar icon. Purely cosmetic — no logic. |

### The web app's "engine room" — `/web/src/lib/`

This is where the real logic lives, kept separate from the pages so all three
entry points (extension, web UI, MCP) call the same functions.

| File | Role |
|---|---|
| [slide-store.ts](web/src/lib/slide-store.ts) | **The most important file.** All deck read/write/update logic, version snapshots, comment/stub/flag queries, ownership checks, and the curation helpers. ~1400 lines. |
| [supabase.ts](web/src/lib/supabase.ts) | The **admin** database client (service-role key, bypasses security rules). Server-only. |
| [supabase-server.ts](web/src/lib/supabase-server.ts) | The **per-request** database client that knows "who is signed in" (reads the session cookie). |
| [supabase-browser.ts](web/src/lib/supabase-browser.ts) | The **browser** database client. Only used by the login form and to write comments/stubs/flags directly. |
| [mcp-oauth.ts](web/src/lib/mcp-oauth.ts) | All the cryptography for the MCP login flow (signing tokens). No database — see §5. |
| [update-token.ts](web/src/lib/update-token.ts) | Mints the "write token" that lets the extension update a deck it created. |
| [rate-limit.ts](web/src/lib/rate-limit.ts) | A simple in-memory rate limiter (used only by the MCP server). |
| [sample-slides.ts](web/src/lib/sample-slides.ts) | A built-in sample deck shown at `/viewer` with no deck id. |

### The web app's pages & endpoints — `/web/src/app/`

Next.js uses **folder = URL**. Key locations:

| Folder/file | URL | What it is |
|---|---|---|
| `(shell)/page.tsx` | `/` | Marketing home page |
| `(shell)/login/page.tsx` | `/login` | Magic-link sign-in form |
| `(shell)/dashboard/` | `/dashboard` | "Your decks" — owned + shared with you |
| `viewer/` | `/viewer` | The deck viewer + all collaboration UI (the biggest UI area) |
| `api/slides/route.ts` | `/api/slides` | Where the extension POSTs captured decks |
| `api/deck-version/route.ts` | `/api/deck-version` | Lightweight "what's the latest version?" check |
| `api/recount-my-decks/route.ts` | `/api/recount-my-decks` | One-off maintenance/backfill endpoint |
| `mcp/route.ts` | `/mcp` | The MCP server (AI-assistant access) |
| `oauth/` | `/oauth/*` | The MCP login flow (authorize / token / register) |
| `.well-known/` | `/.well-known/*` | OAuth discovery documents (so Claude can self-configure) |
| `auth/callback/route.ts` | `/auth/callback` | Where the magic-link email lands |
| `auth/signout/route.ts` | `/auth/signout` | Sign-out endpoint |

The `(shell)` folder name in parentheses is a Next.js "route group" — it shares a
common layout (the top nav) without adding `/shell` to the URL.

The `viewer/` folder is the most populated UI area — it holds the slide stage,
thumbnail strip, comments panel, the requested-slide ("stub") and removal-flag
controls, the version navigator, and the "Send to Claude" button. These are
React components; the bulk of the orchestration lives in `viewer/SlideViewer.tsx`.

---

## 3. Tech stack & versions

Pulled directly from [web/package.json](web/package.json).

### Frameworks & major libraries

| Thing | Version | What it's for |
|---|---|---|
| **Next.js** | `16.2.6` | The web framework (pages, routing, server rendering, API routes). |
| **React** | `19.2.4` | The UI library Next.js is built on. |
| **TypeScript** | `^5` | The language (typed JavaScript). |
| **Tailwind CSS** | `^4` | Styling (utility CSS classes). |
| **@supabase/supabase-js** | `^2.106.2` | The Postgres/auth client library. |
| **@supabase/ssr** | `^0.10.3` | Supabase helper for server-side rendering & cookie sessions. |
| **@modelcontextprotocol/sdk** | `^1.26.0` | Official MCP protocol types/server. |
| **mcp-handler** | `^1.1.0` | Glue that mounts an MCP server as a Next.js route. |
| **zod** | `^4.4.3` | Validates the inputs to MCP tools. |

> ⚠️ **Note on Next.js 16:** this is a very new major version with breaking
> changes from older Next.js. The repo's own [web/AGENTS.md](web/AGENTS.md) warns
> that conventions differ from what's commonly documented online. Two concrete
> consequences you'll see in the code: the request-time middleware file is named
> `proxy.ts` (not the historical `middleware.ts`), and there's a `next/server`
> `after()` helper used to run work after the response is sent.

The extension itself uses **no framework** — it's plain JavaScript using the
Chrome Extension Manifest V3 APIs. No build step; the files ship as-is.

### Services and how they connect

```
  Chrome extension ──HTTPS──► Vercel (the web app) ──► Supabase (Postgres + Auth)
       (browser)                  (hosting)              (database + magic-link email)

  AI assistant (Claude) ──MCP over HTTPS──► Vercel /mcp ──► Supabase
```

- **Vercel** hosts and runs the web app (and the MCP server, which is part of it).
  This is where all the server code executes. Production URL:
  `https://slidehuddleapp.vercel.app`.
- **Supabase** provides the Postgres database, the authentication system
  (magic-link emails), and Row Level Security. Everything is stored here.
- **Google Fonts** is the only other external dependency (the "Plus Jakarta Sans"
  font, loaded by both the extension and the web app).

---

## 4. Database schema

All tables live in Supabase Postgres under the `public` schema. The schema is
defined by a series of **migration files** in `docs/*.sql` — each is a one-shot
script you paste into the Supabase SQL editor, and each is written to be safe to
re-run. **Important:** these migrations are applied manually; there is no
automated migration runner. (The code degrades gracefully if a migration hasn't
been run yet — see §10.)

> **Row Level Security (RLS) in plain English:** RLS is a database-level rule that
> decides which rows each user can see or change, enforced by Postgres itself.
> SlideHuddle has two kinds of database access:
> - The **anon key** (shipped to browsers) — RLS rules fully apply.
> - The **service-role key** (server-only, never sent to browsers) — **bypasses
>   RLS entirely**. The web app uses this for trusted server-side reads/writes,
>   and re-checks permissions in code instead.
>
> So when you read "anon → denied" below, it means a logged-out browser hitting
> the database directly gets nothing — but the server can still read it with the
> service-role key (which is how anonymous *link-viewing* of a deck works).

### Table: `decks` — the core table

One row per captured deck. The row always mirrors the **latest** version.

| Column | Type | Meaning |
|---|---|---|
| `id` | text (PK) | 22-char crypto-random id (the share link uses this). |
| `html_content` | text | The captured slide HTML (latest version). |
| `user_id` | uuid → `auth.users` | The owner. **Nullable** — `NULL` = "orphan" deck (see below). |
| `title` | text | Derived from the HTML's `<title>` or first `<h1>`. |
| `slide_count` | integer | Derived count of slides. |
| `version` | integer | Current version number (starts at 1). |
| `claude_conversation_id` | text | The `claude.ai/chat/<id>` this came from, if known. |
| `created_at` / `updated_at` | timestamptz | Timestamps. |

**Orphan decks:** when the extension captures a deck from `claude.ai`, the browser
has no SlideHuddle session there, so `user_id` is `NULL`. The deck is still fully
viewable by its link, but it appears in nobody's dashboard until someone "claims"
it by signing in via the creator flow. This is **intentional** — it lets the
extension work on day one without forcing a sign-up.

**RLS on `decks`:**
- **anon → denied** (no direct reads).
- **authenticated →** can `SELECT` a deck if they own it *or* it's been shared with
  them (`decks_select_own_or_shared`); can `INSERT`/`UPDATE`/`DELETE` only their own
  rows.
- **service-role →** full access (this is what the viewer and API use).

### Table: `deck_versions` — full version history

One immutable row per version of a deck. The `decks` row is the "latest pointer";
this table keeps every past snapshot so history (and future rollback) works.

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid (PK) | |
| `deck_id` | text → `decks` | |
| `version` | integer | (unique together with `deck_id`) |
| `html_content` | text | The full HTML of that version. |
| `title`, `slide_count` | | Snapshot of those values. |
| `created_by` | uuid → `auth.users` | |
| `created_at` | timestamptz | |

**RLS:** anon → denied; authenticated → `SELECT` on versions of decks they own or
that are shared with them. Writes happen only via the service-role key. *(The
read policy exists for a future history UI; the viewer itself reads via
service-role.)*

### Table: `shared_decks` — "shared with me"

One row per (recipient, deck) the recipient doesn't own. Created automatically the
first time someone opens a deck link while signed in.

| Column | Type | Meaning |
|---|---|---|
| `deck_id` + `user_id` | (composite PK) | |
| `role` | text | `'viewer'` or `'commenter'` — but in practice **only `'viewer'` is ever written**, and the distinction isn't enforced anywhere (see §10). |
| `created_at` | timestamptz | |

**RLS:** authenticated → `SELECT`/`INSERT`/`DELETE` only their **own** rows
(can't see who else a deck was shared with). anon → denied.

### Table: `deck_views` — unread-comment tracking

One row per (deck, user) recording the last time that user viewed the deck. Used
to compute the "N new" comment badge on the dashboard.

| Column | Type |
|---|---|
| `deck_id` + `user_id` | (composite PK) |
| `last_viewed_at` | timestamptz |

**RLS:** authenticated → `SELECT`/`INSERT`/`UPDATE` only their own rows. anon → denied.

### Table: `comments`

One row per comment, scoped to a specific deck, slide, **and version**.

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid (PK) | |
| `deck_id` | text → `decks` | |
| `user_id` | uuid → `auth.users` | Who wrote it. |
| `author_email` | text | Snapshot of the author's email at post time (so the name survives if they later change it). |
| `slide_index` | integer | 0-based slide the comment is on. |
| `version` | integer | Which deck version it was written on (default 1). Comments only show while viewing that version. |
| `body` | text | Max 4000 chars. |
| `parent_id` | uuid → `comments` | **Reserved** for future threaded replies — unused today. |
| `element_id` | text | **Reserved** for future element-level comments — always `NULL` today. |
| `resolved` | boolean | **Reserved** for a future triage UI — unused today. |
| `dismissed` | boolean | Owner curation: excluded from the Claude prompt (still shown). |
| `owner_edited_body` | text | Owner's edited version of the text sent to Claude (original `body` never changes). |
| `created_at` / `updated_at` | timestamptz | |

**RLS:** authenticated → `SELECT`/`INSERT` on a deck they can access (own or
shared); `UPDATE`/`DELETE` only their own comments. **anon → denied.** So:
unauthenticated link-viewers see **no comments**, and comments are impossible on
orphan decks (no owner = nobody has access).

### Table: `slide_stubs` — "requested slides"

A placeholder slide a collaborator asks to be added. Overlaid on the deck without
changing the captured HTML.

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid (PK) | |
| `deck_id` | text → `decks` | |
| `position` | integer | How many real slides come before it. |
| `title` / `subtitle` / `body` | text | What the slide should cover (length-capped). |
| `requested_by` | uuid → `auth.users` | |
| `dismissed` / `owner_edited_body` | | Owner curation (same idea as comments). |
| `resolved_at` | timestamptz | `NULL` = still open; a timestamp = resolved (kept for audit). |
| `created_at` | timestamptz | |

**RLS:** authenticated → `SELECT`/`INSERT` on accessible decks; `DELETE` only your
own. anon → denied *for direct reads*, **but** the viewer page reads stubs
server-side with the service-role key, so anonymous link-viewers still **see**
requested slides in the strip.

### Table: `slide_flags` — "flag for removal"

Marks a real slide for removal, with a reason.

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid (PK) | |
| `deck_id` | text → `decks` | |
| `slide_index` | integer | 0-based slide flagged. |
| `reason` | text | Optional, length-capped. |
| `flagged_by` | uuid → `auth.users` | |
| `dismissed` / `owner_edited_reason` | | Owner curation. |
| `resolved_at` | timestamptz | `NULL` = open; timestamp = resolved. |
| `created_at` | timestamptz | |

**RLS:** same pattern as stubs — authenticated `SELECT`/`INSERT` on accessible
decks, `DELETE` own only; anon denied for direct reads but visible via the
viewer's server-side read.

### Quick RLS summary — what an anonymous (logged-out) browser can touch directly

| Table | Anon direct access? |
|---|---|
| `decks` | ❌ No (but link-viewing works because the server reads via service-role) |
| `deck_versions` | ❌ No |
| `shared_decks` | ❌ No |
| `deck_views` | ❌ No |
| `comments` | ❌ No (anon viewers see no comments at all) |
| `slide_stubs` | ❌ No direct read (but visible in the viewer via server-side read) |
| `slide_flags` | ❌ No direct read (but visible in the viewer via server-side read) |

The headline: **anyone with a deck link can view the slides** (and the
stubs/flags drawn on them), because the server reads those with the service-role
key. But **commenting, requesting slides, and flagging all require signing in.**

### The migration files

These are the SQL scripts in `docs/`, in rough order of when features were added:

| File | Adds |
|---|---|
| `auth-migration.sql` | `user_id`/`title`/`slide_count` on `decks` + the owner RLS policies |
| `shared-decks-migration.sql` | the `shared_decks` table + widened deck SELECT policy |
| `comments-migration.sql` | the `comments` table |
| `comments-version-migration.sql` | the `version` column on comments |
| `comments-element-id-migration.sql` | the reserved `element_id` column |
| `deck-views-migration.sql` | the `deck_views` table |
| `slide-stubs-migration.sql` | the `slide_stubs` table |
| `slide-flags-migration.sql` | the `slide_flags` table |
| `deck-versions-migration.sql` | the `deck_versions` history table |
| `deck-conversation-migration.sql` | `claude_conversation_id` on `decks` |
| `feedback-curation-migration.sql` | `dismissed`/`owner_edited_*` columns on comments/stubs/flags |
| `feedback-resolution-migration.sql` | `resolved_at` columns on stubs/flags |

---

## 5. API routes — every endpoint

### `POST /api/slides` — capture a deck (the extension's main call)

The endpoint the Chrome extension posts captured HTML to.
[Source](web/src/app/api/slides/route.ts)

- **Expects:** the slide HTML in the request body (as `text/html`, `text/plain`,
  or JSON `{html}`). Optional query params: `?conversation=<id>` (which Claude
  chat it came from) or `?update=<deckId>` (to revise an existing deck). An
  optional `X-SlideHuddle-Update-Token` header for updates.
- **Checks, in order:**
  1. **Origin allowlist** — the request must come from `claude.ai` (or a
     `*.claudeusercontent.com` / `*.claudemcpcontent.com` artifact origin).
     Anything else gets a 403 and no CORS headers. This is the main guard, since
     this endpoint has no login.
  2. **Size cap** — rejects bodies over **2 MB** (checked twice: header + actual).
  3. **Content-type** — must be HTML/plain/JSON.
  4. **Shape filter** — rejects single-page artifacts that depend on Claude's
     internal design-system CSS (they'd render broken outside the chat). Returns
     a friendly 422 with a short label. Multi-slide decks and self-contained
     pages pass.
- **Create mode:** generates a random id, does a **best-effort** session lookup
  (the extension on `claude.ai` has no SlideHuddle cookie, so this is usually
  `NULL` → orphan deck), stores the deck via the service-role key, snapshots v1,
  and mints a **write token**. Returns `{id, url, version, title, writeToken,
  conversationId}`.
- **Update mode (`?update=`):** there's no session, so it authorizes via the
  **write token** the extension presents (proves "I'm the browser that created
  this deck"). Saves a new version. Returns `{id, url, version, title}`.
- **Auth model:** origin-gated, not login-gated. Updates are gated by the
  capability token, not by user identity.

### `GET /api/deck-version?id=<id>` — "is there a newer version?"

[Source](web/src/app/api/deck-version/route.ts) Returns just `{version}` for a
deck. Used by the viewer to notice when a deck was revised out-of-band (e.g. by
the MCP server) and prompt a refresh. **No auth** — it returns only a version
number, and the deck is already public-by-link. Never cached.

### `POST /api/recount-my-decks` — maintenance backfill

[Source](web/src/app/api/recount-my-decks/route.ts) A one-off admin utility: while
signed in, re-derives `title`/`slide_count` for all your decks (useful after a
counting-logic change). **Auth:** requires a signed-in session (401 otherwise);
only touches the caller's own decks. Meant to be run by hand from the browser
console.

### `POST /mcp` (+ GET/DELETE) — the AI-assistant server

[Source](web/src/app/mcp/route.ts) Speaks MCP over HTTP. **Every request must
carry a valid bearer access token** (from the OAuth flow below); the user's
identity is read **only** from that token, never from tool arguments. Per-user
**rate limiting** applies (default 120 requests/min, tunable). It exposes six
tools:

| Tool | Read/Write | What it does | Permission |
|---|---|---|---|
| `create_deck` | write | Create a new deck from HTML, owned by the token's user. | Authenticated user |
| `update_deck` | write | Save revised HTML as a new version; marks addressed feedback resolved. | **Owner only** |
| `get_feedback` | read | Return the owner-curated feedback (dismissed items dropped, owner edits applied). | **Owner only** |
| `list_decks` | read | List the user's decks with pending-feedback counts. | Owner's own decks |
| `get_deck` | read | Summary of one deck (title, version, slide count, feedback counts). | **Owner only** |
| `get_deck_slides` | read | The current slide HTML of one deck, so the AI can revise rather than regenerate. | **Owner only** |

The owner-only tools return an identical "not found, or you are not its owner"
message whether the deck is missing or simply isn't yours — so the id space can't
be probed. These tools call the **same** `slide-store.ts` functions as the web app
and the same feedback-formatting as the "Send to Claude" button, so behavior
can't diverge.

### The OAuth endpoints — how the AI logs in (no new database tables)

The MCP server's login is **stateless**: instead of storing OAuth records in the
database, every artifact (client id, authorization code, access token) is a
**signed, self-describing blob** — `base64(data).HMAC-signature`, signed with a
server secret, carrying its own type tag and expiry.
[Crypto source](web/src/lib/mcp-oauth.ts)

| Endpoint | RFC | What it does |
|---|---|---|
| `GET /.well-known/oauth-protected-resource` | 9728 | First thing Claude fetches: "this resource is protected; here's the auth server." |
| `GET /.well-known/oauth-authorization-server` | 8414 | Where to register / log in / get a token. |
| `POST /oauth/register` | 7591 | Claude auto-registers, sending its redirect URLs; gets back a signed `client_id`. No secret (it's a public client; PKCE is the proof). |
| `GET/POST /oauth/authorize` | — | The consent screen. If not signed in, bounces to the normal magic-link `/login`. If signed in, shows "Allow Claude to access your account?" prominently displaying the **destination host**. On Allow, mints a 60-second authorization code. **Identity comes only from the Supabase session, never the client.** |
| `POST /oauth/token` | — | Swaps the authorization code (+ PKCE verifier) for a 30-day access token carrying the user id. |

**Security properties of this design:**
- PKCE (S256) is **required** — a stolen authorization code is useless without
  the client's secret verifier.
- Authorization codes expire in 60 seconds; access tokens in 30 days.
- The consent screen treats the **redirect host** as the authoritative trust
  signal (the app name is self-reported and shown only as secondary context).
- Open-redirect protection: `/oauth/authorize` only redirects to a `redirect_uri`
  the client actually registered.
- **Trade-off (documented in code):** there's **no server-side revocation list**.
  A leaked access token stays valid until it expires (up to 30 days). The signing
  secret defaults to `MCP_TOKEN_SECRET`, falling back to the Supabase service-role
  key.

### The auth (sign-in) routes

| Endpoint | What it does |
|---|---|
| `GET /auth/callback?code=…` | Where the magic-link email lands. Swaps the code for a session (sets cookies), then redirects to `next` (or `/dashboard`). **Only relative `next` paths starting with a single `/` are honored** — blocks open-redirect via crafted magic links. |
| `POST /auth/signout` | Clears the session cookies, redirects to `/login` (303). |

---

## 6. The Chrome extension

### Architecture

The extension is **one content script** (`content.js`) that Chrome injects into
matching pages. It runs in **two modes** depending on which frame it's in:

- **Top-frame mode** (the main `claude.ai` page): does everything — watches the
  page, detects slides, injects the button, captures HTML, talks to the backend,
  and auto-fills feedback into Claude's message box.
- **Iframe mode** (inside Claude's artifact-preview iframes, which are a different
  origin): a small helper that, when asked by the top frame via `postMessage`,
  reads the slide HTML out of *its* frame and sends it back. This cross-frame
  dance is necessary because browser security stops the top frame from reading an
  iframe on a different domain directly.

There is **no background service worker** and **no build step** — the raw files
are the extension.

### Manifest & permissions ([manifest.json](manifest.json))

- **Manifest V3**, version `0.4.0`.
- **`permissions: ["storage"]`** — the only browser permission it requests. Used
  to remember which deck each Claude conversation produced (and the write token
  for updating it), in `chrome.storage.local`.
- **`content_scripts`** run on `claude.ai`, `*.claude.ai`,
  `*.claudemcpcontent.com`, and `*.claudeusercontent.com`, in **all frames**.
- **`host_permissions`** (which servers it may fetch from): `localhost:3000`
  (local dev), `slidehuddleapp.vercel.app` (production), and Claude's domains.
  This allowlist means the extension can't be tricked into calling arbitrary
  servers.

> **Note:** the production-vs-local target is hardcoded by a `PRODUCTION = true`
> flag near the top of `content.js`, not driven by the manifest. Flip it to `false`
> to develop against `localhost:3000`.

### How it detects slides

`content.js` runs a debounced scan (1.5s) on every page mutation, looking for
slides in **three** ways:

1. **Artifact cards** — Claude's artifact blocks labeled HTML. (PPTX/Presentation
   artifacts are *detected but deliberately get no button* — see §10.)
2. **Code blocks** (`<pre>`) whose text looks slide-shaped (multiple `<section>`
   tags, `class="slide"`, etc.).
3. **Inline preview iframes** on Claude's content domains.

It scores candidates and filters out hidden/tiny utility iframes (analytics,
Cloudflare challenges) so they never win. When it finds slides, it injects the
purple **"Open in SlideHuddle"** button.

### How it captures and talks to the backend

On click:
1. Reads the slide HTML — directly for code blocks, or via `postMessage` to the
   artifact iframe (which replies with its HTML).
2. Checks `chrome.storage` for whether this Claude conversation already produced a
   deck. If so, it asks the user: **update that deck** or **create a separate
   one**.
3. `POST`s the HTML to `/api/slides` (with `?conversation=` on create, or
   `?update=<id>` + the stored write token on update).
4. On success, opens the returned viewer URL in a new tab (adding `?source=capture`
   on create, which flags the opener as the creator), and remembers the
   conversation→deck binding (including the write token) in `chrome.storage`.

### The reverse direction: auto-filling feedback into Claude

The web app's "Send to Claude" button opens `claude.ai` with the curated feedback
tucked into the **URL fragment** (`#slidehuddle-feedback=…`). The fragment never
leaves the browser (fragments aren't sent to servers). `content.js` reads it and
types the feedback into Claude's message composer — but **only if the box is
empty**, and it **never auto-sends** (the user presses send). The feedback is also
copied to the clipboard as a fallback if the composer can't be found.

---

## 7. Authentication, sessions & the permission model

### Magic-link sign-in (no passwords)

SlideHuddle has **no passwords**. Sign-in is entirely Supabase magic links:

1. On `/login`, the user types their email; the **browser** Supabase client calls
   `signInWithOtp()`.
2. Supabase emails a one-time link pointing at `/auth/callback?code=…`.
3. The callback route swaps the code for a session via
   `exchangeCodeForSession()`, which writes the **`sb-*` session cookies**.
4. Redirect to `/dashboard` (or wherever `?next=` pointed).

### Sessions

- Sessions live in **HTTP-only cookies** (`sb-*`) — they aren't readable by
  JavaScript, so an XSS bug on a SlideHuddle page can't steal the session.
- [proxy.ts](web/src/proxy.ts) runs on every non-asset request and calls
  `getUser()`, which lets Supabase **refresh** the session cookie before it
  expires — so users don't get logged out mid-session. (In Next.js 16 this
  request-time middleware file is named `proxy.ts`.)

### The three database clients (who can do what)

| Client | Where it runs | Key | RLS? | Used for |
|---|---|---|---|---|
| **Admin** (`getSupabaseAdmin`) | Server only | Service-role | **Bypassed** | Storing/reading any deck by id, all the trusted server logic. |
| **Server** (`getSupabaseServer`) | Server, per request | Anon + cookies | Applies | "Who is signed in?" checks, dashboard queries. |
| **Browser** (`getSupabaseBrowser`) | The browser | Anon | Applies | Login, and writing comments/stubs/flags directly. |

The service-role key **never leaves the server**. Anything named `NEXT_PUBLIC_*`
is shipped to the browser (fine for the anon key, since RLS gates it).

### The permission model: owner vs everyone-else

The model is essentially **two roles**, despite the `shared_decks.role` column
hinting at more:

- **Owner** = the user whose id is in `decks.user_id`.
- **Recipient/collaborator** = anyone signed in who opens the deck link (gets a
  `shared_decks` row).
- **Anonymous link-viewer** = anyone with the link but not signed in — can **view
  slides only**.

**Who can do what, and where it's enforced:**

| Action | Who | Enforced where | Server-side or UI-only? |
|---|---|---|---|
| **View slides** (by link) | Anyone with the link | Viewer reads by id via service-role | Server-side (intentionally open) |
| **Comment** | Any signed-in user with deck access | `comments` RLS (insert on accessible decks) | **Server-side (RLS)** — written via the browser client |
| **Request a slide (stub)** | Any signed-in user with access | `slide_stubs` RLS | **Server-side (RLS)** |
| **Flag a slide for removal** | Any signed-in user with access | `slide_flags` RLS | **Server-side (RLS)** |
| **Delete your own comment** | Comment author | `comments` RLS (`delete_own`) | **Server-side (RLS)** |
| **Delete a stub** | The requester *or* the deck owner | `deleteStub` in slide-store, via a server action that reads the user from cookies | **Server-side** |
| **Edit a stub's fields** | The requester *or* the owner | `editStubFields`, server action | **Server-side** |
| **Curate feedback** (dismiss / owner-edit comments, stubs, flags) | **Owner only** | `setCommentCuration` / `setStubCuration` / `setFlagCuration`, server actions | **Server-side** (owner re-checked with service-role) |
| **Delete a whole deck** | **Owner only** | `deleteDeck`, server action | **Server-side** (owner re-checked) |
| **Remove a deck from your dashboard** | The collaborator (their `shared_decks` row only) | `removeSharedDeck`, server action | **Server-side** |
| **Update a deck via MCP** | **Owner only** | `loadOwnedDeck` gate in the MCP tool | **Server-side** |
| **Update a deck via the extension** | The browser that created it (holds the write token) | Write-token verification in `/api/slides` | **Server-side** (capability token, not identity) |

**Key point for accuracy:** the writes that go through the **browser** Supabase
client (comments, stubs, flags) are gated by **RLS in the database** — genuinely
server-side, not UI-only. The owner-only actions (curation, deck delete, MCP
update) use **server actions** that read the user from the session cookie (never
trusting the client) and re-verify ownership with the service-role client.

The one place the model is *looser than it looks*: the `'viewer'` vs `'commenter'`
distinction in `shared_decks.role` is **not enforced** — every collaborator can
comment/request/flag regardless of role, and only `'viewer'` is ever written. See
§10.

### Creator vs recipient (the `?source=capture` marker)

A viewer URL can be opened by the **creator** (URL has `?source=capture`, added by
the extension) or a **recipient** (no marker). Based on this:
- A signed-in **creator** opening an orphan deck **claims** it (sets `user_id`) —
  but the claim **only succeeds if the deck is still unowned**, so a leaked link
  can't steal a deck.
- A signed-in **recipient** gets a `shared_decks` row ("shared with me").
- The **"Copy link" button strips `?source=capture`**, so recipients can never
  inherit the creator-claim flag.

---

## 8. Environment variables & secrets

Configured in **two places**: `web/.env.local` for local development (this file is
git-ignored and **never committed**), and **Vercel's environment-variable
settings** for production. The repo's `.gitignore` files block all `.env*` files
from being committed.

> The values are **not** printed here — only the names and purposes.

### Required

| Variable | Sent to browser? | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (public) | The Supabase project URL. Needed by all three database clients. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (public) | The public/anon database key. Safe to expose because RLS gates what it can do. |
| `SUPABASE_SERVICE_ROLE_KEY` | **No — server only** | The powerful key that bypasses RLS. Used for trusted server reads/writes, **and** (by default) as the signing secret for both the deck write tokens and the MCP OAuth tokens. **This is the most sensitive secret in the system.** |

The local `web/.env.local` currently contains exactly these three.

### Optional (have sensible defaults if unset)

| Variable | Purpose | Default |
|---|---|---|
| `MCP_TOKEN_SECRET` | A dedicated signing secret for MCP OAuth tokens, so it can be rotated independently of Supabase. | Falls back to `SUPABASE_SERVICE_ROLE_KEY`. |
| `MCP_RATE_LIMIT_PER_MIN` | Per-user request ceiling on the MCP server. | `120` (≈2/sec). |

**Supabase-side configuration** (not env vars, but required): the Supabase project
must have the magic-link email auth enabled, and the redirect URLs allow-listed.
The `docs/*.sql` migrations must also have been run against the database (see §4).

---

## 9. Deployment

- **Host:** Vercel. The `/web` folder is the deployed app; the MCP server is part
  of it (it's just a route), so there's nothing separate to deploy for MCP.
- **Production URL:** `https://slidehuddleapp.vercel.app`.
- **How it builds:** Vercel runs `next build` (the `build` script in
  `web/package.json`). Server code runs as Vercel serverless functions.
- **Branch/flow:** the default branch is `main`. The standard Vercel pattern
  applies — pushing to the connected branch triggers a production deploy; other
  branches/PRs get preview deploys. (The repo is a git repo on `main`; confirm the
  exact Vercel git connection in the Vercel dashboard.)

### To deploy a web-app change

1. Make the change in `/web`.
2. If it touches the database schema, **run the relevant `docs/*.sql` migration in
   Supabase first** (there's no automated migration step — see §10).
3. If it needs a new environment variable, add it in **Vercel's project settings**
   (and in `web/.env.local` for local dev).
4. Commit and push to the deploy branch (`main`); Vercel builds and deploys.

### To deploy an extension change

The Chrome extension is **not** deployed by Vercel — it's the files at the repo
root. Today it's loaded/distributed separately (e.g. as an unpacked extension or
via the Chrome Web Store). Updating it means shipping the new `content.js` /
`manifest.json` through whichever channel you use to distribute the extension —
**a Vercel deploy does not update the extension**. Remember to bump the `version`
in `manifest.json`.

---

## 10. Known gaps & tech debt

An honest list of what's incomplete, fragile, or not yet enforced.

### Features not built / only partially done

- **PPTX capture is NOT built.** The extension *detects* PowerPoint/Presentation
  artifacts and logs file info to seed future work, but **deliberately injects no
  button** for them (a button that fails at click time is worse than none). Only
  HTML decks can be captured today. (`content.js`, `detectArtifactSlides`.)
- **Reserved-but-unused database columns:** `comments.parent_id` (threaded
  replies), `comments.resolved` (triage UI), and `comments.element_id`
  (element-level comments) all exist in the schema but **nothing reads or writes
  them yet**. They're there to avoid a future migration.
- **The `'commenter'` role is decorative.** `shared_decks.role` can be `'viewer'`
  or `'commenter'`, but the code only ever writes `'viewer'`, and **no permission
  anywhere checks the role**. Every signed-in collaborator can comment, request
  slides, and flag — there is currently no read-only-viewer enforcement. If "view
  only" vs "can comment" is a product requirement, it is **not yet implemented**.
- **Deck *viewing* has no per-recipient access control.** Anyone with the link can
  view the slides (the server reads by id with the service-role key). Sharing is
  link-based, "anyone with the link can view." RLS protects the dashboard and
  comments, but not slide viewing itself. This is by design today, but worth
  knowing.

### Operational fragility

- **Database migrations are manual.** Each `docs/*.sql` file must be pasted into
  Supabase by hand. There's no migration runner, no record of which have been
  applied, and **no enforced ordering** beyond doing them in sequence. The code
  defends against this with graceful fallbacks: if a table or column is missing
  (because a migration wasn't run), it logs a clear warning and degrades (e.g.
  stores a deck without the conversation binding, or skips the version snapshot)
  rather than crashing. Good for resilience, but it means a forgotten migration
  can silently reduce functionality — watch the server logs for
  "migration likely hasn't been run" messages.
- **The MCP rate limiter is per-instance, not global.** [rate-limit.ts](web/src/lib/rate-limit.ts)
  keeps counts in one server instance's memory. On Vercel, requests can land on
  different instances, and counters reset on cold start. It's a real speed bump
  against a single client hammering a warm function, but **not a hard global cap**.
  The code documents this explicitly; swapping in Redis/Supabase would make it
  global.
- **`/api/slides` itself is not rate-limited** — it relies on the origin allowlist
  and the 2 MB size cap. Only the MCP endpoint has rate limiting.

### Security caveats (documented in code, accepted for now)

- **No MCP token revocation.** Because OAuth tokens are stateless signed blobs
  (no database table), there's no way to revoke a leaked access token before it
  expires (up to 30 days). A revocation table could be added later without
  changing the token format.
- **No Content-Security-Policy header.** [next.config.ts](web/next.config.ts) sets
  several hardening headers (`X-Frame-Options`, `X-Content-Type-Options`, HSTS,
  etc.) but **not** a strict CSP — it's noted as a follow-up because Next.js's
  inline hydration scripts would need nonce-injecting middleware. The slide HTML
  itself is safely isolated another way: the viewer renders each slide in a
  locked-down `<iframe sandbox="allow-scripts">` (no `allow-same-origin`), so
  malicious script in a captured deck can't reach SlideHuddle's cookies or DOM.
  **(Critical invariant: never add `allow-same-origin` to that sandbox.)**
- **One secret does double duty.** `SUPABASE_SERVICE_ROLE_KEY` is both the
  RLS-bypass database key *and* (by default) the HMAC signing key for deck write
  tokens and MCP tokens. Setting `MCP_TOKEN_SECRET` separates one of those; the
  deck write token still reuses the service-role key.

### Minor inconsistencies

- **Version-number mismatch in the extension UI.** [manifest.json](manifest.json)
  says version `0.4.0`, but [popup.html](popup.html) hardcodes "v0.1.0 · ready".
  Cosmetic only.
- **`web/README.md` is the stock Next.js starter readme** — it hasn't been
  customized for SlideHuddle, so it doesn't reflect the real setup. (The real
  documentation is [docs/architecture.md](docs/architecture.md) and this file.)
- **Best-effort writes that can silently no-op.** Several non-critical writes
  (recording a deck view, tracking a shared deck, snapshotting a version,
  resolving addressed feedback) log errors but don't surface them to the user by
  design — so e.g. a failed `deck_views` write would silently make unread counts
  slightly wrong. This is intentional (these shouldn't block the main action), but
  it means failures hide in the server logs rather than being visible.

---

## Appendix: where to look first

- **Want to understand deck storage/versioning?** → [web/src/lib/slide-store.ts](web/src/lib/slide-store.ts)
- **Want to understand the security boundaries with diagrams?** → [docs/architecture.md](docs/architecture.md)
- **Want to understand what the extension does?** → [content.js](content.js)
- **Want to understand the AI/MCP integration?** → [web/src/app/mcp/route.ts](web/src/app/mcp/route.ts) + [web/src/lib/mcp-oauth.ts](web/src/lib/mcp-oauth.ts)
- **Want the database shape?** → the `docs/*.sql` files, summarized in §4 above.
