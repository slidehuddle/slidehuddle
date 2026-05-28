# SlideHuddle architecture

How the Chrome extension, web app, and database fit together — and where the
security boundaries are.

## Components at a glance — capture flow

```
                              ┌─────────────── USER'S BROWSER ──────────────────┐
                              │                                                  │
                              │  ┌── claude.ai tab ─────────────────────────┐   │
                              │  │                                           │   │
                              │  │  ① Claude generates slide HTML            │   │
                              │  │     (inline <pre>, or artifact iframe     │   │
                              │  │      on *.claudeusercontent.com /         │   │
                              │  │      *.claudemcpcontent.com)              │   │
                              │  │                  │                        │   │
                              │  │                  ▼                        │   │
                              │  │  ┌────────────────────────────────────┐   │   │
                              │  │  │ SlideHuddle extension              │   │   │
                              │  │  │ (manifest.json + content.js)       │   │   │
                              │  │  │  ② Detects slide-shaped HTML       │   │   │
                              │  │  │  ③ Injects "Open in SlideHuddle"   │   │   │
                              │  │  │  ④ On click, captures HTML         │   │   │
                              │  │  │     (postMessage into artifact     │   │   │
                              │  │  │      iframe if needed)             │   │   │
                              │  │  └──────────────┬─────────────────────┘   │   │
                              │  └─────────────────┼───────────────────────────┘ │
                              │                    │                              │
                              │  ┌── slidehuddleapp.vercel.app tab ──────────┐   │
                              │  │  (opened in a new tab in step ⑧)          │   │
                              │  │                                            │   │
                              │  │   /viewer?id=…                             │   │
                              │  │     │                                      │   │
                              │  │     ▼                                      │   │
                              │  │   ⑨ SlideViewer.tsx parses HTML,           │   │
                              │  │      shows each slide in a sandboxed       │   │
                              │  │      <iframe sandbox="">                   │   │
                              │  │      (no JS, no forms, opaque origin)      │   │
                              │  └────────────────────▲──────────────────────┘   │
                              └───────────────────────┼──────────────────────────┘
                                                      │
                       ⑤ POST html                    │ ⑧ window.open(url)
                       Origin: https://claude.ai      │
                                  │                   │
                                  ▼                   │
                ┌──────────────────────── VERCEL ────────────────────────┐
                │                                                          │
                │   POST /api/slides              GET /viewer?id=…         │
                │   ─────────────────             ──────────────────       │
                │   • origin allowlist            • server-side read       │
                │   • 2 MB body cap                 by deck id             │
                │   • content-type check          • returns React page    │
                │   • crypto.randomUUID id                                 │
                │   • best-effort user lookup:                             │
                │     if a SlideHuddle session                             │
                │     cookie is present, attach                            │
                │     user_id; otherwise NULL                              │
                │     (= orphan, see below)                                │
                │                                                          │
                │     slide-store.ts ── uses SUPABASE_SERVICE_ROLE_KEY ──┐ │
                │                       (bypasses RLS, server-only)      │ │
                │                                                          │
                │   Security headers on every response:                   │
                │     X-Content-Type-Options, X-Frame-Options,            │
                │     Referrer-Policy, HSTS, Permissions-Policy           │
                └─────────────────────────┬────────────────────────────────┘
                                          │ ⑥ INSERT  / ⑦ SELECT
                                          ▼
                ┌─────────────────────── SUPABASE ────────────────────────┐
                │                                                          │
                │   decks table                                            │
                │   ───────────                                            │
                │     id            text  PK   (22-char crypto-random)    │
                │     html_content  text                                   │
                │     user_id       uuid  → auth.users(id)                 │
                │                          NULL = orphan deck              │
                │     title         text  derived from <title>/first <h1> │
                │     slide_count   int   derived <section>/.slide count  │
                │     created_at    timestamptz                            │
                │     updated_at    timestamptz                            │
                │     version       integer                                │
                │                                                          │
                │   shared_decks table                                     │
                │   ──────────────────                                     │
                │     deck_id       text  → decks(id)        ┐            │
                │     user_id       uuid  → auth.users(id)   │ PK         │
                │     role          text  'viewer'|'commenter'            │
                │     created_at    timestamptz                            │
                │     (one row = one recipient who has accessed a deck    │
                │     they don't own, used for "Shared with me")          │
                │                                                          │
                │   deck_views table                                       │
                │   ───────────────                                        │
                │     deck_id        text → decks(id)         ┐           │
                │     user_id        uuid → auth.users(id)    │ PK        │
                │     last_viewed_at timestamptz                          │
                │     (one row per (user, deck) — used to compute        │
                │      unread comment counts on the dashboard)            │
                │                                                          │
                │   comments table                                         │
                │   ──────────────                                         │
                │     id            uuid  PK                               │
                │     deck_id       text  → decks(id)                      │
                │     user_id       uuid  → auth.users(id)                 │
                │     author_email  text  (snapshot of email at post time) │
                │     slide_index   integer (0-based)                      │
                │     parent_id     uuid  → comments(id) (reserved for     │
                │                          future threaded replies)        │
                │     body          text  (max 4000 chars)                 │
                │     resolved      bool  (reserved for future triage UI)  │
                │     created_at    timestamptz                            │
                │     updated_at    timestamptz                            │
                │                                                          │
                │   RLS: enabled on all tables                             │
                │     decks:                                               │
                │       anon         → denied                              │
                │       authenticated→ SELECT if you own the deck OR it's │
                │                      in your shared_decks               │
                │                      (decks_select_own_or_shared);      │
                │                      INSERT / UPDATE / DELETE only      │
                │                      your own rows                      │
                │       service-role → full access, bypasses RLS          │
                │                      (used by API + viewer)             │
                │     shared_decks:                                        │
                │       authenticated→ SELECT / INSERT / DELETE only      │
                │                      rows where auth.uid() = user_id    │
                │     comments:                                            │
                │       authenticated→ SELECT / INSERT on a deck you can  │
                │                      access (own or shared); UPDATE /   │
                │                      DELETE only your own rows.         │
                │                      Anon → denied. (Comments require   │
                │                      sign-in to read or write.)         │
                │     deck_views:                                          │
                │       authenticated→ SELECT / INSERT / UPDATE only      │
                │                      rows where auth.uid() = user_id    │
                └──────────────────────────────────────────────────────────┘
```

## Components at a glance — sign-in & dashboard

```
        ┌─────────── USER'S BROWSER ────────────┐         ┌─────── EMAIL ───────┐
        │                                        │         │                      │
        │  /login                                │         │                      │
        │   Ⓐ user types email                  │         │                      │
        │   Ⓑ browser Supabase client calls     │ ──────▶ │ Supabase mails a    │
        │      signInWithOtp()                   │         │ one-time magic link │
        │                                        │         │                      │
        │  email                                 │         └──────────┬───────────┘
        │   Ⓒ user clicks the link              │ ◀──────────────────┘
        │      → /auth/callback?code=…           │
        └─────────────────────┬──────────────────┘
                              │
                              ▼
        ┌─────────────── VERCEL ─────────────────────────────────────┐
        │                                                              │
        │  GET /auth/callback?code=…&next=…                            │
        │   Ⓓ getSupabaseServer().auth.exchangeCodeForSession(code)  │
        │      → sets sb-* auth cookies on the response                │
        │   Ⓔ 302 redirect → next (if relative path) else /dashboard  │
        │                                                              │
        │  GET /dashboard (server component)                           │
        │   Ⓕ server client reads cookies → auth.getUser()            │
        │   Ⓖ query decks where user_id = auth.uid()                  │
        │      (RLS enforces this even though we also add .eq)         │
        │      → orphan decks (user_id NULL) never appear here         │
        │                                                              │
        │  proxy.ts (runs on every non-asset request)                  │
        │      Calls getUser() so @supabase/ssr can rotate the auth    │
        │      cookie when it's close to expiring. The user never      │
        │      gets logged out mid-session.                            │
        │      (proxy.ts is Next.js 16's renamed middleware.ts.)       │
        │                                                              │
        │  POST /auth/signout (route handler)                          │
        │      auth.signOut() clears cookies, 303 redirect → /login    │
        └──────────────────────────────────────────────────────────────┘
```

## Step-by-step: capturing a deck from Claude

| # | What happens | Where |
|---|---|---|
| ① | The user asks Claude for slides. Claude renders them as HTML — either as a `<pre>` code block inline, or inside an artifact iframe on `*.claudeusercontent.com`. | Claude's servers + claude.ai page |
| ② | The extension's `content.js` watches the page and recognises slide shapes (multiple `<section>` tags, `class="slide"` divs, etc.). | Browser (extension) |
| ③ | It injects a purple **"Open in SlideHuddle"** button below the slides. | Browser (extension) |
| ④ | On click, the extension reads the HTML — if it's in an artifact iframe (different origin), it uses `postMessage` to ask the iframe's copy of `content.js` to send the HTML back. | Browser (extension) |
| ⑤ | The extension POSTs the HTML to `slidehuddleapp.vercel.app/api/slides`. Because the page is `claude.ai`, the browser sends `Origin: https://claude.ai` — which the API requires. | Browser → Vercel |
| ⑥ | The API validates origin, size, and content-type, generates a random ID, does a best-effort session lookup (claude.ai has no SlideHuddle cookie, so `user_id` ends up NULL), derives `title` and `slide_count` from the HTML, and inserts a row using the service-role key (bypasses RLS). | Vercel → Supabase |
| ⑦ | The API returns `{id, url}` to the extension. | Vercel → Browser |
| ⑧ | The extension calls `window.open(url + "?source=capture")` — a new tab pointing at the viewer with a `source=capture` marker. That marker tells the viewer the person opening the URL is the creator, not a recipient. | Browser |
| ⑨ | The viewer page runs server-side, reads the deck by ID from Supabase (via the service-role key, so orphan decks work), and renders it. The actual slide HTML goes into an `<iframe sandbox="">` — a locked-down child frame where even malicious JS in the captured HTML can't run. | Vercel + Browser |

## Step-by-step: signing in and viewing your decks

| # | What happens | Where |
|---|---|---|
| Ⓐ | The user opens `/login` and types their email. | Browser |
| Ⓑ | The browser Supabase client calls `signInWithOtp()`. Supabase sends the user a one-time **magic link** (no password — clicking the link *is* the credential). | Browser → Supabase → email |
| Ⓒ | The user clicks the link in their inbox. It points at `/auth/callback?code=…`. | Email client → Browser → Vercel |
| Ⓓ | The callback route swaps the code for a real session by calling `exchangeCodeForSession()`. Supabase writes the access and refresh tokens into HTTP-only `sb-*` cookies. | Vercel |
| Ⓔ | The route redirects the user to `/dashboard`. The browser carries the new cookies along. | Vercel → Browser |
| Ⓕ | `/dashboard` runs server-side, reads the cookies via the server Supabase client, and asks Supabase "who is this?" via `auth.getUser()`. If there's no user, it redirects back to `/login`. | Vercel |
| Ⓖ | It runs two parallel queries: own decks (`decks` where `user_id = auth.uid()`) and shared decks (a join through `shared_decks`). RLS guarantees only that user's rows come back. Orphan decks (created from claude.ai without a session) have `user_id = NULL` and so don't appear under "My decks" — only in the viewer by direct link. | Vercel → Supabase |

Sign-out: the dashboard's "Sign out" button POSTs to `/auth/signout`, which
calls `auth.signOut()` (clearing the cookies) and redirects back to `/login`.

## The three Supabase clients

Three places talk to Supabase, each with a different key and a different job.

| Client | Where it runs | Key it uses | What it's for |
|---|---|---|---|
| **Admin** — [getSupabaseAdmin()](../web/src/lib/supabase.ts) | Vercel server only | `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS | Storing new decks (`/api/slides`) and reading any deck by ID for the viewer. Works for orphan decks because it ignores RLS. |
| **Server** — [getSupabaseServer()](../web/src/lib/supabase-server.ts) | Vercel server, per request | `NEXT_PUBLIC_SUPABASE_ANON_KEY` + the request's cookies | Anything that needs to know "who is signed in?" — `/auth/callback`, `/auth/signout`, `/dashboard`, the best-effort user lookup in `/api/slides`, and `proxy.ts` for session refresh. RLS applies, so it can only see the signed-in user's rows. |
| **Browser** — [getSupabaseBrowser()](../web/src/lib/supabase-browser.ts) | The user's browser | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The login page only — calls `signInWithOtp()` to trigger the magic-link email. |

The service-role key never leaves the server. Anything starting with
`NEXT_PUBLIC_` is shipped to the browser, which is fine for the anon key
because RLS gates what it can actually do.

## Orphan decks: capturing without signing in

This is intentional, not a bug. The flow it enables:

1. A first-time user, with no SlideHuddle account, asks Claude for slides on
   claude.ai and clicks "Open in SlideHuddle".
2. The extension POSTs the HTML from claude.ai to `/api/slides`. The browser
   does not include any SlideHuddle session cookie — there isn't one yet.
3. The API's best-effort auth lookup returns no user, so the deck is inserted
   with `user_id = NULL`. We call this an **orphan deck**.
4. The viewer URL still opens fine: the viewer uses the service-role key,
   which bypasses RLS, so it doesn't care whether a row has a `user_id` or
   not.
5. The deck does **not** appear in anyone's `/dashboard`, because the
   dashboard query asks for rows where `user_id = auth.uid()` and orphans
   match no user.

The result: the extension works on day one without forcing anyone to sign
up. Users who later create an account get a dashboard of their *future*
captures; older orphan decks remain reachable only by their direct viewer
link.

## Creators vs recipients: who sees what in the viewer

A viewer URL like `/viewer?id=ABC123` can be opened by two very different
people. We distinguish them by a single query-string marker:

- **Creator** — the URL has `?source=capture` (the extension always adds
  this when it opens the deck for the first time). This is the person who
  just captured the slides.
- **Recipient** — the URL has no `source` parameter. This is anyone who
  received the link from someone else.

When the viewer page renders for a stored deck, it picks one of four
behaviours based on `source=capture` and whether the user is signed in:

| State | What the viewer does |
|---|---|
| Creator, signed in, deck is orphan (`user_id` is NULL) | Quietly **claims** the deck — sets `user_id = current user`. The deck now appears in their "My decks" on the dashboard. |
| Creator, signed out | Shows a banner: **"Sign in to save this deck to your dashboard."** The Sign-in button carries a `?next=` back to the same viewer URL, so the claim happens automatically once they finish signing in. |
| Recipient, signed in, doesn't own the deck | Quietly **records** a row in `shared_decks` (idempotent — repeat visits don't add duplicates). The deck now appears under "Shared with me" on their dashboard. |
| Recipient, signed out | Shows a banner: **"Sign in to comment and collaborate."** The Sign-in button carries `?next=` back to the viewer; after signing in, the recipient flow kicks in. |

A few extra rules to make this safe and sane:

- **The "Copy link" button strips `?source=capture` before copying.** That
  means a recipient who receives a link can never accidentally trigger the
  creator claim flow.
- **Claim only succeeds on orphan decks.** The `claimOrphanDeck` helper
  updates `user_id` only when it's currently NULL — so if a creator is
  slow to sign in and the URL leaks, the claim can't take a deck away
  from someone who already owns it.
- **Recipients aren't tracked on decks they own.** A user visiting their
  own deck via a no-source URL doesn't get added to `shared_decks`.
- **Orphan decks are never tracked.** If a signed-in user visits an orphan
  deck through a no-source URL (e.g. they used an older extension build
  that didn't add `?source=capture`), we don't insert a `shared_decks`
  row — nobody really "shared" a deck with no owner. The deck stays
  reachable only by direct link.

## Comments

Comments live on the `comments` table, one row per comment, scoped to a
specific deck **and** a specific `slide_index` (0-based). The viewer's
sidebar shows comments for the current slide; the slide counter shows a
small "· N" badge when other slides have comments.

The end-to-end flow:

1. The viewer page server-renders. If the user is signed in and can
   access the deck (owner or has a `shared_decks` row), it fetches their
   visible comments via `getCommentsForDeck` and passes them down as
   `initialComments` to `SlideViewer`.
2. The user clicks **Comments** in the slide nav row. The right-side
   `CommentsPanel` opens and shows comments filtered to the current
   slide.
3. Posting a comment uses the **browser** Supabase client (not the
   server admin client). The browser sends an authenticated `insert`
   directly to Supabase; RLS does the rest of the gating.
4. We snapshot `author_email` on the row at insert time so the comment
   keeps a sensible display name even if the user later changes their
   email or deletes their account.

A few extra notes:

- **Anon viewers see no comments.** The RLS policy is `to authenticated`
  only; there's no policy granted to the anon role. Anyone hitting the
  viewer with a shared link but no session sees only slides.
- **Comments on orphan decks are impossible.** RLS requires owner OR
  shared-deck access; orphans (no `user_id`) match neither, so nobody
  can post or read. The deck must first be claimed by signing in via the
  `?source=capture` creator flow.
- **`parent_id` and `resolved` are reserved.** They exist in the schema
  so we don't need another migration when threading and the resolve
  workflow land.
- **Unread comments are surfaced on the dashboard.** Every viewer page
  load by a signed-in user upserts a row in `deck_views` recording the
  `last_viewed_at` timestamp. The dashboard then counts comments with
  `created_at > last_viewed_at` per deck and shows a red dot + "N new"
  on the card. Total-comment counts (irrespective of read state) are
  shown alongside.

## The `?next=` redirect for "sign in and come back"

When a viewer-page banner sends an unsigned-in user to `/login`, it tags
the URL with `?next=/viewer?id=…&source=capture` (or the same without
`source` for recipients). That parameter flows through three places:

1. `/login` reads it from `window.location.search` and tacks it onto the
   `emailRedirectTo` passed into `signInWithOtp()`.
2. The magic-link email lands at `/auth/callback?code=…&next=…`.
3. `/auth/callback` finishes the auth exchange and 302-redirects to
   `next` instead of the default `/dashboard`.

The callback only honours a `next` value that starts with a single `/` —
absolute URLs and protocol-relative `//evil.com` are dropped. That blocks
an open-redirect attack via a crafted magic-link URL.

## Security boundaries

| Boundary | What it stops |
|---|---|
| Extension `host_permissions` | Extension can only fetch from claude.ai, the Vercel domain, and localhost. Can't be tricked into hitting random servers. |
| API origin allowlist | A malicious website can't POST junk decks to the API even if a visitor lands there. |
| API size & content-type checks | Can't flood Supabase with megabytes of garbage per request. |
| Crypto-random deck IDs | Can't enumerate or guess other users' deck URLs. |
| Supabase RLS — `decks_*` policies | Even with the public anon key, a signed-in user can only `INSERT/UPDATE/DELETE` rows where `auth.uid() = user_id`. `SELECT` allows their own decks *or* decks linked to them via `shared_decks` (the `decks_select_own_or_shared` policy). The anon (logged-out) role has no policies and therefore can't read anything directly. |
| Supabase RLS — `shared_decks_*_own` policies | Users can only read, insert, or remove their own `shared_decks` rows — they can't snoop on who else has accessed a given deck. |
| Supabase RLS — `comments_*` policies | Comments are gated behind deck access: you can only read or post comments on a deck you own or have shared with you. The anon role has no policies, so unauthenticated link-viewers see no comments and can't post. Edit/delete restricted to the comment's author. |
| Open-redirect protection on `?next=` | `/auth/callback` only honours `next` values that start with a single `/`. Absolute URLs and protocol-relative paths are dropped, so a crafted magic link can't bounce a user to a phishing site after sign-in. |
| Claim-only-on-orphan guard | `claimOrphanDeck` updates `user_id` only when it's currently NULL, so a leaked `?source=capture` URL can't take a deck away from someone who already owns it. |
| Service-role key on the server only | The only way to bypass RLS is the service-role key, which lives in Vercel's env vars and is never sent to the browser. |
| HTTP-only session cookies | The `sb-*` auth cookies aren't readable from JavaScript, so an XSS bug on a SlideHuddle page can't steal the session. |
| Magic-link sign-in | No passwords stored anywhere on our side. The link is one-time and short-lived, and the only way to receive it is to control the email inbox. |
| `<iframe sandbox="">` in viewer | Even if Claude returns malicious HTML, scripts can't execute in the viewer. |
| Web security headers | Defence-in-depth against clickjacking, MIME-sniffing attacks, info leakage to third parties. |

## Key files

| File | Role |
|---|---|
| [manifest.json](../manifest.json) | Extension config — permissions, content-script matches |
| [content.js](../content.js) | The extension script that runs on Claude pages |
| [popup.html](../popup.html) | The small info popup when the extension icon is clicked |
| [web/src/app/api/slides/route.ts](../web/src/app/api/slides/route.ts) | The POST endpoint that stores captured decks. Does a best-effort session lookup to attach `user_id`. |
| [web/src/lib/slide-store.ts](../web/src/lib/slide-store.ts) | Supabase wrapper for storing/fetching decks. Derives `title` and `slide_count` from the HTML on insert. Also exposes `claimOrphanDeck` (sets `user_id` on an unclaimed deck) and `trackSharedDeck` (upserts a `shared_decks` row for recipient flows). |
| [web/src/lib/supabase.ts](../web/src/lib/supabase.ts) | Lazy-initialised service-role (admin) Supabase client — bypasses RLS, server-only |
| [web/src/lib/supabase-server.ts](../web/src/lib/supabase-server.ts) | Per-request anon-key Supabase client wired to the request's cookies — used for any "who is signed in?" check |
| [web/src/lib/supabase-browser.ts](../web/src/lib/supabase-browser.ts) | Browser anon-key Supabase client — used by the login form to trigger the magic-link email |
| [web/src/proxy.ts](../web/src/proxy.ts) | Next.js 16 proxy (formerly middleware). Runs on every non-asset request and lets `@supabase/ssr` rotate the auth cookie when it's close to expiring. |
| [web/src/app/login/page.tsx](../web/src/app/login/page.tsx) | The magic-link sign-in form. Forwards any `?next=…` query string through to the auth callback so users return to where they started after signing in. |
| [web/src/app/auth/callback/route.ts](../web/src/app/auth/callback/route.ts) | Magic-link landing route — swaps the one-time code for a session and redirects to `next` (defaults to `/dashboard`). Only relative paths are honoured to prevent open-redirects. |
| [web/src/app/auth/signout/route.ts](../web/src/app/auth/signout/route.ts) | Sign-out endpoint — clears the session cookies and redirects to `/login` |
| [web/src/app/dashboard/page.tsx](../web/src/app/dashboard/page.tsx) | "Your decks" page — server-renders two sections: "My decks" (owned) and "Shared with me" (joined via `shared_decks`). |
| [web/src/app/viewer/page.tsx](../web/src/app/viewer/page.tsx) | The viewer route — reads a deck by ID server-side (works for orphan decks too). Also runs the creator-claim or recipient-track side-effect and decides which sign-in banner (if any) to show. |
| [web/src/app/viewer/SlideViewer.tsx](../web/src/app/viewer/SlideViewer.tsx) | The React component that parses and renders slides |
| [web/src/app/viewer/ShareBar.tsx](../web/src/app/viewer/ShareBar.tsx) | "Copy link" share bar at the top of stored-deck viewer pages. Strips `?source=capture` before copying. |
| [web/src/app/viewer/SignInBanner.tsx](../web/src/app/viewer/SignInBanner.tsx) | Banner shown above the viewer to signed-out users — different copy for creators vs recipients, with a "Sign in" link that carries `?next=` back to the viewer. |
| [web/src/app/viewer/CommentsPanel.tsx](../web/src/app/viewer/CommentsPanel.tsx) | Right-side sidebar that lists comments on the current slide and lets the user post one. |
| [web/next.config.ts](../web/next.config.ts) | Web app config — security headers live here |
| [docs/auth-migration.sql](./auth-migration.sql) | One-shot SQL for the new `user_id`/`title`/`slide_count` columns and the `decks_*_own` RLS policies. Idempotent — safe to re-run. |
| [docs/shared-decks-migration.sql](./shared-decks-migration.sql) | One-shot SQL for the `shared_decks` table, its RLS policies, and the widened `decks_select_own_or_shared` policy. Idempotent — safe to re-run. |
| [docs/comments-migration.sql](./comments-migration.sql) | One-shot SQL for the `comments` table and its RLS policies. Includes `parent_id` and `resolved` columns reserved for future threading and triage UI. Idempotent — safe to re-run. |
| [docs/deck-views-migration.sql](./deck-views-migration.sql) | One-shot SQL for the `deck_views` table and its RLS policies. Used by the dashboard to compute unread comment counts. Idempotent — safe to re-run. |
