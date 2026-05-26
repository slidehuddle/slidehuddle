# SlideHuddle architecture

How the Chrome extension, web app, and database fit together — and where the
security boundaries are.

## Components at a glance

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
                │     created_at    timestamptz                            │
                │     updated_at    timestamptz                            │
                │     version       integer                                │
                │                                                          │
                │   RLS: enabled                                           │
                │     anon role  →  SELECT/INSERT/UPDATE/DELETE all denied │
                │     service-role  →  full access (used by API only)     │
                └──────────────────────────────────────────────────────────┘
```

## Step-by-step: what happens when a user clicks the button

| # | What happens | Where |
|---|---|---|
| ① | The user asks Claude for slides. Claude renders them as HTML — either as a `<pre>` code block inline, or inside an artifact iframe on `*.claudeusercontent.com`. | Claude's servers + claude.ai page |
| ② | The extension's `content.js` watches the page and recognises slide shapes (multiple `<section>` tags, `class="slide"` divs, etc.). | Browser (extension) |
| ③ | It injects a purple **"Open in SlideHuddle"** button below the slides. | Browser (extension) |
| ④ | On click, the extension reads the HTML — if it's in an artifact iframe (different origin), it uses `postMessage` to ask the iframe's copy of `content.js` to send the HTML back. | Browser (extension) |
| ⑤ | The extension POSTs the HTML to `slidehuddleapp.vercel.app/api/slides`. Because the page is `claude.ai`, the browser sends `Origin: https://claude.ai` — which the API requires. | Browser → Vercel |
| ⑥ | The API validates origin, size, and content-type, generates a random ID, and inserts a row into Supabase using the service-role key (bypasses RLS). | Vercel → Supabase |
| ⑦ | The API returns `{id, url}` to the extension. | Vercel → Browser |
| ⑧ | The extension calls `window.open(url)` — a new tab pointing at the viewer. | Browser |
| ⑨ | The viewer page runs server-side, reads the deck by ID from Supabase, and renders it. The actual slide HTML goes into an `<iframe sandbox="">` — a locked-down child frame where even malicious JS in the captured HTML can't run. | Vercel + Browser |

## Security boundaries

| Boundary | What it stops |
|---|---|
| Extension `host_permissions` | Extension can only fetch from claude.ai, the Vercel domain, and localhost. Can't be tricked into hitting random servers. |
| API origin allowlist | A malicious website can't POST junk decks to the API even if a visitor lands there. |
| API size & content-type checks | Can't flood Supabase with megabytes of garbage per request. |
| Crypto-random deck IDs | Can't enumerate or guess other users' deck URLs. |
| Supabase RLS | Even with the public anon key, no one can read/write the database directly. The service-role key only lives on Vercel's servers. |
| `<iframe sandbox="">` in viewer | Even if Claude returns malicious HTML, scripts can't execute in the viewer. |
| Web security headers | Defence-in-depth against clickjacking, MIME-sniffing attacks, info leakage to third parties. |

## Key files

| File | Role |
|---|---|
| [manifest.json](../manifest.json) | Extension config — permissions, content-script matches |
| [content.js](../content.js) | The extension script that runs on Claude pages |
| [popup.html](../popup.html) | The small info popup when the extension icon is clicked |
| [web/src/app/api/slides/route.ts](../web/src/app/api/slides/route.ts) | The POST endpoint that stores captured decks |
| [web/src/lib/slide-store.ts](../web/src/lib/slide-store.ts) | Supabase wrapper for storing/fetching decks |
| [web/src/lib/supabase.ts](../web/src/lib/supabase.ts) | Lazy-initialised service-role Supabase client |
| [web/src/app/viewer/page.tsx](../web/src/app/viewer/page.tsx) | The viewer route — reads a deck by ID server-side |
| [web/src/app/viewer/SlideViewer.tsx](../web/src/app/viewer/SlideViewer.tsx) | The React component that parses and renders slides |
| [web/next.config.ts](../web/next.config.ts) | Web app config — security headers live here |
