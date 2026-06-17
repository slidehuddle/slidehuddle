# Claude Code Prompt — Full Feature & Capability Inventory (read-only audit)

*Copy everything below the line into Claude Code, run from the repo root (`Slidehuddle/`).*

---

I'm a non-technical founder. We are planning a major evolution of this product (a conversation-first collaboration model plus a commercial launch), and before any planning I need a **precise inventory of what exists in the app TODAY** — derived from the code itself, not from the documentation. This is a **read-only audit**: do not modify, refactor, or "fix" anything. The only file you may create is the output document.

## Ground rules

1. **Read-only.** No code changes, no dependency changes, no migrations. Create exactly one new file: `docs/FEATURE-INVENTORY.md`.
2. **The code is the source of truth, not the docs.** You may use `TECHNICAL.md`, `docs/architecture.md` and the SQL migration files to cross-check, but every claim in your output must be verified in the actual source. Where the docs and the code disagree, that's a finding — record it, don't reconcile it silently.
3. **Evidence for everything.** Every inventory row must cite where you verified it (file path + function/component name). If you could not verify something by reading the code, put it in an "Uncertain" list — never guess.
4. **Explain your plan first.** Before reading anything, tell me which directories/files you'll examine and in what order (extension root, `web/src/lib`, `web/src/app`, `docs/*.sql`, configs), and wait for my go-ahead.
5. **Plain English.** I need to understand every line of the output. Describe features as "what a user can do," with the technical reference alongside.

## The task

Produce `docs/FEATURE-INVENTORY.md` with exactly these sections:

### 1. Snapshot header
Date of audit, git branch/commit, extension version (from `manifest.json` — note any version mismatch with `popup.html`), web app framework/dependency versions (from `web/package.json`), database table count, and the list of environment variables the code reads.

### 2. Capability inventory, by area
For **each** area below, a table with columns:
**Feature | What a user can do (plain English) | Status | Enforced where | Evidence | Limitations/notes**

Status legend (use exactly these): ✅ complete · 🟡 partial (works with gaps — say which) · 🧩 stub/reserved (schema or scaffolding exists, nothing uses it) · 📝 documented-but-not-found (claimed in docs, absent in code).
"Enforced where" legend: server action · RLS · capability token · origin gate · UI-only · n/a.

Areas to cover (all of them, even if the answer is "nothing exists"):
- **A. Capture & creation** — Chrome extension detection/capture paths (all formats, including detected-but-disabled ones), `/api/slides` create & update modes, MCP `create_deck`.
- **B. Rendering & viewing** — slide rendering, sandboxing, thumbnails, navigation, stub-slide display, anonymous viewing.
- **C. Collaboration inputs** — comments, requested slides (stubs), removal flags: who can do what, on which decks, at which versions.
- **D. Owner curation** — edit/dismiss/restore across all three feedback types; persistence across rounds.
- **E. Versioning** — version snapshots, history UI, update flows (extension vs MCP), conversation binding, updated-banner behaviour.
- **F. Sharing, access & roles** — link sharing, `shared_decks` behaviour, the role column and whether anything enforces it, orphan decks & claiming, copy-link behaviour.
- **G. Auth & identity** — magic links, sessions, sign-out, what identity/display info exists for users (and what doesn't).
- **H. Dashboard** — My decks / Shared with me, unread badges, deck management actions.
- **I. MCP server & OAuth** — every tool with its read/write nature and permission gate; the OAuth flow properties; rate limiting; token lifecycle.
- **J. Other API endpoints** — anything not covered above (`deck-version`, `recount-my-decks`, etc.).
- **K. Feedback-to-AI** — "Send to Claude" button, clipboard path, URL-fragment auto-fill, the empty-box safeguard.
- **L. Export & output** — any export capability whatsoever (PDF, PPTX, print, download).
- **M. Notifications & email** — any email sending or in-app notification beyond Supabase auth emails.
- **N. Analytics & instrumentation** — list the **actual tracking calls** found in the code (PostHog or otherwise): every event name, where it fires. If none exist beyond a default pageview install, say so explicitly.
- **O. Search** — any search capability across decks, comments, or content.
- **P. Real-time** — any live updates, subscriptions, presence, or polling (note the deck-version polling if present).
- **Q. Workspace, team & billing** — any team/workspace entity, plan/entitlement logic, payment integration, usage limits.
- **R. Security & operational** — iframe sandbox settings, security headers, rate limits and where they do/don't apply, body caps, the migration process, silent-failure handling patterns.

### 3. Database reality check
Every table and **every column**, marked: actively read & written · written but never read · read but never written · reserved/unused. Per table: a one-line RLS summary (who can do what) and whether any code path bypasses RLS via the service-role client. Flag every column the schema has that no code touches.

### 4. Confirmed-absent checklist
For each item below, state **Present / Partial / Confirmed absent**, with one line of evidence either way. (Confirmed absences are as valuable to me as features.)
Workspace or team entity · billing/Stripe/any payment code · plan limits or feature gating · invite-by-email flow · enforced viewer-vs-commenter roles · guest/observer mode · user profiles (display name/avatar) · email sending beyond auth magic links · in-app or push notifications · real-time subscriptions or presence · full-text search · PDF export · PPTX export or capture · custom branding/white-label · analytics event instrumentation (beyond install) · referral mechanics · onboarding/first-run experience · ToS or privacy pages · admin tooling · MCP token revocation · threaded comment replies · element-level comment anchoring.

### 5. Docs-vs-code discrepancies
Everything `TECHNICAL.md` / the brief claims that the code contradicts (or vice versa), including features documented as built that are partial, and code that exists but is undocumented.

### 6. Partial & fragile list
Every 🟡 and 🧩 item in one consolidated list with a one-line reason ("works only when X," "depends on Claude's DOM," "schema exists, no reads").

### 7. Summary scorecard
A count of ✅ / 🟡 / 🧩 / 📝 per area (A–R), plus your three biggest surprises from the audit.

## Verification step (required)

Before finishing, do a coverage sweep: list every route in `web/src/app`, every exported function in `web/src/lib/slide-store.ts`, every MCP tool registration, and every top-level handler in `content.js`, and confirm each one is represented somewhere in the inventory. End the document with: "Coverage check: N routes, N MCP tools, N store functions, N extension handlers, N tables inventoried; M items uncertain."

When you're done, tell me in plain English: what you verified directly, what you inferred, and your confidence level in the inventory's completeness.
