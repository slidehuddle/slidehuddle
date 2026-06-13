# SlideHuddle — Feature Inventory (code-derived audit)

A read-only audit of **what exists in the app today**, derived from the source code
itself. Docs (`TECHNICAL.md`, `docs/architecture.md`, the SQL migrations) were used
only to cross-check; where they disagree with the code, that's recorded in §5 —
never reconciled silently. Every claim cites where it was verified. Anything that
couldn't be verified from code is in the **Uncertain** list at the end.

---

## 1. Snapshot header

| Fact | Value | Verified in |
|---|---|---|
| Audit date | 12 June 2026 | — |
| Branch / commit | `main` @ `41041ac` (10 Jun 2026); working tree clean except untracked local `.wip-backup/` | `git log` / `git status` |
| Extension version | **0.4.0** in `manifest.json` — but `popup.html` hardcodes "**v0.1.0** · ready" (**mismatch**, cosmetic) | [manifest.json](../manifest.json) line 4; [popup.html](../popup.html) line 46 |
| Web framework | Next.js **16.2.6**, React **19.2.4**, TypeScript ^5, Tailwind ^4 | [web/package.json](../web/package.json) |
| Key dependencies | @supabase/supabase-js ^2.106.2 · @supabase/ssr ^0.10.3 · @modelcontextprotocol/sdk ^1.26.0 · mcp-handler ^1.1.0 · zod ^4.4.3 | [web/package.json](../web/package.json) |
| Database tables | **7** (`decks`, `deck_versions`, `shared_decks`, `deck_views`, `comments`, `slide_stubs`, `slide_flags`) | `docs/*.sql` (13 migration files) |
| Hosting | Vercel (`slidehuddleapp.vercel.app`, hardcoded in `content.js` and `SendToClaudeButton.tsx`) + Supabase | content.js:15; SendToClaudeButton.tsx:45 |

**Environment variables the code actually reads** (8):

| Variable | Read in | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | supabase.ts, supabase-server.ts, supabase-browser.ts, proxy.ts | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | supabase-server.ts, supabase-browser.ts, proxy.ts | Public DB key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | supabase.ts, update-token.ts, mcp-oauth.ts | RLS-bypass key **and** default HMAC signing secret for write tokens + OAuth tokens |
| `MCP_TOKEN_SECRET` | mcp-oauth.ts:37 | Optional dedicated OAuth signing secret (falls back to service-role key) |
| `MCP_RATE_LIMIT_PER_MIN` | mcp/route.ts:955 | MCP per-user rate limit (default 120/min) |
| `SLIDES_RATE_LIMIT_PER_MIN` | api/slides/route.ts:32 | Capture endpoint per-IP rate limit (default 30/min) — **not documented in TECHNICAL.md** |
| `MCP_INLINE_TOKEN_BUDGET` | mcp/route.ts:67 | Token budget for inline MCP deck reads (default 22000) — **not documented** |
| `MCP_LIST_DECKS_LIMIT` | mcp/route.ts:80 | Cap on `list_decks` results (default 50) — **not documented** |

---

## 2. Capability inventory, by area

Status legend: ✅ complete · 🟡 partial · 🧩 stub/reserved · 📝 documented-but-not-found.
"Enforced where": server action · RLS · capability token · origin gate · UI-only · n/a.

### A. Capture & creation

| Feature | What a user can do | Status | Enforced where | Evidence | Limitations/notes |
|---|---|---|---|---|---|
| Detect HTML artifact cards | On claude.ai, any HTML artifact gets an "Open in SlideHuddle" button | ✅ | n/a (client-side) | content.js `detectArtifactSlides` (829) | Any HTML artifact qualifies (keyword check removed); non-slide ones fail gracefully at click time |
| Capture from artifact source | Click captures from the inline `<pre>` source, or from the preview iframe via postMessage | ✅ | n/a | content.js `makeArtifactGetHtml` (801), `captureFromIframe` (320) | Lazy lookup at click time; 5s timeout; "No source found" if the preview isn't open |
| Detect & capture code blocks | A `<pre>` containing slide-shaped HTML gets the button; click sends its text | ✅ | n/a | content.js `detectCodeBlockSlides` (935), `textHasSlideHTML` (899) | 4 heuristic shapes (≥2 `<section>`, slide classes, …) |
| Detect & capture inline preview iframes | Visible deck iframes on Claude's content domains get the button | ✅ | n/a | content.js `detectInlineIframeSlides` (982), `isHiddenOrTinyIframe` (967) | Filters 1×1/hidden utility iframes; iframe-mode handler scores nested candidates (`captureBestHtmlFromHere`, 58) |
| PPTX / Presentation artifacts | **Detected and logged only — no button is injected** | 🧩 | n/a | content.js 860–871 ("PPTX detected — button suppressed (capture not built yet)"); `logPptxFileInfo` (748) | Deliberate: only HTML decks can be captured today |
| Create deck via `/api/slides` | The extension POSTs HTML; gets back id, share URL, write token | ✅ | origin gate + rate limit | api/slides/route.ts `POST` (98): origin allowlist (52–74), 30/min/IP limit (111), 2MB cap (134, 166), content-type check, design-system rejection (185) | No login: deck is an **orphan** (`user_id NULL`) unless a session cookie happens to be present (244–255) |
| Update deck via `/api/slides?update=` | The creating browser saves a new version of its deck | ✅ | capability token | route.ts 203–237; token check `verifyDeckWriteToken` (update-token.ts:56) | Token is HMAC-signed, deck-scoped, 180-day TTL, stored only in the creator's `chrome.storage` |
| Update-vs-create choice | If the conversation already made a deck, the user is asked: update it or create separate | ✅ | n/a | content.js `showConversationChoice` (545), conversation map (32–42, 369–384) | Binding is **per-browser** (`chrome.storage.local`) — no cross-device "this chat has a deck" lookup |
| Conversation binding | New decks record which claude.ai chat they came from | ✅ | origin gate | content.js `getConversationId` (39); route.ts 242; slide-store `storeSlides` (103) stores `claude_conversation_id` | Graceful fallback if the DB column is missing |
| Create deck via MCP | An AI assistant (Claude/ChatGPT) creates a deck owned by the OAuth user | ✅ | server (OAuth token) | mcp/route.ts `create_deck` (212–286); identity from token only (`getAuthExtra`, 87) | Same 2MB/design-system validation as the API (`validateSlidesHtml`, 133) |

### B. Rendering & viewing

| Feature | What a user can do | Status | Enforced where | Evidence | Limitations/notes |
|---|---|---|---|---|---|
| View a deck by link | Anyone with the link sees the slides — no account needed | ✅ | server (service-role read; intentionally open) | viewer/page.tsx 101–151 (`getStoredSlides` via admin client) | Unguessable 22-char crypto-random id is the only gate (slide-store `generateDeckId`, 17) |
| Sandboxed slide rendering | Captured HTML runs in a locked-down iframe; its scripts can't touch SlideHuddle | ✅ | n/a (browser sandbox) | SlideViewer.tsx:876 and FloatingViewer.tsx:554: `sandbox="allow-scripts"` (no `allow-same-origin`) | Scripts DO run (needed for animated decks) but in an opaque origin |
| Slide canvas detection | Decks render at their authored size; undetected decks are measured at runtime | ✅ | n/a | parse-deck.ts `parseDeck`/`detectSlideDimensions`; SlideViewer 193–225 (postMessage measure, validated) | Default canvas 1280×720 |
| Navigation | Arrows, keyboard ←/→, counter pill, click a thumbnail | ✅ | n/a | SlideViewer 227–240, 951–977; ThumbnailStrip.tsx | |
| Thumbnail strip | Miniature of every slide (+ requested-slide cards, comment badges, flag marks) | ✅ | n/a | ThumbnailStrip.tsx (current, horizontal); FloatingThumbnailStrip.tsx (floating, vertical) | |
| Requested-slide (stub) display | Stubs render as green placeholder cards in sequence, visible to **all** viewers incl. anonymous | ✅ | server (service-role read, emails redacted) | StubSlideView.tsx; display-items.ts `buildDisplayItems`; page.tsx 241–251 (anon email redaction) | |
| Historical version viewing | Pick any past version from the version chip; renders read-only with its own comments | ✅ | server | page.tsx 134–177; DeckVersionNav.tsx | Stubs/flags hidden on historical views (page.tsx 250) |
| Sample deck | `/viewer` with no id shows a built-in sample | ✅ | n/a | page.tsx 63–66; lib/sample-slides.ts | |
| Floating viewer (redesign) | Full-bleed viewer with auto-hiding controls, huddle avatars, arrival banner | 🟡 | server (same data gating) | FloatingViewer.tsx; gated by `?view=floating`, **default off** (page.tsx 46, 262) | Zoom is an inert placeholder (FloatingViewer `Placeholder`, 74); no mobile layout; no flag-creation UI; no live version poll (see E) |
| Zoom | — | 🧩 | n/a | FloatingViewer.tsx 748–757 ("Zoom — coming soon", inert) | Current viewer has no zoom either |
| Deck/data load-error states | Real DB failures show "couldn't load" instead of fake-empty | ✅ | server | slide-store `ListLoad` pattern (93); SlideViewer 706–759 | Deliberate empty-vs-error distinction throughout |

### C. Collaboration inputs

| Feature | What a user can do | Status | Enforced where | Evidence | Limitations/notes |
|---|---|---|---|---|---|
| Comment on a slide | Any signed-in user with deck access (owner or shared) comments on the current slide, on the current version | ✅ | RLS | Insert via browser client (SlideViewer `handleAddComment`, 456); RLS `comments_insert_on_accessible_decks` (comments-migration.sql 59; tightened in comments-author-email-migration.sql) | Version-scoped; 4000-char cap (DB check); anonymous users can't comment **or read** comments; impossible on orphan decks (no one has access) |
| Delete own comment | Authors delete their own comments | ✅ | RLS | `handleDeleteComment` (504); policy `comments_delete_own` | **No author self-edit UI** — RLS would allow `update_own`, but no UI calls it; only the owner can (curation-)edit |
| Request a slide (stub) | Signed-in collaborators insert a "requested slide" at any position, with title/subtitle/body | ✅ | RLS | `handleInsertStub` (553); InsertStubForm.tsx; policy in slide-stubs-migration.sql 55 | Per-deck (not version-scoped); length caps in DB |
| Edit a requested slide | The requester **or** the owner edits its fields | ✅ | server action | `editStubFieldsAction` (viewer/actions.ts 56) → `editStubFields` (slide-store 1361, requester-or-owner check) | |
| Delete a requested slide | The requester or the owner removes it | ✅ | server action | `deleteStubAction` (actions.ts 16) → `deleteStub` (slide-store 1307) | |
| Flag a slide for removal | Signed-in collaborators flag a real slide with a reason | ✅ | RLS | SlideViewer `handleFlag` (646); SlideFlagControl.tsx; slide-flags-migration.sql | **Current viewer only** — the floating viewer has no flag-creation UI (flags there are owner-only prompt input, FloatingViewer page.tsx comment 284–286) |
| Unflag | The flagger removes their own flag | ✅ | RLS | `handleUnflag` (673); `slide_flags_delete_own` | |
| Live updates of teammates' input | Comments/stubs/flags from others appear without refresh | ✅ | RLS (Realtime authorized with the user's token) | SlideViewer 247–368 (9 `postgres_changes` subscriptions); useDeckComments.ts:60 / useDeckStubs.ts:54 for the floating viewer | Live-arrived stub/flag shows "a teammate" until reload (email not on the row) |
| Comment on a requested slide | — | 📝 | — | CommentsPanel renders for stubs as informational only; comments attach only to real slides (FloatingViewer 464–470) | Not built (the panel says so) |

### D. Owner curation

| Feature | What a user can do | Status | Enforced where | Evidence | Limitations/notes |
|---|---|---|---|---|---|
| Dismiss / restore a comment | Owner excludes a comment from the AI prompt (still visible, struck through) | ✅ | server action | `setCommentCurationAction` (actions.ts 35) → `setCommentCuration` (slide-store 944, owner re-checked) | |
| Owner-edit a comment | Owner rewrites the text **sent to the AI**; author's original is never touched | ✅ | server action | same path, `owner_edited_body`; applied in feedback-prompt.ts `selectCuratedFeedback` (27) | |
| Dismiss / restore a stub | Same for requested slides | ✅ | server action | `setStubCurationAction` → `setStubCuration` (slide-store 1000) | The old stub `owner_edited_body` override is **retired** — structured fields are the source of truth (feedback-prompt.ts 95–97) |
| Dismiss / restore / owner-edit a flag | Same for removal flags (edit the reason) | ✅ | server action | `setFlagCurationAction` → `setFlagCuration` (slide-store 1054), `owner_edited_reason` | |
| Persistence across revision rounds | After an AI revision, addressed stubs/flags are marked resolved (kept for audit), comments fall out via version-scoping | ✅ | server | `clearAddressedFeedback` (slide-store 1130), called by MCP `update_deck` (mcp/route.ts 430); `resolved_at` filter in `getStubsForDeck`/`getFlagsForDeck` | **Extension-path updates do NOT resolve feedback** — only the MCP update calls it (see §5) |

### E. Versioning

| Feature | What a user can do | Status | Enforced where | Evidence | Limitations/notes |
|---|---|---|---|---|---|
| Version snapshots | Every version (incl. v1) is stored immutably; the deck row mirrors the latest | ✅ | server | slide-store `storeSlides` (144), `updateDeck` (205) + `snapshotVersion` (159); backfill of pre-versioning decks (231) | |
| Version history UI | A version chip + dropdown lists versions; pick one to view it | ✅ | server | DeckVersionNav.tsx; page.tsx 134–146 | **No rollback** — viewing only (docs call rollback "eventually") |
| "Updated since you were here" banner | Returning signed-in viewers see "Claude revised this deck… v1 → v2 · 1 slide added" | ✅ | server | version-banner.ts `computeUpdateBanner`; deck-diff.ts `summarizeDeckChange`; UpdatedBanner.tsx; page.tsx 190–210 | Uses the **previous** `last_viewed_at`, read before `recordDeckView` updates it (page.tsx 183) |
| Arrival activity banner (floating) | Returning signed-in viewers see "Alex and Jordan added N comments since you were here" + Catch up | ✅ | server | arrival-activity.ts `computeArrivalActivity`; ArrivalBanner.tsx; page.tsx (signed-in gate) | Floating viewer only; never for anonymous/first-time viewers |
| Live new-version detection | An open viewer notices an out-of-band revision (e.g. via MCP) and refreshes or banners | 🟡 | n/a | SlideViewer 104–144: polls `/api/deck-version` every 12s; banner if a comment is mid-type | **Current viewer only — the floating viewer does not poll** |
| Update via extension | Creator's browser saves a new version (same link) | ✅ | capability token | content.js 667–674; api/slides 203–237 | Does **not** mark feedback resolved |
| Update via MCP | The AI saves a revision; addressed feedback resolved; history kept | ✅ | server (owner-only) | mcp/route.ts `update_deck` (366–459) | |
| Conversation binding shown | `list_decks` returns the source claude.ai chat link | ✅ | server | mcp/route.ts 535–537, 554–556 | |

### F. Sharing, access & roles

| Feature | What a user can do | Status | Enforced where | Evidence | Limitations/notes |
|---|---|---|---|---|---|
| Link sharing | Share the viewer URL; anyone with it can view slides | ✅ | server (intentionally open) | page.tsx (service-role read); CopyLinkButton.tsx | "Anyone with the link" — no per-recipient view control |
| Copy link strips `source=capture` | Recipients can never inherit the creator-claim flag | ✅ | UI-only (but claim itself is server-guarded) | CopyLinkButton.tsx 44–48 | |
| Auto "Shared with me" | A signed-in recipient opening the link gets the deck on their dashboard | ✅ | server | page.tsx 161–163 → `trackSharedDeck` (slide-store 598, idempotent upsert) | Never tracked on own/orphan decks |
| `shared_decks.role` | — | 🧩 | nowhere | Column allows `'viewer'`/`'commenter'` (shared-decks-migration.sql 13) but code only ever writes `'viewer'` (slide-store 606) and **nothing reads it** | Decorative; no viewer-vs-commenter enforcement exists |
| Orphan decks & claiming | Extension captures with no login create ownerless decks; the creator claims on first signed-in visit with `?source=capture` | ✅ | server | api/slides 244–255; page.tsx 154–160 → `claimOrphanDeck` (slide-store 517, only succeeds while `user_id IS NULL`) | |
| Owner deletes a deck | Permanent delete with a 5s undo window; cascade removes all child rows | ✅ | server action | dashboard/actions.ts `deleteOwnedDeckAction` → `deleteDeck` (slide-store 544, owner re-checked); DashboardDecks.tsx `UNDO_MS` (29) | |
| Collaborator removes a shared deck | Removes only their own dashboard link | ✅ | server action | `removeSharedDeckAction` → `removeSharedDeck` (slide-store 578, scoped to own row) | |
| Invite by email | — | 📝 | — | No code path sends share invitations (grep: no mail libraries, no invite) | Sharing is copy-the-link only |

### G. Auth & identity

| Feature | What a user can do | Status | Enforced where | Evidence | Limitations/notes |
|---|---|---|---|---|---|
| Magic-link sign-in | Email a one-time link; no passwords | ✅ | Supabase | login/page.tsx `signInWithOtp` (32); auth/callback/route.ts `exchangeCodeForSession` (33) | |
| Open-redirect protection | `?next=` only honors relative single-slash paths | ✅ | server | auth/callback `safeNext` (16–21) | |
| Session keep-alive | Sessions refresh transparently on every request | ✅ | server | proxy.ts (calls `getUser()` on every non-asset request) | |
| Sign out | One click, cookies cleared | ✅ | server | auth/signout/route.ts (303 redirect) | |
| User identity/display | Identity = email only. Avatar = first letter of email | ✅ (as designed) | n/a | AvatarMenu.tsx 15; HuddleAvatars.tsx `initialFor` | **No profiles, display names, or avatar images anywhere** |

### H. Dashboard

| Feature | What a user can do | Status | Enforced where | Evidence | Limitations/notes |
|---|---|---|---|---|---|
| "My huddles" (owned decks) | List of owned decks, newest first, with version pill, slide count, share count | ✅ | RLS (+ explicit filter) | dashboard/page.tsx 60–73 | Heading text is now "My huddles" |
| "Huddles shared with me" | Decks others shared, with the owner's email | ✅ | RLS + admin lookups | page.tsx 66–73, 97–109 (`getOwnerEmails` via admin) | |
| Unread comment badges | "N new" per deck since your last view | ✅ | server | `getDeckCommentCountsForUser` (slide-store 792) vs `deck_views`; failure shows an alert instead of silent zeros (page.tsx 171) | Counts only current-version comments |
| Delete / remove with undo | Gmail-style 5s undo before the delete commits | ✅ | server action | DashboardDecks.tsx 28–31 + actions | |
| Empty-state growth prompt | No decks → "Start your own decks" with a copyable MCP connector URL | ✅ | n/a | DashboardDecks.tsx `StartYourOwnPrompt` (71) | |

### I. MCP server & OAuth

All tools require a valid bearer token; the **user id comes only from the token**, never from arguments (mcp/route.ts 928–946). Owner-only tools return an identical neutral "not found, or you are not its owner" so deck ids can't be probed (`loadOwnedDeck`, 156).

| Tool | R/W | What it does | Permission gate | Evidence |
|---|---|---|---|---|
| `create_deck` | write | Create a deck from HTML, owned by the token's user | authenticated | mcp/route.ts 212 |
| `get_feedback` | read | Owner-curated feedback (dismissed dropped, edits applied) | **owner-only** | 289 |
| `update_deck` | write | Save a revision; bumps version; resolves addressed stubs/flags | **owner-only** | 366 |
| `list_decks` | read | Owned decks + pending-feedback counts, capped at 50 (tunable) | own decks | 462 |
| `get_deck` | read | One deck's summary + feedback counts | **owner-only** | 576 |
| `get_deck_slides` | read | Current slide HTML (minified copy), or a share-link pointer if too big | **owner-only** | 666 |
| `search` | read | Title search over owned decks (ChatGPT-connector alias) | own decks | 785 |
| `fetch` | read | One deck as a document (ChatGPT-connector alias) | **owner-only** | 843 |

**OAuth (stateless — no DB tables):** all artifacts are signed HMAC blobs (mcp-oauth.ts). Dynamic client registration (oauth/register, RFC 7591) → consent screen showing the **destination host** as the trust signal (oauth/authorize 198–225) → 60-second auth codes → 30-day access tokens (mcp-oauth.ts 53–55). PKCE S256 **required** (authorize 139; token 96). Public client, no secret. CSRF origin check on the consent POST (authorize 232). **No revocation** — a leaked token lives until expiry (documented trade-off, mcp-oauth.ts 21–27). Rate limit: 120/min per user (route.ts 948–1000), in-memory per-instance (rate-limit.ts caveat).

Read-tool size handling: deck HTML is minified for the model (minify-deck-html.ts, transient copy only) and gated against a ~22k-token inline budget; oversized decks degrade to a share-link pointer (mcp/route.ts 729–757).

### J. Other API endpoints

| Endpoint | What it does | Status | Auth | Evidence |
|---|---|---|---|---|
| `GET /api/deck-version?id=` | Returns just `{version}` — powers the viewer's revision poll | ✅ | **none** (returns only a version number) | api/deck-version/route.ts |
| `POST /api/recount-my-decks` | Maintenance backfill: re-derive title/slide_count for your own decks | ✅ | session (401 otherwise) | api/recount-my-decks/route.ts | Run by hand from the console; no UI |
| `OPTIONS /api/slides` | CORS preflight for the extension (incl. `Access-Control-Allow-Private-Network`) | ✅ | origin gate | api/slides/route.ts 90–96 |
| `/.well-known/oauth-protected-resource` + `/oauth-authorization-server` | OAuth discovery for MCP clients | ✅ | public by design | both route.ts files |

### K. Feedback-to-AI ("Send to Claude")

| Feature | What a user can do | Status | Enforced where | Evidence | Limitations/notes |
|---|---|---|---|---|---|
| Build the curated prompt | All comments + stubs + flags become one ordered prompt ("Slide 3: …", "New slide requested after slide 2: …") | ✅ | server-shared logic | feedback-prompt.ts `buildFeedbackPrompt` + `selectCuratedFeedback` — the **same** functions the MCP `get_feedback` uses (mcp/route.ts 39–42) | Owner-curated set; identical across web + MCP |
| Send to Claude button | Owner opens the bound claude.ai chat; feedback rides in the URL **fragment** (never sent to a server) and is **also copied to the clipboard** | ✅ | UI (owner-only wiring) | SendToClaudeButton.tsx `handleSend` (145–157), `claudeUrl` (77); owner gating: SlideViewer 826 (`canCurate ? feedbackText : undefined`), FloatingViewer `canSendToAI` (457) | Unbound decks open a fresh chat + rely on paste |
| Auto-fill into Claude's box | The extension reads the fragment and types it into the composer — **only if empty, never auto-sends** | ✅ | n/a (extension) | content.js `autofillFeedbackFromHash` (505): empty-box check (521), fill (462), fragment stripped immediately (512) | Clipboard is the fallback if the composer isn't found (10s poll) |
| Empty-state safeguard | With zero feedback the button is a disabled chip — can't copy an empty prompt | ✅ | UI | SendToClaudeButton 111–122; `buildFeedbackPrompt` returns null on empty (feedback-prompt.ts 119) | |
| Copy MCP connector URL | Dropdown option copies the `/mcp` URL for Claude's custom-connector dialog | ✅ | UI | SendToClaudeButton `handleCopyMcpUrl` (135) | URL is **hardcoded to production** (line 45) — wrong in local dev |

### L. Export & output

| Feature | Status | Evidence |
|---|---|---|
| PDF export | 📝 **nothing exists** | grep for print/pdf/jsPDF/export/download across `web/src`: no matches |
| PPTX export | 📝 nothing exists | same sweep |
| Print stylesheet / window.print | 📝 nothing exists | same sweep |
| Any download of deck HTML | 📝 nothing exists (the only HTML egress is the MCP read tools) | same sweep |

### M. Notifications & email

| Feature | Status | Evidence |
|---|---|---|
| Email sending (beyond Supabase's own magic-link emails) | 📝 **none** — no mail library, no send call anywhere | grep resend/sendgrid/nodemailer/mailgun/postmark/smtp/sendEmail: zero matches |
| In-app notifications | 🟡 only the in-viewer banners (updated / arrival / live-new-version) — no notification center, no badges outside the dashboard unread counts | SlideViewer 763; UpdatedBanner; ArrivalBanner |
| Push notifications | 📝 none | no service worker, no push API anywhere |

### N. Analytics & instrumentation

**There is no analytics instrumentation at all — not even a pageview install.**
Grep for `posthog|gtag|plausible|mixpanel|segment|analytics|telemetry|track(` across
`web/src` and `content.js`: **zero tracking calls**. The only "instrumentation" is
`console.log/warn/error` diagnostics (extension + server logs). The memory of a
"PostHog" association comes from a slide *content* example, not app code.

### O. Search

| Feature | Status | Evidence |
|---|---|---|
| Web-UI search (decks, comments, content) | 📝 none — no search box anywhere in the app | no search input in dashboard/viewer components |
| MCP `search` tool | ✅ but **title-only, owner-only** | mcp/route.ts 785–840: case-insensitive `title.includes(query)` over `getDecksForOwner` |
| Full-text search of deck content/comments | 📝 none | no FTS index in any migration; no content queries |

### P. Real-time

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Live comments/stubs/flags | ✅ | Supabase Realtime `postgres_changes` subscriptions: SlideViewer 247–368; useDeckComments.ts 60; useDeckStubs.ts 54 | Authorized with the user's token so RLS applies (SlideViewer 259) |
| Deck-version polling | ✅ (current viewer) | SlideViewer 104–144: `/api/deck-version` every 12s | **Floating viewer doesn't poll** |
| Presence ("viewing now") | 📝 none | no presence channel anywhere; the huddle avatars are explicitly "who's involved", not "who's online" (HuddleAvatars.tsx header comment) | Deliberately deferred |

### Q. Workspace, team & billing

| Feature | Status | Evidence |
|---|---|---|
| Workspace/team/org entity | 📝 **none** | grep workspace/team/organization/tenant: zero matches; no such table in any migration |
| Billing / payments / Stripe | 📝 none | grep stripe/billing/payment/subscription/trial: zero matches |
| Plans, limits, feature gating | 📝 none | no entitlement code anywhere; the only "limits" are abuse caps (2MB, rate limits, list cap) |
| Usage metering | 📝 none | nothing counts usage per user |

### R. Security & operational

| Item | State | Evidence | Notes |
|---|---|---|---|
| Slide iframe sandbox | ✅ `sandbox="allow-scripts"` — never `allow-same-origin` | SlideViewer.tsx:876, FloatingViewer.tsx:554 (exact line: `sandbox="allow-scripts"`) | Critical invariant; scripts run but in an opaque origin |
| Security headers | ✅ X-Content-Type-Options, X-Frame-Options SAMEORIGIN, Referrer-Policy, HSTS+preload, Permissions-Policy | web/next.config.ts 8–20 | **No CSP** (documented follow-up: needs nonce middleware) |
| Rate limiting | `/api/slides`: 30/min/IP (route.ts 31–47, 111). `/mcp`: 120/min/user (mcp/route.ts 948–1000) | rate-limit.ts | **Per-instance, in-memory** (resets on cold start; not a global cap). `/api/deck-version` and the OAuth endpoints have **no** rate limit |
| Body caps | 2MB on both write entry points | api/slides 19, mcp/route.ts 53 | |
| Origin gating | `/api/slides` allowlist: claude.ai + `*.claudeusercontent.com` / `*.claudemcpcontent.com` | route.ts 52–74 | Header is forgeable by non-browsers — hence the rate limit |
| Anonymous identity redaction | Anon link-viewers get no comments, no stub/flag emails, no participants, no arrival names | page.tsx 236–251 (`canSeeCollaboratorEmails`), 282–287; comments are `[]` for anon (`getCommentsForDeck` returns empty without userId) | The Jun-2026 security review's fixed leak; re-verified in code |
| Token signing | Write tokens + OAuth tokens HMAC-SHA256, constant-time compare | update-token.ts 42–88; mcp-oauth.ts 75–112 | **Default signing secret = the service-role key** (double duty); `MCP_TOKEN_SECRET` can split the OAuth one |
| Migration process | **Manual** — 13 SQL files pasted into Supabase by hand; no runner, no applied-migrations record | docs/*.sql headers | Code degrades gracefully on missing tables/columns (`isMissingTableError`/`isMissingColumnError`, slide-store 1211–1230) and logs "migration likely hasn't been run" |
| Silent best-effort writes | `recordDeckView`, `trackSharedDeck`, v1 snapshot, `clearAddressedFeedback` log-and-continue | slide-store 598–612, 758–776, 144–152, 1130 | Failures hide in server logs by design |
| RLS bypass usage | Nearly every read/write in slide-store.ts uses the **service-role client** with permission re-checks in code | slide-store passim (25+ `getSupabaseAdmin()` call sites) | The browser-client paths (comments/stubs/flags writes, dashboard reads, login) are the RLS-governed ones |
| Test coverage | One handwritten E2E script | web/scripts/test-loop.mjs (versioning, prompt builder, write tokens) | No test framework, no CI config in the repo |

---

## 3. Database reality check

Marking: **RW** = actively read & written · **W-only** = written but never read · **R-only** = read but never written · **reserved** = exists, nothing touches it.

### `decks` — RLS: authenticated may SELECT own-or-shared, modify own only; anon denied. Service-role bypass: yes — every viewer/API read & write (slide-store throughout).
| Column | Status | Evidence |
|---|---|---|
| `id` | RW | everywhere |
| `html_content` | RW | `storeSlides`/`updateDeck`/`getStoredSlides` |
| `user_id` | RW | ownership checks, claiming (slide-store 517) |
| `title`, `slide_count` | RW | derived on write, shown on dashboard/MCP |
| `version` | RW | versioning backbone |
| `claude_conversation_id` | RW | storeSlides 122; getDeckMeta 344 |
| `created_at` | RW (written by default, read) | dashboard meta, MCP list fallback |
| `updated_at` | RW | updateDeck 262; getDecksForOwner ordering |

### `deck_versions` — RLS: authenticated SELECT own-or-shared (for a future history UI); writes only via service-role. Bypass: yes (all writes + `getDeckVersionHtml`).
| Column | Status | Evidence |
|---|---|---|
| `id`, `deck_id`, `version`, `created_at` | RW | `getDeckVersions` (285), `snapshotVersion` (159) |
| `html_content` | RW | `getDeckVersionHtml` (475) — powers history viewing + the diff banner |
| `title`, `slide_count` | **W + selected, unused in UI** | written by snapshot; selected by getDeckVersions but DeckVersionNav uses only version+createdAt |
| `created_by` | **W + selected, unused in UI** | same |

### `shared_decks` — RLS: own rows only (SELECT/INSERT/DELETE). Bypass: yes — `getDeckShareCounts` (618) and `getDeckParticipants` (660) read ALL rows of a deck via admin.
| Column | Status | Evidence |
|---|---|---|
| `deck_id`, `user_id`, `created_at` | RW | trackSharedDeck, dashboard join |
| `role` | **W-only, effectively reserved** | only `'viewer'` ever written (slide-store 606); **no code reads it** |

### `deck_views` — RLS: own rows only. Bypass: yes — all reads/writes go through admin (`getDeckView` 496, `recordDeckView` 758, `getDeckCommentCountsForUser` 792).
| Column | Status |
|---|---|
| `deck_id`, `user_id`, `last_viewed_at` | RW (unread badges + both "since you were here" banners) |

### `comments` — RLS: SELECT/INSERT on accessible decks (insert also pins `author_email` to the JWT email); UPDATE/DELETE own. Anon denied. Bypass: yes — `getCommentsForDeck` (879, with explicit access re-check in code) and curation updates (944).
| Column | Status | Evidence |
|---|---|---|
| `id`, `deck_id`, `user_id`, `slide_index`, `body`, `version`, `created_at` | RW | viewer + store |
| `author_email` | RW | snapshot on insert; **re-resolved from user_id on read** to defeat spoofing (slide-store 856–869) |
| `dismissed`, `owner_edited_body` | RW | curation |
| `parent_id` | **reserved** (threaded replies) | comments-migration.sql 16; zero code references |
| `element_id` | **reserved** (element-level anchoring) | comments-element-id-migration.sql; zero code references |
| `resolved` | **reserved** (triage) | comments-migration.sql 18; zero code references |
| `updated_at` | **W-only (DB default), never read or updated** | no select includes it; no trigger exists |

### `slide_stubs` — RLS: SELECT/INSERT on accessible decks; DELETE own (owner-delete goes through the service-role server action instead). Bypass: yes — `getStubsForDeck` (1257) reads for ALL viewers incl. anonymous (emails redacted in page.tsx).
| Column | Status | Evidence |
|---|---|---|
| `id`, `deck_id`, `position`, `title`, `subtitle`, `body`, `requested_by`, `created_at`, `dismissed`, `resolved_at` | RW | store + viewer + resolution |
| `owner_edited_body` | **W + selected, no longer used** | curation can write it; `editStubFields` clears it; the prompt builder ignores it ("retired", feedback-prompt.ts 95–97) |

### `slide_flags` — RLS: same pattern as stubs. Bypass: yes — `getFlagsForDeck` (1443) + curation.
| Column | Status |
|---|---|
| all columns (`id`, `deck_id`, `slide_index`, `reason`, `flagged_by`, `created_at`, `dismissed`, `owner_edited_reason`, `resolved_at`) | RW |

**Columns no code touches (full list):** `comments.parent_id`, `comments.element_id`, `comments.resolved`, `comments.updated_at` (write-by-default only), `shared_decks.role` (write-constant only), `slide_stubs.owner_edited_body` (semi-retired), `deck_versions.created_by/title/slide_count` (written + selected, not surfaced).

---

## 4. Confirmed-absent checklist

| Item | Verdict | Evidence |
|---|---|---|
| Workspace or team entity | **Confirmed absent** | No table, no code; grep zero matches |
| Billing / Stripe / any payment code | **Confirmed absent** | grep zero matches |
| Plan limits or feature gating | **Confirmed absent** | Only abuse caps (2MB, rate limits) exist |
| Invite-by-email flow | **Confirmed absent** | No mail library; sharing is link-only |
| Enforced viewer-vs-commenter roles | **Confirmed absent** | `shared_decks.role` exists but is never read; every collaborator can comment/stub/flag |
| Guest/observer mode | **Partial** | Anonymous link-viewing IS a de-facto observer mode (slides + stubs only, no identities); but there's no named/invited guest concept |
| User profiles (display name/avatar) | **Confirmed absent** | Identity is the email; avatar = first letter (AvatarMenu.tsx 15) |
| Email sending beyond auth magic links | **Confirmed absent** | grep zero matches |
| In-app or push notifications | **Partial / absent** | In-viewer banners only (UpdatedBanner, ArrivalBanner, live-version); no notification system, no push |
| Real-time subscriptions or presence | **Partial** | Realtime data sync EXISTS (comments/stubs/flags, SlideViewer 247); **presence is absent** |
| Full-text search | **Confirmed absent** | No FTS anywhere; only MCP title-contains `search` |
| PDF export | **Confirmed absent** | grep zero matches |
| PPTX export or capture | **Confirmed absent** (capture is detect-only, 🧩) | content.js 860–871 |
| Custom branding / white-label | **Confirmed absent** | Brand constants hardcoded (`#4A3FB5`) |
| Analytics event instrumentation | **Confirmed absent — not even a pageview install** | grep zero matches |
| Referral mechanics | **Confirmed absent** | Closest thing: the dashboard's "copy the MCP URL" empty-state prompt (a growth surface, not referral) |
| Onboarding / first-run experience | **Partial** | One-time floating-viewer hint via localStorage (FloatingViewer 350–362) and the dashboard empty-state; no guided onboarding |
| ToS or privacy pages | **Confirmed absent** | No such routes in `web/src/app` |
| Admin tooling | **Confirmed absent** (closest: `POST /api/recount-my-decks`, self-serve maintenance) | route exists; no admin UI/role |
| MCP token revocation | **Confirmed absent** | Documented trade-off (mcp-oauth.ts 21–27) |
| Threaded comment replies | **Confirmed absent** (schema reserved) | `comments.parent_id` unused |
| Element-level comment anchoring | **Confirmed absent** (schema reserved) | `comments.element_id` always NULL |

---

## 5. Docs-vs-code discrepancies

1. **MCP tool count.** TECHNICAL.md §5 says the MCP server "exposes **six** tools";
   the code registers **eight** — `search` and `fetch` (the ChatGPT-connector
   aliases) are missing from the doc. (mcp/route.ts 785, 843.)
2. **`/api/slides` rate limiting.** TECHNICAL.md §10 says "`/api/slides` itself is
   **not** rate-limited"; the code rate-limits it at 30/min/IP
   (api/slides/route.ts 31–47, 111). The SECURITY-REVIEW notes this fix (M1) was
   applied — TECHNICAL.md was not updated.
3. **rate-limit.ts scope.** TECHNICAL.md §2 says it's "used only by the MCP
   server"; it's also used by `/api/slides` (route.ts 10, 111).
4. **Undocumented env vars.** `SLIDES_RATE_LIMIT_PER_MIN`, `MCP_INLINE_TOKEN_BUDGET`,
   `MCP_LIST_DECKS_LIMIT` are read by code but absent from TECHNICAL.md §8.
5. **Sandbox description in architecture.md.** The capture-flow diagram says the
   viewer renders slides in `<iframe sandbox="">` with "**no JS**" (lines 38–39,
   step ⑨ "even malicious JS … can't run"). The actual sandbox is
   `sandbox="allow-scripts"` — JS **does** run, isolated by the opaque origin
   (SlideViewer.tsx 876). TECHNICAL.md has it right; architecture.md's diagram is
   stale and overstates the lockdown.
6. **lib inventory gap.** TECHNICAL.md's `/web/src/lib` table omits
   `minify-deck-html.ts` (the MCP read-path minifier).
7. **Dashboard copy.** Docs say "My decks" / "Shared with me"; the UI now says
   "**My huddles**" / "**Huddles shared with me**" (DashboardDecks.tsx 418, 437) —
   committed 10 Jun, after the docs' 5 Jun date.
8. **Floating-viewer huddle signals undocumented.** `HuddleAvatars`, `ArrivalBanner`,
   `arrival-activity.ts` and `getDeckParticipants` (commit 41041ac) post-date both
   docs and appear in neither.
9. **Feedback resolution asymmetry (code vs docs' framing).** Docs describe
   resolution as part of "the update flow"; in code **only the MCP `update_deck`**
   calls `clearAddressedFeedback` — an extension-path update (`/api/slides?update=`)
   does **not** resolve feedback (api/slides 217–227 never calls it). If a user
   revises via the extension, addressed stubs/flags stay open.
10. **popup.html version** ("v0.1.0") vs manifest ("0.4.0") — known/documented in
    TECHNICAL.md §10, still unfixed.
11. **TECHNICAL.md repo-structure omission.** `web/scripts/test-loop.mjs` is
    described as "a dev/test helper script" — accurate, but it's the **only**
    automated test in the repo; there is no test framework or CI config at all
    (nothing in package.json scripts beyond dev/build/start/lint).

---

## 6. Partial & fragile list

Every 🟡 and 🧩 in one place:

| Item | Status | One-line reason |
|---|---|---|
| PPTX capture | 🧩 | Detection + file-info logging only; button deliberately suppressed (content.js 860) |
| `comments.parent_id` / `element_id` / `resolved` | 🧩 | Schema reserved for threads / element anchoring / triage; zero code references |
| `shared_decks.role` | 🧩 | Only `'viewer'` ever written; nothing reads or enforces it |
| `slide_stubs.owner_edited_body` | 🧩 | Retired override — still written/cleared, never read for the prompt |
| `comments.updated_at` | 🧩 | DB default only; never read, never updated |
| `deck_versions.created_by/title/slide_count` | 🧩 | Snapshotted + selected but surfaced nowhere |
| Floating viewer | 🟡 | Gated off by default; zoom inert; no mobile layout; no flag-creation UI; no live version poll |
| Zoom control | 🧩 | Inert placeholder in the floating viewer; absent in the current one |
| Live new-version detection | 🟡 | Current viewer only (12s poll); floating viewer never notices out-of-band revisions |
| Extension-path update | 🟡 | Saves the version fine but never resolves addressed feedback (only MCP does) |
| Author comment editing | 🟡 | RLS allows `update_own`, but no UI exists — authors can only delete and repost |
| Rate limiting | 🟡 | Per-instance in-memory; resets on cold start; `/api/deck-version` + OAuth endpoints unlimited |
| Conversation→deck binding | 🟡 | Lives in one browser's `chrome.storage` — no cross-device update capability; a lost token = deck can never be updated via extension again |
| Live-arrived stubs/flags | 🟡 | Show "a teammate" instead of the author's email until reload |
| In-app notifications | 🟡 | Three in-viewer banners; no notification system |
| Onboarding | 🟡 | One floating-viewer hint + dashboard empty state; nothing else |
| Guest/observer | 🟡 | Anonymous link-view is a de-facto observer mode; no invited-guest concept |
| Migrations | 🟡 (operational) | Manual paste-into-Supabase; no runner/record; graceful degradation hides forgotten ones |
| Silent best-effort writes | 🟡 (operational) | View tracking, share tracking, snapshots, resolution can silently no-op into server logs |
| `PRODUCTION` flag + hardcoded URLs | 🟡 (operational) | content.js endpoint and SendToClaudeButton's MCP URL are hardcoded constants; dev/prod switch is a code edit |

---

## 7. Summary scorecard

Counts of distinct features per area (as tabled above):

| Area | ✅ | 🟡 | 🧩 | 📝 |
|---|---|---|---|---|
| A. Capture & creation | 9 | 0 | 1 | 0 |
| B. Rendering & viewing | 9 | 1 | 1 | 0 |
| C. Collaboration inputs | 7 | 0 | 0 | 1 |
| D. Owner curation | 5 | 0 | 0 | 0 |
| E. Versioning | 7 | 1 | 0 | 0 |
| F. Sharing, access & roles | 7 | 0 | 1 | 1 |
| G. Auth & identity | 5 | 0 | 0 | 0 |
| H. Dashboard | 5 | 0 | 0 | 0 |
| I. MCP & OAuth | 9 | 1 (no revocation) | 0 | 0 |
| J. Other endpoints | 4 | 0 | 0 | 0 |
| K. Feedback-to-AI | 5 | 0 | 0 | 0 |
| L. Export | 0 | 0 | 0 | 4 |
| M. Notifications & email | 0 | 1 | 0 | 2 |
| N. Analytics | 0 | 0 | 0 | 1 (nothing at all) |
| O. Search | 1 (MCP only) | 0 | 0 | 2 |
| P. Real-time | 2 | 0 | 0 | 1 (presence) |
| Q. Workspace/billing | 0 | 0 | 0 | 4 |
| R. Security & operational | 8 | 3 | 0 | 0 |

**Three biggest surprises from the audit:**

1. **Zero analytics.** Not a single tracking call, not even a pageview install —
   for a product heading toward commercial launch, there is currently no way to
   know how anyone uses it.
2. **The extension's update path never resolves feedback.** Only the MCP
   `update_deck` calls `clearAddressedFeedback`; a user who revises via the
   extension's "Update to new version" leaves every addressed stub/flag still
   open. The two update paths the docs treat as equivalent genuinely differ.
3. **How much rides on the service-role bypass.** RLS exists on every table, but
   nearly every server read/write goes through the admin client with hand-rolled
   permission re-checks in `slide-store.ts`. RLS only truly governs the
   browser-client writes (comments/stubs/flags) and dashboard reads — and whether
   those policies are live in production is unverifiable from code
   (docs/verify-rls.sql exists for exactly that check).

---

## Coverage sweep

**Routes in `web/src/app` (15):** `/` · `/login` · `/dashboard` · `/viewer` ·
`/api/slides` · `/api/deck-version` · `/api/recount-my-decks` · `/auth/callback` ·
`/auth/signout` · `/mcp` · `/oauth/authorize` · `/oauth/register` · `/oauth/token` ·
`/.well-known/oauth-authorization-server` · `/.well-known/oauth-protected-resource`
— all represented (areas B, G, H, I, J, A).

**MCP tools (8):** create_deck, get_feedback, update_deck, list_decks, get_deck,
get_deck_slides, search, fetch — all in §I.

**Exported functions in slide-store.ts (29):** dependsOnClaudeDesignSystem ·
countSlides · storeSlides · updateDeck · getDeckVersions · getStoredSlides ·
getDeckMeta · getDecksForOwner · getDeckVersionHtml · getDeckView ·
claimOrphanDeck · deleteDeck · removeSharedDeck · trackSharedDeck ·
getDeckShareCounts · getDeckParticipants · recomputeOwnedDeckMeta ·
recordDeckView · getDeckCommentCountsForUser · getCommentsForDeck ·
setCommentCuration · setStubCuration · setFlagCuration · clearAddressedFeedback ·
getStubsForDeck · deleteStub · editStubFields · getFlagsForDeck · getOwnerEmails
— all represented (areas A–F, H, I).

**Extension top-level handlers (5):** iframe-mode capture responder
(`installIframeHandler`) · capture-reply listener (`installCaptureReplyListener`) ·
MutationObserver scan loop (`scan`, containing the 3 detectors) · button
capture/send flow (`createBar`/`sendSlides`) · feedback autofill
(`autofillFeedbackFromHash` + hashchange) — all in §A and §K.

**Tables (7):** decks, deck_versions, shared_decks, deck_views, comments,
slide_stubs, slide_flags — all in §3.

**Uncertain (5 items — not verifiable from code):**
1. Whether RLS policies are actually **enabled in the live database** (migrations
   are manual; `docs/verify-rls.sql` is the check — flagged by the security review).
2. Which migrations have actually been applied in production (no applied-migrations record).
3. Supabase-side auth configuration (magic-link redirect allowlist, email templates).
4. Vercel production env vars / git-deploy wiring (assumed: push-to-main deploys).
5. How the extension is distributed (Web Store vs unpacked) — nothing in the repo says.

**Coverage check: 15 routes, 8 MCP tools, 29 store functions, 5 extension handlers, 7 tables inventoried; 5 items uncertain.**
