# SlideHuddle — Progress Tracker

*Lives at `docs/PROGRESS-TRACKER.md`. The single source of truth for where we are on the master plan (see "Gap Analysis & Master Build Plan", June 2026). Claude Code updates this file at the end of every session; the founder updates the items marked 👤 and the metrics.*

---

## Instructions for Claude Code (read before every update)

You are updating this tracker at the **end of a working session**. Follow these rules exactly:

1. **Append, never rewrite.** Add a new entry at the **top** of the Session Log. Never delete or edit past entries or past status history.
2. **Status changes need evidence.** Only change an item's status if this session's work justifies it, and put the evidence in the item's Evidence column (file/function, migration name, or commit). An item is ✅ only when it works end-to-end and you've stated how it was verified — "code written" is 🔵, not ✅.
3. **Statuses:** ⬜ not started · 🔵 in progress · ✅ done · ⏸ blocked (say why in Blockers) · ❌ dropped (say why in the session entry).
4. **Update the Dashboard counts** (done/total per phase) and the "Current focus" line to match reality.
5. **New work goes to the Parking Lot**, never silently into a phase. If a session uncovers a bug, debt, or a new idea, add it there with a one-line description and your proposed phase. The founder promotes parking-lot items into phases, not you.
6. **Gates are sacred.** Never mark a gate passed — only the founder does that (👤). You may write "gate evidence ready" in the session entry.
7. **Don't break the format.** Keep the tables' columns as they are; keep item IDs stable; dates as YYYY-MM-DD.
8. **After a gate passes**, compress that phase's session-log entries into a single "Phase N summary" block (preserving dates and key evidence) to keep this file readable.
9. If the session touched the database schema, security-relevant code, or the MCP tool surface, say so explicitly in the session entry under "Flags".

---

## Dashboard

| | |
|---|---|
| **Current phase** | Phase 1 (product track) — Gate G0 not yet passed; founder still owns P0.7–P0.9 in parallel |
| **Current focus** | **P1.2 🔵 (2026-06-17)** — read-only conversation feed (version-spine backbone + avatars + AI provenance) as an alternative landing for partners, flag-gated via `FEED_PARTNER_EMAILS` + `?view=feed`/`?view=deck`, both landings instrumented with PostHog (no-ops without a key). Latest: **"settled history" greyscale (handover Item A)** — past-round version messages + addressed/dismissed items desaturate so unaddressed feedback pops; hover/selection restores colour. The prior feed work is **committed + pushed to `main`**; today's greyscale (Item A) is tsc/lint/preview-green but **uncommitted**. Awaiting founder partner end-to-end test + a PostHog key to light up the Gate-G1 measurement. See `docs/P1.2-HANDOVER.md`. — P1.1 🔵 — **Stages B + C + D done** (B approved by founder 2026-06-14). D: anonymous recipients now see a count-only **"N reviewing"** chip (not "Huddlers"/"Shared deck"); deck-title z-index confirmed already clean (title lives inside the brand pill); inset/Floating-Canvas styling already applies to the recipient view. **Stage E (mobile) DEFERRED by founder** until the base desktop experience is complete. Today's P1.1 desktop work (Stages B–D + fixes) **committed + pushed to `main` 2026-06-14** (deploys via Vercel; CI green). **Stage F (rollout)** is effectively satisfied by default-for-all + `?view=classic` fallback — to close it: a founder prod smoke-check; per-account/test-group targeting parked → **Phase 2** (see Parking Lot). Stage E (mobile) parked. |
| **Phase progress** | P0: 4/9 · P1: 0/4 (P1.1 + P1.2 in progress) · P2: 0/6 · P3: 0/6 · P4: 0/5 · P5: 0/6 |
| **Gates passed** | none |
| **Open blockers** | 0 |
| **Last session** | 2026-06-17 |

### Key metrics (👤 founder-updated; "—" until analytics is live)

| Metric | Target | Current | As of |
|---|---|---|---|
| Weekly completed review rounds (north star) | growing | — | |
| Activation (first round, ≥2 people, ≤7 days) | ≥30% | — | |
| Second huddle within 30 days | ≥40% | — | |
| Viral coefficient k | ≥0.2 by M6 | — | |
| Free → paid | 4%+ | — | |
| Founding partners signed 👤 | 5–10 | 0 | |
| MRR 👤 | per scenario | $0 | |

---

## Phase 0 — Truth, safety, measurement (target: weeks 1–3)

| ID | Item | Size | Status | Evidence | Date |
|---|---|---|---|---|---|
| P0.1 | Run `verify-rls.sql` in production; confirm RLS live on all 7 tables | S | ✅ | Greg ran verify-rls.sql in prod Supabase 2026-06-13: all 7 tables `rls_enabled=true`; anon-policy check returned 0 rows (no policy exposed to logged-out role) | 2026-06-13 |
| P0.2 | Analytics from zero: install + named event schema + funnel/channel attribution + dashboards | S–M | ⬜ | | |
| P0.3 | Fix: extension update path calls `clearAddressedFeedback` (parity with MCP) | S | ✅ | api/slides/route.ts: import + best-effort call after updateDeck (mirrors mcp/route.ts:430) + `resolvedFeedbackCount` in response. Verified e2e: extended test-loop.mjs seeds a stub+flag, runs the token-authed update, asserts both `resolved_at` set + count=2 — all pass (53/54; the 1 fail is unrelated test-drift, see Parking Lot). Code not yet committed | 2026-06-13 |
| P0.4 | Fix: orphan-deck recipients get a sign-in/claim nudge instead of a silent comment block (instrumented) | S | ✅ | Viewer detects orphan decks (deck.user_id null, post-claim) and shows a clear nudge in the comments panel instead of a silently-failing composer; canComment/canInsert/canFlag gated off for orphans (page.tsx + SlideViewer.tsx + CommentsPanel.tsx). tsc+eslint clean; verified via browser preview (anon viewer on an orphan deck sees the nudge — screenshot). **Instrumentation deferred with P0.2 (analytics).** | 2026-06-13 |
| P0.5 | PDF export — **deferred to later (convenience feature)** | M | ⬜ deferred | Founder decision 2026-06-13: not a Phase-0 priority — the connected LLM can generate PDFs/exports on request, so SlideHuddle's own export is a convenience, not a loop blocker. No longer required for Gate G0. Revisit post-validation. | 2026-06-13 |
| P0.6 | CI baseline: lint + `test-loop.mjs` on push to main | S | ✅ | `.github/workflows/ci.yml` runs `npm ci` → `npm run lint` → `npm run typecheck` (Node 20) on push-to-main + PRs; added `typecheck` script to web/package.json. No DB/secrets. Pushed 2026-06-13 → **first CI run on GitHub = completed/success** (verified via GitHub API); locally demonstrated a deliberate type error makes it fail red. test-loop.mjs deliberately EXCLUDED (service-role key + live DB) → wire later vs a dedicated test Supabase project. | 2026-06-13 |
| P0.7 | 👤 Trademark searches (UK IPO + USPTO, incl. Slack-"Huddles" question) + name go/no-go | S | ⬜ | | |
| P0.8 | 👤 UK Ltd incorporated · Stripe account · ICO registration | S | ⬜ | | |
| P0.9 | 👤 Real-user test: 2–3 outsiders run the full loop (post P0.2–P0.5) | — | ⬜ | | |

**Gate G0** (👤): loop completable end-to-end (PDF export deprioritized 2026-06-13 — no longer required, see P0.5) · events flowing · RLS verified · name decided · outside users observed. **Status: not passed.**

## Phase 1 — The feed, on the floating viewer (target: weeks 3–6)

| ID | Item | Size | Status | Evidence | Date |
|---|---|---|---|---|---|
| P1.1 | Floating viewer completion: version polling · flag-creation UI · mobile layout pass · zoom (implement or remove) | M | 🔵 | **Stage 2 (occlusion/inset) done + zoom removed.** FloatingViewer.tsx: open strip/comments now shrink+shift the slide into the safe area beside the panel (design-system §3.3) instead of covering it; inert zoom placeholder removed. Verified in preview (1280×800): strip-open slide.left 0→213, clean 12px gap to strip (no overlap); tsc+eslint clean. **Stage 1 (cosmetic) done** — but the earlier amber decision was reversed by the founder mid-session: top-right action cluster now uses hierarchy not colour (Share filled-purple = only filled button; Send to AI reverted to purple-outline split; Comments restyled to a bare teal icon+count). Recipient-view z-index (#3) and brand-pill icon (#4) confirmed already clean. New colour rule (purple = actions you take incl. Send to AI; amber = the AI's own voice only) applied to `design-system.md` §2.2/§3.2/§5/§6/§10 + header. **Stage B persistence (§4.1) done**: rail **sliver** on the left edge (always visible, 14px, teal comment-activity dots = "the team's fingerprints") expands to the full strip on hover/tap/`T`; **counter now always-on** (no longer fades); `T` toggles the rail; arrow-key nav guarded against firing while typing. With the inset + cluster work, **Stage B (deck-viewer redesign) is complete** — pending founder visual approval. Remaining: Stage C version-poll/flag-UI, Stage D recipient view, Stage E mobile, Stage F rollout. tsc+eslint clean. Not committed | 2026-06-14 |
| P1.2 | Read-only feed view: comments + stubs + flags + version events as one stream; deck demoted to peek; flag-gated, default-on for partners | M | 🔵 | Built the read-only "Huddle feed" landing (design-system §6.2): pure `feed-items.ts` composes version events + all-version comments + stubs + flags into one oldest-first stream; new `DeckFeed.tsx` renders it (chat-style cards, day dividers, catch-up ribbon, dismissed=struck, "Slide N · vN" peek-nav chips) with the deck demoted to a right **peek** (scaled iframe via the shared `parseDeck`/`buildSrcdoc`) + **Open deck** (`?view=deck`). Reuses `DeckVersionNav`/`HuddleAvatars`/`AvatarMenu` + chips extracted to shared `HuddleChips.tsx`. Gating in `page.tsx`: `FEED_PARTNER_EMAILS` allowlist + `?view=feed`/`?view=deck` override; new read-only `getAllCommentsForDeck`. **Instrumented** (PostHog seam, no-ops without key): `deck_landing_viewed{view:feed\|deck}` on BOTH landings + `feedback_added{kind}` in the 3 deck hooks. Verified: tsc+eslint clean, pure-logic node test (ordering/kinds), browser preview of the real `DeckFeed` (all 4 card kinds in order, peek scales 288/1280, Open deck→view=deck, events fire, no console errors) + deck viewer unregressed. **Not committed.** Needs founder end-to-end test (partner email → feed). **Update 2026-06-17:** committed + pushed to `main`; since added — version-spine backbone, avatar system, AI provenance (`deck_versions.source`), and **"settled history" greyscale (handover Item A)** that greys past-round version messages + addressed/dismissed items while unaddressed feedback stays in colour. Still 🔵 pending founder partner test + a PostHog key (Gate-G1 evidence); see `docs/P1.2-HANDOVER.md`. | 2026-06-16 |
| P1.3 | Viral loop v0: viewer badge · recipient post-comment CTA · claim-flow funnel events · export footer option | S | ⬜ | | |
| P1.4 | 👤 Design-partner recruitment running (15–20 contacts/week; demos on the feed) | — | ⬜ | | |

**Gate G1 / Assumption 1** (👤): ≥half of partner feedback in-product by round 2; feed preferred or equal as landing view. **Status: not passed.**

## Phase 2 — Identity, membership, money (target: weeks 6–10)

| ID | Item | Size | Status | Evidence | Date |
|---|---|---|---|---|---|
| P2.1 | Profiles: display name + avatar, resolved server-side (also fixes realtime "a teammate") | S | ⬜ | | |
| P2.2 | Email provider (transactional) + invite-by-email + pending invites + member list | M | ⬜ | | |
| P2.3 | Role enforcement in RLS + named/invited guest (client) role | M | ⬜ | | |
| P2.4 | Workspaces entity: members, shared deck ownership, admin | M | ⬜ | | |
| P2.5 | Billing: Stripe Billing + Tax, entitlements (active-huddle counter, feature flags), all four plans wired | M | ⬜ | | |
| P2.6 | Trust & legal: ToS · privacy · trust page · data export/delete · DPA template | S–M | ⬜ | | |

**Gate G2 / Assumption 2** (👤): ≥5 founding partners committed with a card; 3+ named people assembled by invite; first charge processed. **Status: not passed.**

## Phase 3 — Conversation core (target: weeks 10–16)

| ID | Item | Size | Status | Evidence | Date |
|---|---|---|---|---|---|
| P3.1 | Messages evolution: `kind` column · optional `slide_index` · activate `parent_id` threading · stubs/flags as feed kinds | M | ⬜ | | |
| P3.2 | Slide quoting: version-pinned quote payload (+ `element_id` anchors) · thumbnail cards · both quote gestures · tap-quote-to-peek | M | ⬜ | | |
| P3.3 | Decisions: promote-to-decision · `approved_at` · owner approval queue · decision log view | S–M | ⬜ | | |
| P3.4 | Presence channel ("here now") on the huddle avatars | S | ⬜ | | |
| P3.5 | Conversation completeness: reactions · comments-on-stubs · author self-edit UI | S | ⬜ | | |
| P3.6 | 👤 Client guest mode live with 2 partner agencies' real clients | — | ⬜ | | |

**Gates G3 / Assumptions 3–4** (👤): ≥40% second-huddle-in-30-days among partners; a real client completes a round unaided. **Status: not passed.**

## Phase 4 — AI as participant (target: weeks 14–18, overlaps P3)

| ID | Item | Size | Status | Evidence | Date |
|---|---|---|---|---|---|
| P4.1 | `get_feedback` returns approved decisions with thread context | S | ⬜ | | |
| P4.2 | `update_deck` posts a system feed message + AI change summary; resolves consumed decisions | S | ⬜ | | |
| P4.3 | Catch-up digest: AI summary pass on the arrival-activity mechanism | S–M | ⬜ | | |
| P4.4 | Optional `post_message` MCP tool | S | ⬜ | | |
| P4.5 | OAuth-focused security re-review of the changed tool surface | S | ⬜ | | |

**Gate G4** (👤): a full AI revision round legible in the feed without opening the deck. **Status: not passed.**

## Phase 5 — Reach, polish, launch (target: weeks 18–24)

| ID | Item | Size | Status | Evidence | Date |
|---|---|---|---|---|---|
| P5.1 | Notification system: mentions · decision alerts · version posts · daily digest | L | ⬜ | | |
| P5.2 | Onboarding: sample huddle + guided first round ("next client deck" wedge) | M | ⬜ | | |
| P5.3 | Search: Postgres FTS over messages/decisions + UI | S | ⬜ | | |
| P5.4 | Status / review deadline / sign-off | S | ⬜ | | |
| P5.5 | Studio branding + client-facing decision-log view | S–M | ⬜ | | |
| P5.6 | 👤 Launch wave: Product Hunt / Show HN · MCP directory · Chrome Web Store refresh · first comparison pages | — | ⬜ | | |

**Gate G5** (👤): activation ≥30% · k measured · free→paid trending to 4%+ · most participation via notifications. **Status: not passed.**

## Phase 6 — Post-validation bets (not scheduled)

Slack/Teams bridge · AI variants + voting · live huddle mode · mobile push · multi-AI via existing `search`/`fetch` aliases · client decision-log distribution · docs/content expansion (prepared pivot).

---

## Blockers (CC adds; founder clears)

| Opened | Item ID | What's blocked and why | Cleared |
|---|---|---|---|
| | | | |

## Parking Lot (new work discovered mid-journey — CC adds, founder promotes)

| Added | Description (one line) | Proposed phase | Promoted? |
|---|---|---|---|
| 2026-06-13 | Stale `test-loop.mjs` assertion: "chip still shows current version while viewing history" greps for literal "Version 2" on the `?v=1` page, but the viewer now shows the latest as short-form "v2" inside an older-version warning label (product is correct). Fix the assertion so the suite is green before P0.6 wires it into CI. | P0 (unblocks P0.6) | |
| 2026-06-13 | Floating viewer (`?view=floating`, off by default) has the SAME orphan-deck dead-end P0.4 fixed in the current viewer — its comment path isn't orphan-aware. Port the orphan nudge when finishing the floating viewer. | P1 (with P1.1) | ✅ Done 2026-06-14 (P1.1 Stage C) |
| 2026-06-14 | **Per-account / test-group viewer targeting.** Today the floating viewer is default-for-ALL with `?view=classic` + the `FLOATING_VIEWER_DEFAULT` env kill switch as fallbacks — there's no way to put a *specific account* (or a named test group) on one viewer vs another. Lightest partial = make `?view=` sticky per browser (a cookie). A true per-account/admin toggle needs the **workspaces + profiles/per-user-flag** entities, so it naturally rides with those. Not needed while the only audience is the close design-partner group. | P2 (with workspaces/profiles, P2.1/P2.4) | |
| 2026-06-16 | **P0.2 partially seeded by P1.2.** PostHog client lib (`posthog-js`) + a vendor-agnostic seam (`lib/analytics.ts` `track`/`identifyUser`, no-ops without a key) + a root `PostHogProvider` + 3 wired events (`deck_landing_viewed`, `feed_open_deck`, `feedback_added`) now exist. Remaining for P0.2 to close: founder creates a PostHog project, sets `NEXT_PUBLIC_POSTHOG_KEY` (+ `NEXT_PUBLIC_POSTHOG_HOST` if EU) in `.env.local` **and Vercel**, then builds the funnel / channel-attribution dashboards. Until the key is set, analytics is inert. | P0 (P0.2) | |
| 2026-06-16 | **Feed partner gate is an env email allowlist** (`FEED_PARTNER_EMAILS`) — the lightest per-account gate without P2. A real per-account/admin toggle (and making it not require an env redeploy to add a partner) rides with the same **workspaces + profiles** work as the viewer-targeting item above. | P2 (with workspaces/profiles) | |
| 2026-06-16 | **Mobile feed layout (§6.6).** `DeckFeed` is desktop-first: the deck-peek panel hides below `lg` (the feed column still reads fine on mobile, but there's no bottom-sheet peek). Fold into the same mobile pass as the deck viewer's parked Stage E (floating panels → bottom sheets). | P1/P2 (with mobile pass) | |

## Standing ops checklist (from the inventory's Uncertain list)

| Item | Status |
|---|---|
| RLS verified live in production (= P0.1) | ✅ 2026-06-13 |
| Applied-migrations record exists | ⬜ |
| Supabase auth config audited (redirect allowlist, templates) | ⬜ |
| Vercel env vars audited | ⬜ |
| Extension distribution channel decided/documented | ⬜ |
| Docs regenerated after last gate (TECHNICAL.md + re-run inventory prompt) | ⬜ |

---

## Session Log (newest first — CC appends here)

> **Template — copy for each session:**
>
> ### YYYY-MM-DD — (one-line session goal)
> - **Items touched:** P0.x 🔵→✅ (one line each: what was done, evidence)
> - **Files changed:** (paths only)
> - **Verified by:** (how you know it works — test run, manual check, screenshot)
> - **Flags:** schema change? security-relevant? MCP surface changed? (yes/no each)
> - **New parking-lot entries:** (or "none")
> - **Recommended next session:** (one line)

### 2026-06-22 — Analytics live + feed wildcard + fixed two hydration errors in the viewer
- **PostHog connected (P0.2 seam → live).** Set `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com` (EU region) in `web/.env.local` and (founder) in Vercel. Verified end-to-end: local dev sends events to `eu.i.posthog.com` (200s observed); prod build confirmed to inline the key + EU host (grepped the live JS bundle). Analytics is no longer a silent no-op. **P0.2 still ⬜ overall** — funnel/attribution dashboards not built yet — but the pipe is open.
- **Feed wildcard.** `FEED_PARTNER_EMAILS=*` now puts EVERY signed-in viewer on the feed (anonymous link-holders still get the deck; `?view=deck` still escapes). `page.tsx` `isFeedPartner` gained a `partners.includes("*")` branch. Committed + pushed (`b1a264e`). Founder to set the Vercel var to `*` + redeploy.
- **Two REAL hydration errors found + fixed in the viewer** (the handoff's red "1 Issue" chip — it was live, not stale; the tracker hadn't recorded a fix because there wasn't one). Both are the classic SSR-vs-client mismatch ([[feedback_nextjs_ssr_browser_apis]]):
  1. **Feed** — `VersionSpineEvent` rendered relative/locale timestamps during SSR (`formatRelativeTime` → `Date.now()` + `toLocaleDateString`); server (UTC, "Jun 5") ≠ browser ("5 Jun").
  2. **Deck viewer** — `AnchoredToast` called `createPortal` on the first client render but rendered `null` on the server (pre-existing, surfaced via `CopyLinkButton`).
- **Fix:** new shared `lib/use-hydrated.ts` (`useHydrated()` via `useSyncExternalStore` — lint-clean, no setState-in-effect) → false during SSR + first client render, true after hydration. New `viewer/RelativeTime.tsx` (hydration-safe timestamp) replaces inline `formatRelativeTime` in `VersionSpineEvent`, `FeedItemCard`, `CommentsPanel` (+ `suppressHydrationWarning` on the two `<time>` elements whose `title` used locale `formatTime`). `AnchoredToast` gates its portal on `useHydrated()`.
- **Files:** NEW `web/src/lib/use-hydrated.ts`, `web/src/app/viewer/RelativeTime.tsx`; MODIFIED `web/src/app/viewer/VersionSpineEvent.tsx`, `FeedItemCard.tsx`, `CommentsPanel.tsx`, `web/src/components/AnchoredToast.tsx`, `web/src/app/viewer/page.tsx` (wildcard); docs `P1.2-HANDOVER.md` (smoke-check #5), this tracker.
- **Verified by:** `tsc` + `eslint` clean. Browser preview on a **freshly restarted** dev server (clean console): deck viewer (`/viewer?id=c0e8f60235b045f381e8fb`) AND feed (`&view=feed`) both show **no dev-tools issue badge, no error overlay, zero console errors**; feed timestamps render ("5 Jun"/"7 Jun") after hydration. (Screenshot timed out — known lazy-iframe/backgrounded-tab limit; DOM + badge + console verified instead.)
- **Flags:** schema? no. security? no. MCP? no. **Hydration fixes NOT yet committed** (awaiting founder go-ahead to push → prod deploy). Wildcard already pushed (`b1a264e`).
- **Recommended next session:** push the hydration fixes; founder sets Vercel `FEED_PARTNER_EMAILS=*` + redeploy + runs the `deck_versions.source` migration; then the prod smoke-check (handover #4 + #5 — confirm no console hydration errors on prod). After that, partners on the feed = Gate-G1 evidence.

### 2026-06-17 — P1.2: "settled history" greyscale (Item A)
- **Items touched:** P1.2 (still 🔵) — founder-approved greyscale treatment so the feed focuses attention on what's still **unaddressed** (handover Item A). Presentation-only, no data/logic change. Past-round **version messages** desaturate (`filter: grayscale(1) opacity(.65)`, driven off `isCurrent`), so only the current version keeps its amber ✦ / purple vN. **Feed item cards** take a new `muted` prop, computed in `DeckFeed` as `!round.isCurrent && (addressedIn != null || dismissed)` — so addressed/dismissed past items grey out while **unaddressed comments AND stubs AND flags stay in colour**; the current round never mutes. **Hover or selection** returns any muted element to colour (`hover:[filter:none]`; cards gate on `muted && !selected`).
- **Files:** `viewer/FeedItemCard.tsx`, `viewer/DeckFeed.tsx`, `viewer/VersionSpineEvent.tsx`; docs `design-system.md` §5, `P1.2-HANDOVER.md` (Item A → done), this tracker.
- **Verified by:** `tsc --noEmit` clean; browser preview (anon view of test deck `c0e8f60235b045f381e8fb`, `?view=feed`): computed styles confirm v1–v5 = `grayscale(1) opacity(0.65)` and current v6 = `none`; the `.hover:[filter:none]:hover { filter: none }` rule compiled (same classes the cards use); no console errors. **Not visually re-checked signed-in** (no partner login locally) — the addressed-vs-unaddressed *item-card* contrast is verified by logic + shared compiled CSS, not a screenshot. (Screenshots timed out — the lazy-iframe-heavy feed; a11y snapshot + computed styles used instead.)
- **Flags:** schema? no. security? no. MCP? no. **Not committed.**
- **New parking-lot entries:** none.
- **Recommended next session:** quick signed-in look to confirm the item-card greyscale (addressed comment greys, unaddressed stays colour); then handover items C (mobile) / E (per-round-accurate thumbnails) or P1.3 viral-loop v0.

### 2026-06-17 — P1.2: avatar polish round 2 + feed top-bar
- **Items touched:** P1.2 (still 🔵). Three founder tweaks: (1) **owner avatar pastel** — was a bright solid fill; now a soft pastel of the person's colour + ink initials (`Avatar.tsx` palette is now ink+pastel pairs; owner fills with `pastel`, initials in `ink`). (2) **collaborator background white** (was transparent) + the coloured ring. (3) **feed top-left shows the deck title only** — removed the version chip (`DeckVersionNav`) from `DeckFeed`'s top bar (the feed is cross-version; the peek/Open-deck carry the current version).
- **Files:** `viewer/Avatar.tsx`, `viewer/DeckFeed.tsx`; docs `design-system.md` §5, this tracker.
- **Verified by:** `tsc`+`eslint` clean; preview (owner view): owner avatar bg `#DBEAFE` pastel + `#2563EB` ink initials (account menu + feed match); collaborators white bg + coloured ring; top bar reads "SlideHuddle | Competitive Benchmark" with no version pill. No console errors.
- **Flags:** schema? no. security? no. MCP? no. **Not committed.**

### 2026-06-17 — P1.2: committed + pushed to main; handover written
- **Committed + pushed the full P1.2 feed work to `main`** (deploys via Vercel; CI lint+type-check runs on push). The feed is gated (`FEED_PARTNER_EMAILS`) and the schema/MCP changes are graceful (run fine before the migration), so the deploy is safe; throwaway `/feed-preview` route removed before commit; `.wip-backup/` left uncommitted as before.
- **New findable handover:** `docs/P1.2-HANDOVER.md` — full file map, founder actions (run `deck_versions.source` migration; set PostHog key; set `FEED_PARTNER_EMAILS` in Vercel), the Phase-1 completeness check, and the prioritised outstanding list for the next session.
- **Greyscale "focus on unaddressed" treatment — DEFINED for next session (founder-approved, NOT built yet):** everything in rounds *before the latest version* desaturates to grey (version messages, strips, resolved/addressed/dismissed items); **unaddressed/unresolved items stay in full colour — applies to comments AND requested slides (stubs) AND removal flags**; the latest version + its round stay colour; **hover returns a greyed item to colour**. Presentation-only (a per-item `muted` flag + grayscale CSS, cleared on hover/selected). Spec in the handover §A.
- **Files:** NEW `docs/P1.2-HANDOVER.md`; MODIFIED this tracker. (No code changes in this entry.)
- **Flags:** schema? no (this entry). security? no. MCP? no.

### 2026-06-17 — P1.2: version-spine design pass (align to the claude.ai reference)
- **Items touched:** P1.2 (still 🔵). Founder feedback vs the claude.ai reference deck: (1) version events should be flush **messages, not boxed cards**; (2) **addressed items weren't showing** (the reference strikes comments "Addressed in vN").
- **Changes:** `VersionSpineEvent` is now a flush message (no border/box); the **current** version is a purple-tinted highlight **band** + "current" pill; the AI is a **dark rounded square + amber sparkle** (people stay circles); "see changes ▸" moved top-right. **Comments now show "✓ Addressed in vN →"** — derived from the version timeline (a comment in a past round was responded to by the NEXT version; `buildVersionSpine` sets it; no schema change — comments still have no `resolved_at`). The version sub-line counts **comments** too ("addressed 1 comment, 1 request"). Added a "▾ Feed opens here · since vN" marker on the current round. The item-card resolution tag ("✓ Addressed in vN →" / "Won't action") moved to **its own line below the content** (matches the reference).
- **Files:** `viewer/VersionSpineEvent.tsx`, `viewer/feed-items.ts` (implicit comment addressing), `viewer/DeckFeed.tsx` (comments in the summary + "feed opens here"), `viewer/FeedItemCard.tsx` (tag below content); docs `design-system.md`, this tracker.
- **Verified by:** `tsc`+`eslint` clean. Preview: version events render as messages (border 0 / transparent), current = band `#f1eff9` + AI dark square (8px radius); comments struck "Addressed in v2/v3 →"; sub-lines "addressed 1 comment, 1 request/removal"; "FEED OPENS HERE · SINCE V3"; "Won't action". No console errors. (Screenshot blocked — backgrounded tab; DOM/computed-style verified.)
- **Flags:** schema? **no** (this pass). security? no. MCP? no. **Not committed.**

### 2026-06-17 — P1.2: version-spine architecture + AI provenance
- **Items touched:** P1.2 (still 🔵). Restructured the feed so VERSIONS are the backbone (spine), not plain text lines.
- **Spine + rounds:** new pure `buildVersionSpine` (feed-items.ts) groups each version + the conversation that happened during it (by created_at interval). New `VersionSpineEvent.tsx` (ONE component): **v1** = rich "[Owner] started this huddle · title · N slides"; **v2+** = lean "✦ [AI] published vN · N slides" + "requested by [name] · addressed N requests[, N removals]" + "see changes ▸" (a plain list of resolved items, NOT an AI summary). Conversation **indents** under each spine event with a thread line; current version gets a "Current" pill + tint; the feed **opens scrolled to the current version** with an "↑ earlier in this huddle" affordance (verified scrollTop 1625/2511). New `LazyThumbnailStrip.tsx` renders each version's slides as IntersectionObserver-mounted iframes (6 live, not ~30).
- **AI provenance (SCHEMA + MCP/extension capture):** new nullable `deck_versions.source` column (migration `docs/deck-versions-source-migration.sql` — **founder must run it in prod**). `snapshotVersion`/`storeSlides`/`updateDeck` thread `source`; `getDeckVersions` selects it. Extension path → `"claude"`; MCP path → derived from the OAuth client (`parseClientId` clientName/redirect URIs → "claude"/"chatgpt", else null → generic "AI", never guessed). Existing versions have no source → shown as generic "AI".
- **Addressed / dismissed:** the loaders now optionally include RESOLVED stubs/flags (`includeResolved`; `resolved_at` added to the row types + selects, graceful pre-migration fallback). The feed maps `resolved_at` → the version that addressed it and shows the item struck "✓ Addressed in vN" (links to that spine event); owner-dismissed → "Won't action". (Comments have no resolution column → only "Won't action" applies to them.)
- **Files:** NEW `viewer/VersionSpineEvent.tsx`, `viewer/LazyThumbnailStrip.tsx`, `docs/deck-versions-source-migration.sql`; MODIFIED `lib/slide-store.ts` (source + resolved loaders + getDeckVersions), `app/mcp/route.ts` + `app/api/slides/route.ts` (capture source), `viewer/feed-items.ts` (buildVersionSpine), `viewer/DeckFeed.tsx` (spine layout + scroll + per-version HTML), `viewer/page.tsx` (load resolved + per-version HTML), `viewer/FeedItemCard.tsx` (addressed/dismissed tags); docs `design-system.md`, this tracker.
- **Verified by:** `tsc`+`eslint` clean. Preview of the real `DeckFeed` (mock: 3 versions Greg/Claude/ChatGPT, resolved + dismissed items): spine lines + Current pill + "Claude/ChatGPT published vN" + "addressed 1 request/removal" + "✓ Addressed in v2/v3" + "Won't action"; 7 cards (no dups); opens at current; narrow (420) = cards stack, indent 12px, peek hidden. Deck viewer re-checked unregressed. No console errors. (Screenshot blocked — backgrounded preview tab; DOM/computed-style verified.)
- **Flags:** schema change? **YES** (`deck_versions.source` — migration to run). security-relevant? **YES** — provenance capture on the MCP + extension WRITE paths (no new permissions; reuses existing auth); resolved-item loading reuses the same access/redaction. MCP surface? **YES** (capture only — no new tools/params exposed to the AI). **Not committed.**

**Phase-1 completeness check (P1.2) — yes/no:**
- All item types in the stream (comments + stubs + flags + version events)? **YES** — `buildVersionSpine` composes all four (versions as the spine; the rest as rounds).
- Instrumented for feed-vs-deck, deck view too? **YES (seam)** — `deck_landing_viewed{view}` on both feed + deck, `feedback_added` on the deck hooks; **but silent until a PostHog key is set (P0.2)**.
- Flag-gated, default-ON for partners, others land on the deck? **YES** — `FEED_PARTNER_EMAILS` + `?view=feed`/`?view=deck`.
- Stays read-only (no Phase-3 leakage)? **YES** — no composer/threading/decisions/quoting; "see changes" is a read-only list.
- Participation round-trips (read → open deck → comment → back in feed)? **YES** — "Open deck"/"Open slide N" → existing controls; new items load into the feed.

**Outstanding before the Phase-1 gate (report only, not fixing now):**
- **P0.2 analytics key** not set → all events silent until founder adds `NEXT_PUBLIC_POSTHOG_KEY` (and runs nothing else). Gate evidence needs this on.
- **Run the `deck_versions.source` migration** in prod so NEW versions capture provenance (old ones stay generic "AI").
- **Feed not committed/deployed**; founder prod smoke-check pending.
- **Mobile pass** still owed: the feed is desktop-first (deck peek hides < lg, no bottom sheet); P1.1 **Stage E (mobile)** for the deck viewer is parked.
- **P1.1 Stage F** (rollout): floating viewer is default-for-all; per-account viewer targeting parked → P2.
- **P1.3 viral loop v0** (viewer badge · recipient CTA · claim funnel · export footer): not started.
- Minor: feed item-card thumbnails use the CURRENT deck's slide at that index for comments on older versions (the spine strips ARE version-accurate); profiles/display-names are Phase 2 (names derive from email today).

### 2026-06-17 — P1.2: avatar refinements (founder polish round)
- **Items touched:** P1.2 (still 🔵) — four founder-requested avatar tweaks, all in the shared `Avatar` system: (1) **collaborator avatars are now OUTLINE ONLY** — transparent fill + 2px coloured ring + coloured initials (the light tint is gone). (2) **New person palette** steered away from the system colours — blue `#2563EB`, pink `#DB2777`, coral `#EA580C`, slate `#475569`, rose `#BE123C`, brown `#92400E`: **no purple** (brand/buttons), **no teal/green** (comments), **no amber** (the AI). The **owner is now FILLED in their person colour** (white initials) rather than purple, so avatars never read as a button/chip/AI. (3) **`(you)`** tag next to the signed-in viewer's name in feed cards. (4) **`(owner)`** tag next to the deck owner's name; combined when both, e.g. "Greg (you · owner)".
- **Files:** `viewer/Avatar.tsx` (palette + outline-only + owner-filled-person-colour), `viewer/FeedItemCard.tsx` (+`currentUserId`, the you/owner tags), `viewer/DeckFeed.tsx` (pass `currentUserId`); docs `design-system.md` §5, this tracker.
- **Verified by:** `tsc`+`eslint` clean. Browser preview (viewing as owner greg@getpinpoint): owner avatar = filled **blue** (person colour, no purple) in BOTH the account menu and the feed; collaborators = transparent outline (pink, coral); no purple/teal/green avatar anywhere; the owner's card reads "Greg **(you · owner)**". No console errors.
- **Flags:** schema? no. security? no. MCP? no. **Not committed.**

### 2026-06-17 — P1.2: avatar owner role-shape centralised (surgical fix)
- **Items touched:** P1.2 (still 🔵) — surgical fix to the avatar role SHAPE (filled vs outline); colours/initials unchanged. **Root cause:** the filled-vs-outline decision was computed in TWO places (the feed card did `who.userId === deckOwnerId`; the Huddlers cluster used `participant.isOwner`), so the surfaces could diverge.
- **Fix:** the owner decision now lives in ONE place — `viewer/Avatar.tsx`. The component takes `userId` + `ownerId` (the deck's `user_id`) and decides `isOwner = userId === ownerId` itself → owner = FILLED purple, everyone else = OUTLINE (tint + ring), AI = ink+sparkle. Removed the per-surface owner logic: `FeedItemCard` and `HuddleAvatars` just pass `userId`+`ownerId` now. Threaded `deckOwnerId` (= `decks.user_id`) into the cluster on BOTH surfaces — `DeckFeed` already had it; added a `deckOwnerId` prop to `FloatingViewer` (from `page.tsx`).
- **Owner the code resolves (for founder to confirm):** the multi-account test deck "SlideHuddle — Competitive Benchmark" (`c0e8f602`) is owned by **greg@getpinpoint.com** (`decks.user_id`); greg.manzanera + jpcastrog (Juan Castro) are collaborators. (If that's not the expected owner, the deck's ownership is a *data* issue, not the avatar.)
- **Scope note:** `CommentsPanel`'s author avatar (deck-viewer panel) is a separate generic, non-owner-aware circle — left as-is (not part of this bug); `AvatarMenu` is the account chrome — left as-is. Both flagged as optional follow-ups to unify onto the shared `Avatar`.
- **Files:** `viewer/Avatar.tsx`, `viewer/HuddleAvatars.tsx`, `viewer/FeedItemCard.tsx`, `viewer/FloatingViewer.tsx`, `viewer/page.tsx`; docs this tracker.
- **Two follow-ups same session (founder testing on the real deck):** (1) **Account avatar unified** — the top-right `AvatarMenu` was a separate generic lavender "G" chip, so the OWNER looked different there vs the feed. It now renders the shared owner-aware `<Avatar>` when given deck context (`userId`+`ownerId`, passed from `DeckFeed`+`FloatingViewer`; the global `TopNav` still gets the simple chip). Verified: signed-in-as-owner, the account avatar = **GR filled purple**, identical to the feed; cluster shows the two collaborators outlined. Files: `components/AvatarMenu.tsx`, `viewer/DeckFeed.tsx`, `viewer/FloatingViewer.tsx`. (2) **Version-line copy bug** — read "Deck **deck** v1" with no actor; fixed to "Deck v1 shared · 4 slides" / "Greg published deck v2 · 3 slides". File: `viewer/DeckFeed.tsx`.
- **Verified by:** `tsc`+`eslint` clean. Browser preview of the real `DeckFeed` mirroring the deck (owner greg@getpinpoint, collaborators greg.manzanera + Juan Castro), viewed AS a collaborator so the owner appears in the cluster. Computed-style check: **owner (GR) = FILLED purple in BOTH the Huddlers cluster AND the feed cards**; collaborators (JP blue, GM pink) = OUTLINE in both; the ONLY filled avatar anywhere on the page = the owner. Deck viewer (`/viewer`) re-checked — unregressed, no console errors. (Screenshot still blocked by the backgrounded preview tab → DOM/computed-style verified.)
- **Flags:** schema? **no.** security-relevant? **no.** MCP? **no.** **Not committed.**
- **Recommended next:** founder confirm greg@getpinpoint is the expected owner of that deck; remove the throwaway `/feed-preview` route; then commit/deploy.

### 2026-06-16 — P1.2: feed information-design pass (avatars, horizontal cards, thumbnails, click-to-peek)
- **Items touched:** P1.2 (still 🔵) — a styling/structure pass on the feed (no new data, no new features; none of the Phase-3 set). Built per founder brief.
- **Avatar system (`viewer/Avatar.tsx`, new):** ONE reusable component, two signals — **shape = role** (owner FILLED purple / collaborator OUTLINE: coloured ring + initials on the colour's light tint / AI ink circle + amber sparkle) and **colour = person** (deterministic hash of user id → 6-colour palette; purple reserved for owner, amber for AI). Initials from display name (first+last) or email local part (strip trailing digits, split on `._-+`). `HuddleAvatars` refactored to use it, so the deck viewer's top-bar cluster gets per-person colours too.
- **Horizontal card (`viewer/FeedItemCard.tsx`, new):** thumbnail left · content middle · slide pill top-right; type-aware (comment/stub/flag) with distinct icon + thumbnail. **Thumbnails — cheap path:** scaled-iframe live render of the slide HTML (reused `FloatingThumbnailStrip`'s `SlideThumb` pattern + `buildSrcdoc`); comment = clean real slide, flag = real slide greyed + X overlay (red card border), stub = a dashed-teal mini-slide rendered from its 3 inputs. Pills type-aware ("Slide N" vs "After slide N ↓"). Narrow screens: thumbnail stacks above text.
- **`DeckFeed` rebuilt:** click any item → selects it (purple ring) + moves the deck peek to its slide; **peek shows per-slide stats** for the selected slide (always "N comments"; "N flagged for removal" in red and "N requested here" only when > 0 — aggregated via `useMemo` over the FULL comment/flag/stub arrays, not the rendered subset). **Version timeline lines** ("Greg shared deck v1 · 2 slides") give the stream shape; day dividers kept. **"Open slide N"** deep-links via a new `?slide=N` param (`page.tsx` → `FloatingViewer` maps it to the matching display-item on mount).
- **Data-bug finding:** queried every deck's rows directly — **no duplicate comments/stubs/flags exist anywhere**; the feed renders each row once. The "duplication" was almost certainly the two near-identical grey version lines (now distinct story lines). Hardened anyway: `feed-items.ts` dedupes by key + collapses duplicate version numbers; each card field renders exactly once. Asked founder to point at a specific deck if a real duplicate persists.
- **Files:** NEW `Avatar.tsx`, `FeedItemCard.tsx`; MODIFIED `DeckFeed.tsx`, `feed-items.ts`, `HuddleAvatars.tsx`, `FloatingViewer.tsx` + `page.tsx` (`?slide=N`); docs `design-system.md` §5 (Avatar + Feed-item-card entries), this tracker.
- **Verified by:** `tsc` + `eslint` clean. Browser preview of the real `DeckFeed` (mock route, owner + 3 named collaborators, all three item types, 3 versions): **avatars distinct + stable** (Greg = filled purple owner; Aisha pink, Jordan blue, Sara teal outlines), 6 cards / 6 iframes, type-aware pills ("After slide 2" for the stub), **click-to-peek** jumps the peek + updates per-slide stats (stub → "1 requested here"; flag → "1 flagged for removal" red, "0 comments"), `&slide=N` deep-link updates, version lines read as a story. Responsive checked at 1280 (card row, peek shown) and 420 (card column = thumbnail ABOVE text, peek hidden). No console errors. **No screenshot image** — the preview tool's tab is backgrounded (`visibilityState:hidden`), which suspends the screenshot compositor; verified via DOM/computed-style instead. Throwaway `/feed-preview` route kept temporarily so the founder can view the multi-user design live.
- **Flags:** schema? **no.** security-relevant? **no** — presentation only; same redaction rules; no auth/RLS/service-role/MCP. MCP surface? **no.** **Not committed.**
- **Recommended next session:** founder views `/feed-preview` (or adds 2–3 named test users to a deck) → confirm avatars differ per person; remove the throwaway route; then commit/deploy.

### 2026-06-16 — P1.2: read-only conversation feed (alternative landing) + analytics seam
- **Items touched:** P1.2 ⬜→🔵 — built the read-only "Huddle feed" as an alternative LANDING surface for a deck (design-system §6.2), composing only data we already store. Founder decisions this session (via AskUserQuestion): **install PostHog now**; gate via an **email allowlist + `?view=` override**; **oldest-first** ordering.
- **What it does:** `feed-items.ts` (pure) merges deck-version events + all-version comments + requested slides (stubs) + removal flags into one oldest-first stream. `DeckFeed.tsx` renders it as chat-style cards (avatar + author + relative time + body; "Slide N · vN" chips that re-point the peek; stub & flag cards; dismissed comments struck), with day dividers and a catch-up ribbon, and the deck **demoted to a right "peek"** (a scaled live iframe via the shared `parseDeck`/`buildSrcdoc`) + an **Open deck** button (carries `?view=deck`). It is **read-only** — no composer; you participate by opening the deck and using the existing controls, and your feedback shows back up in the feed.
- **Gating:** `page.tsx` resolves a `landing: feed|deck` for stored decks — `?view=feed`/`?view=deck` win per-URL; otherwise a signed-in viewer whose email is in `FEED_PARTNER_EMAILS` lands on the feed, everyone else on the deck. New read-only `getAllCommentsForDeck` (all versions; same access check + email re-resolution as the version-scoped loader). Deck-path round-trips unchanged when not showing the feed.
- **Instrumentation (P0.2 seam):** added `posthog-js` + `lib/analytics.ts` (`track`/`identifyUser`, **safe no-op until `NEXT_PUBLIC_POSTHOG_KEY` is set**) + a root `PostHogProvider`. Events: `deck_landing_viewed{view:feed|deck, role, isPartner, counts}` on BOTH landings (the "which view do partners use" evidence) · `feed_open_deck` · `feedback_added{kind}` in the 3 deck hooks (the "did feedback volume go up" evidence). **No PostHog account/key yet — Greg owns that decision (region/account); measurement turns on the moment a key is set, no code change.**
- **Reuse:** extracted the anon `ReviewingChip`/`SharedDeckChip` to shared `HuddleChips.tsx` (used by both viewer + feed); extracted `formatRelativeTime` to `lib/relative-time.ts` (CommentsPanel now imports it); reused `DeckVersionNav`/`HuddleAvatars`/`AvatarMenu`/`parseDeck`/`buildSrcdoc`/`computeArrivalActivity` + the existing redaction rules.
- **Files changed:** NEW `web/src/lib/analytics.ts`, `web/src/lib/relative-time.ts`, `web/src/app/PostHogProvider.tsx`, `web/src/app/viewer/feed-items.ts`, `web/src/app/viewer/DeckFeed.tsx`, `web/src/app/viewer/HuddleChips.tsx`, `web/.env.example`; MODIFIED `web/src/app/layout.tsx`, `web/src/lib/slide-store.ts` (getAllCommentsForDeck), `web/src/app/viewer/page.tsx` (gating + feed branch), `FloatingViewer.tsx` (landing event + chip import + `isPartner`), `useDeckComments.ts`/`useDeckStubs.ts`/`useDeckFlags.ts` (feedback_added), `CommentsPanel.tsx` (shared relative-time); `web/package.json` (+posthog-js). Docs: this tracker.
- **Verified by:** `npm run typecheck` + `npm run lint` clean (analytics no-ops without a key). Real-module node test of `buildFeedItems` (oldest-first, all 4 kinds, version-before-feedback tie). Browser preview of the real `DeckFeed` with mock data: all four card kinds render in correct order with day dividers + catch-up ribbon; dismissed comment is `line-through` + "Won't send to AI"; peek iframe scales 288/1280 = 0.225; **Open deck href = `/viewer?id=…&view=deck`**; `deck_landing_viewed` fires; no console errors. Deck viewer (`/viewer` sample) re-checked — renders unregressed (floating controls + iframe + counter), its own `deck_landing_viewed` fires. Throwaway preview route + test file deleted. **No screenshot** — preview tab backgrounded (compositor blocked), DOM-snapshot-verified instead.
- **Flags:** schema change? **no.** security-relevant? new read-only `getAllCommentsForDeck` reuses the **same** owns-deck-OR-shared access check + trustworthy author-email re-resolution as the existing loader; anonymous viewers still get `[]` comments and email-redacted stubs/flags (unchanged rules). PostHog is **client-side** analytics gated on a public env key; identify only fires for signed-in users. No auth/RLS/service-role/MCP changes. MCP surface? **no.** **Not committed.**
- **New parking-lot entries:** P0.2 now partially seeded (PostHog lib + seam + events); feed gate is an env allowlist (per-account toggle → P2 workspaces); mobile feed layout deferred to the mobile pass.
- **Recommended next session:** founder end-to-end test (add your email to `FEED_PARTNER_EMAILS` in `web/.env.local`, open a deck with comments → land on the feed → Open deck → comment → see it in the feed); set a PostHog key to light up measurement; then commit/deploy. After partners use it, P1.2 → ✅ on the Gate-G1 evidence.

### 2026-06-14 — Stage F (rollout): position + the logical next step (documentation only)
- **Stage F is effectively satisfied already.** The floating viewer is the default for everyone (deployed today, CI run 27511906445 green), with `?view=classic` + the `FLOATING_VIEWER_DEFAULT` env kill switch as fallbacks. At this stage the only real audience is the close design-partner group, so "everyone" ≈ "the test group" — no per-account/test-group targeting is needed yet.
- **Most logical next step to CLOSE Stage F:** a **founder production smoke-check (👤)** — open the live deck viewer, confirm the redesign renders correctly, and confirm `?view=classic` still falls back to the old viewer. That's the "safely" half (CI/type-check is already green). After that, Stage F can be marked done.
- **When the founder will need to address per-account/test-group targeting:** defer it until **Phase 2**. It becomes *needed* only when the audience broadens beyond the close partner group — i.e., when there are users you'd want to keep on the classic viewer while partners get the new one — OR when Phase 2's **workspaces + profiles/per-user flags** land (the natural home for an account-level toggle). Logged in the Parking Lot (proposed P2). Until then, default-for-all is the correct, lightest choice.
- **Related dependency for *measuring* rollout:** analytics (**P0.2**, deferred) — needed to see whether partners actually use the new viewer; relevant as design-partner recruitment (**P1.4**) ramps.
- **No code changes** — documentation only.

### 2026-06-14 — Committed + pushed today's P1.1 desktop work to `main`
- Committed the day's P1.1 desktop work as one commit and pushed to `main`: the colour-rule/cluster refinement, Stage B (inset + persistence + gear), the toast top-layer + popover-clamp fixes, Stage C (version-awareness + flag UI + orphan nudge), Stage D ("N reviewing"), and the flag/requested-slide "…" → bottom-right + dismiss-hide.
- **Deploys to production via Vercel** (push-to-main). The redesigned floating viewer (now improved) goes live; the classic viewer (`?view=classic`) + the `FLOATING_VIEWER_DEFAULT` kill switch remain as fallbacks.
- **Files:** the modified + new viewer/component files from the stage entries below; docs (`design-system.md`, this tracker). `.wip-backup/` deliberately NOT committed (pre-existing local backup).
- **Flags:** schema? **no.** security-relevant? the flag-creation write reuses the existing RLS `slide_flags` insert/delete; the anonymous "N reviewing" **count-only** exposure was founder-approved — both already detailed in the stage entries. No auth/service-role/MCP changes. MCP surface? **no.**
- **Verified by:** `tsc` + `eslint` clean; behaviours eval-verified through the session (no screenshots — preview tab backgrounded). CI (lint + type-check) runs on the push.
- **Next:** Stage F (rollout decision) + any desktop polish; Stage E (mobile) still parked.

### 2026-06-14 — Decision: defer Stage E (mobile) until the desktop base is complete
- **Founder decision:** the mobile pass (Stage E — floating panels → bottom sheets, hover→tap controls, thumb-reach composer) **waits** until we have a complete base **desktop** experience. Rationale: don't polish mobile against a still-moving desktop target. Stage E is **parked, not dropped**.
- **Where that leaves P1.1:** desktop Stages B/C/D done; remaining = any desktop polish + **Stage F** (rollout). Note: the floating viewer is *already* the default in production (committed earlier, 0b1bea3); the B/C/D improvements are all **uncommitted/undeployed** (bundled) — so "complete base desktop experience for real users" = commit + deploy that work.
- **Next:** founder to direct — continue desktop polish, or do Stage F (commit/deploy the desktop work + decide default-for-all vs test-group-only).

### 2026-06-14 — P1.1 Stage D: recipient (guest) view — "N reviewing" copy + z-index/inset confirmed
- **Items touched:** P1.1 (still 🔵). Stage D's three bullets:
  - **"N reviewing" guest copy (§10.6)** — anonymous link viewers now get a count-only **"N reviewing"** chip instead of the generic "Shared deck" (and never the team word "Huddlers"). Signed-in viewers still get the `HuddleAvatars` "N Huddlers" cluster. New `ReviewingChip` in `FloatingViewer`; `page.tsx` computes the participant **count** for every floating stored-deck view and passes `reviewingCount` (identities still gated to signed-in via `participants`).
  - **Z-index glitch (§10.3)** — confirmed **already fixed** by the rewrite: the deck title renders *inside* the brand pill (verified `titleInsideBrandPill: true`, z-index auto), so the old "title behind the pill" glitch can't occur. No change needed.
  - **Inset + Floating-Canvas styling** — the recipient view is the same `FloatingViewer`, so the Stage-B inset and styling already apply. No change needed.
- **Files changed:** `web/src/app/viewer/FloatingViewer.tsx` (`ReviewingChip` + `reviewingCount` prop + anon branch); `web/src/app/viewer/page.tsx` (compute `reviewingCount`, pass it). Docs: this tracker.
- **Flags:** schema change? **no.** security-relevant? **YES (intentional, founder-approved):** anonymous viewers now receive a participant **COUNT** (e.g. "3 reviewing") — previously they got zero participant info. It is a count only; **no names or emails** reach an anonymous viewer (verified: rows are gated behind `canSeeCollaboratorEmails`). No auth/RLS/service-role/MCP changes. MCP surface? **no.** Minor perf note: this adds one `getDeckParticipants` query per anonymous stored-deck view (was signed-in-only). **Not committed.**
- **Scope note:** the *full* client SURFACE from mockup Screen 5 (agency logo leading, "Reviewed on SlideHuddle" footer, a Decisions-log tab, named-guest identities) is **Phase 2/5** (named guests + Studio branding), not P1.1. Stage D delivered the three bullets in the brief.
- **Verified by:** `tsc`+`eslint` clean. Mock anonymous-recipient render (eval): chip reads "3 reviewing", no "Shared deck"/"Huddler" text, title inside the brand pill. No screenshot (preview tab backgrounded this session).
- **Recommended next session:** Stage E — mobile bottom sheets (its own session per the plan); then Stage F (rollout).

### 2026-06-14 — P1.1 Stage C: version awareness + flag-for-removal UI + orphan nudge
- **Items touched:** P1.1 (still 🔵). Stage B approved by founder. Built Stage C's three functional gaps in the floating viewer (zoom was already removed):
  - **Version awareness** — new `useDeckVersionWatch` hook (a faithful mirror of SlideViewer's 12s `/api/deck-version` poll, so the live viewer stays untouched) surfaces an amber **"This deck was revised — Load v{n}"** prompt when the deck is revised out-of-band (e.g. the AI publishing via MCP). It **prompts** (never auto-refreshes, so a half-typed comment isn't lost); "Load vN" → `router.refresh()`, and a new version **`key`** on the floating viewer (page.tsx) remounts it with the new slides/comments. The key also fixes a latent bug where switching versions via the chip kept stale comments.
  - **Flag-for-removal UI** — reused the classic viewer's `SlideFlagControl` ("…" menu, **bottom-right** of the slide in the floating viewer via a new `position` prop; classic stays top-left) + a new `useDeckFlags` hook (mirrors `useDeckStubs`: RLS insert/delete via the browser client; owner dismiss via `setFlagCurationAction`). Flags show inline in the comments panel and feed the live "Send to AI" prompt. **Owner-dismiss now HIDES the flag** (founder request: a dismissed flag was lingering struck-through and still "felt in effect") — the floating viewer surfaces only non-dismissed flags, so the slide reads un-flagged; the row stays in the DB for audit + out of the AI prompt, and the slide can be re-flagged. For consistency, the **requested-slide (stub) "…" edit/delete menu** was also moved to the same bottom-right corner with the same dark hover-revealed look (a `placement` prop on `StubSlideView`/`StubActionsMenu`; classic viewer stays inline).
  - **Orphan-deck nudge** — ported the P0.4 fix: on an unclaimed deck the panel shows "ask the creator to claim it" instead of a composer, and comment/flag/stub creation + the flag "…" are gated off. Resolves the parking-lot item.
- **Files changed:** NEW `web/src/app/viewer/useDeckVersionWatch.ts`, `useDeckFlags.ts`; `FloatingViewer.tsx` (wire all three + the version banner + `SlideFlagControl` on the slide); `page.tsx` (pass `isOrphanDeck` + `viewerFlags` to the floating viewer; add the version `key`). Docs: this tracker.
- **Flags:** schema change? **no.** security-relevant? **flag creation is a collaboration WRITE** — but it reuses the *same* RLS-governed `slide_flags` insert/delete the classic viewer already does (no new permission surface). Data note: the floating viewer now receives `viewerFlags` for ALL signed-in collaborators (was owner-only) — this is **parity with the classic viewer**, which already passes `viewerFlags`; anonymous viewers' `flagged_by` emails stay redacted. No auth/service-role/MCP changes. MCP surface? **no.** **Not committed.**
- **Verified by:** `tsc`+`eslint` clean. Mock-props render (eval): owner with a flagged slide → "…" flag control present + the panel shows "Flagged for removal" + the reason + a flagged pill; orphan variant → panel shows the claim nudge, composer hidden, flag "…" hidden. The version poll/banner is a line-for-line mirror of the in-prod classic-viewer poll (typecheck-clean; live-triggering needs a real out-of-band revision + ~12s, so not forced in eval). No screenshot (preview tab backgrounded this session).
- **Recommended next session:** Stage D — "3 reviewing" guest copy on the recipient surface (count-only to anon, per founder) + re-verify the recipient z-index; then Stage E (mobile).

### 2026-06-14 — Two viewer bug-fixes (founder-spotted in Stage-B screenshots): toasts top-layer + popovers clamp on-screen
- **Items touched:** not formal P-items — two bugs the founder caught. **(1) Toasts were hidden.** The "Link copied" / "Sent to AI" confirmation toasts rendered *inside* the `z-20` backdrop-blur pill cluster, so the `z-30` comments panel painted over them (a `z-…` bump can't escape an ancestor stacking context). **(2) "Request a slide" form ran off-screen.** `PortalPopover` only flipped up when a panel fully fit above; a tall form opened from a *low* thumbnail fit neither way, opened downward, and spilled under the viewport with its submit button unreachable.
- **Fixes:** (1) new shared `AnchoredToast` portals toasts to `<body>` at `z-10000` (above every panel/pill/popover) — **fixed rule**, now codified in design-system §3.2. (2) `PortalPopover` clamps the panel's `top` so the whole panel always stays on-screen (shifts up to fit; may overlap the anchor, far better than an off-screen button).
- **Files changed:** NEW `web/src/components/AnchoredToast.tsx`; `web/src/components/PortalPopover.tsx` (vertical clamp); `web/src/app/viewer/CopyLinkButton.tsx` + `SendToClaudeButton.tsx` (route toasts through `AnchoredToast`). Docs: `design-system.md` §3.2, this tracker.
- **Scope note:** `AnchoredToast` + `PortalPopover` are shared with the **classic** viewer too, so both fixes apply there as well (toasts still appear under their button — just on the top layer now).
- **Verified by:** `tsc`+`eslint` clean. Temp-page eval: toast wrapper is a direct child of `<body>`, `position:fixed`, `z-index 10000`, 6px below its anchor; a 480px popover anchored at the bottom edge (innerHeight 578) clamped to top 90 / bottom 570 → fully on-screen. Temp page deleted.
- **Flags:** schema? **no.** security-relevant? **no** (presentation only; no auth/RLS/service-role/MCP). MCP surface? **no.** **Not committed.**
- **Recommended next:** still holding for founder visual sign-off of Stage B (sliver + counter + cluster + gear + these fixes); then Stage C.

### 2026-06-14 — P1.1 Stage B: persistence policy (rail sliver + always-on counter)
- **Items touched:** P1.1 (still 🔵) — implemented the §4.1 persistence policy on the floating viewer, completing **Stage B (deck-viewer redesign)** of the founder's A–F brief (inset + action-cluster were already done). The rail no longer fully disappears when closed: it collapses to a **sliver** on the left edge — a 14px rounded strip showing a teal **comment-activity dot per slide that has comments** ("the team's fingerprints", §3.2). Hover, tap, or press **`T`** expands it to the full `FloatingThumbnailStrip`. The **slide counter is now always visible** (§4.1) instead of fading on idle. `T` is guarded so it doesn't fire while typing in the comment composer (arrow-key behaviour left unchanged, per founder). The bottom-left **pin** was replaced by a **gear → settings dropdown** (opens upward via `PortalPopover`) holding a "Pin floating bars" toggle (reuses the existing pin state; a purple dot on the gear shows when it's on).
- **Reuse:** built on the existing components — the sliver reuses `commentCountBySlide` (already computed for the thumbnail badges) and opens the existing `FloatingThumbnailStrip`; no rewrite. `useDeckComments`/`useDeckStubs` untouched.
- **Files changed:** `web/src/app/viewer/FloatingViewer.tsx` only (sliver JSX + `commentedSlides` memo; counter de-faded; `T`-toggle effect (typing-guarded) placed after `reveal`; left nav-arrow nudged clear of the sliver; bottom-left pin → gear/settings dropdown via `PortalPopover`; header comment). Docs: this tracker.
- **Verified by:** `npm run typecheck` + `npm run lint` exit 0. Rendered the real `FloatingViewer` with mock props (5 slides; comments on slides 1/3/4; signed-in owner) on a throwaway dev route and inspected the DOM: **sliver present** at x=8, w=14, full-height; **exactly 3 teal dots** (matching the 3 commented slides); **counter "1 / 5" at opacity 1**; dispatching a `T` keydown **swaps sliver → full 185px strip** and the counter stays. Temp route deleted. Gear→settings verified on the sample deck: gear present, menu opens with the "Pin floating bars" toggle, toggling flips aria-checked false→true and shows the purple pinned-dot. **No screenshot image** — the preview tab is backgrounded this session (`visibilityState: hidden`), which blocks capture; founder to eyeball via self-view steps (in response).
- **Flags:** schema change? **no.** security-relevant? **no** — presentation-only; no auth/RLS/service-role/MCP; no DB writes. MCP surface changed? **no.** **Not committed.**
- **Held for approval:** per the founder's brief, STOP after Stage B for a visual sign-off before Stage C. Awaiting that.
- **Recommended next session:** on approval, Stage C — port the classic viewer's version-poll into a shared hook for the floating viewer + add the flag-for-removal UI (reusing `SlideFlagControl`).

### 2026-06-14 — P1.1 Stage 1: top-right action cluster + colour-rule refinement
- **Items touched:** P1.1 (still 🔵) — Stage 1 cosmetic pass on the floating viewer's top-right action cluster. **The plan changed mid-stage:** I first made Send to AI amber (design-system §10 #2 "amber restored"), then the founder refined the colour rule and reversed it. Final state, hierarchy-by-weight not colour: **Share** = filled purple (the only filled button — everyday primary action); **Send to AI** = purple-outline split (reverted to the original); **Comments** = a quiet bare **teal icon + count** (was a filled green pill — it only toggles the panel, so it's the lightest control). Order left→right Send to AI · Comments · Share (already correct). Recipient-view z-index (#3) and brand-pill icon (#4) confirmed already clean in the current rewrite (no change needed).
- **The colour rule (now canonical):** **purple = actions you take** (Share, the composer's Send, **and Send to AI** — invoking the AI is something you do); **amber = the AI's own voice** (its feed posts, "Queued/Sent to AI" chips, its avatar) — *never* the button that invokes it; **teal = the team** (unchanged). This supersedes design-system §2.2 / §10 #2.
- **Files changed:** `web/src/app/viewer/SendToClaudeButton.tsx` (reverted to purple-only — removed the amber `tone` option I'd added), `web/src/app/viewer/FloatingViewer.tsx` (dropped `tone="amber"`; restyled the Comments toggle to a bare teal icon+count), `web/src/app/viewer/ThumbnailStrip.tsx` (fixed a stale "amber" comment — the classic button is actually purple). Docs: `design-system.md` (§2.2 colour table + rules, §3.2 cluster grammar, §5 Send-to-AI + Comments specs, §6 Claude-queue send, §10 #2 marked superseded, header → v2.1 + mockup-lag note); this tracker.
- **Verified by:** `npm run typecheck` + `npm run lint` both exit 0. Computed-style spot-check confirmed Send to AI back to purple-outline (the Stage-1 amber was earlier verified at `#C77D11`, now reverted). **No fresh screenshot** of the full cluster: it only renders for a signed-in owner with feedback, and this session's preview tab is backgrounded (`document.visibilityState === "hidden"`), which blocks the screenshot compositor (page still responds to eval). Founder can self-view — see response.
- **Flags:** schema change? **no.** security-relevant? **no** — presentation-only; no auth/RLS/service-role/MCP touched (no DB writes this stage either). MCP surface changed? **no.** **Not committed.**
- **New parking-lot entries:** (1) `mockups-v2.html` still shows amber Send-to-AI + filled Comments — refresh to match the v2.1 colour rule (proposed P1, low priority). (2) `ArrivalBanner.tsx` styles team-comment arrivals in **amber**, but the new rule makes team = teal — revisit (proposed P1/P3).
- **Recommended next session:** Stage 3 — rail sliver + always-on counter (design-system §4.1/§5), replacing the current "collapse everything on idle". Then Stage 4 (version poll + flag UI + orphan-nudge port).

### 2026-06-14 — Phase 1 begins · P1.1 Stage 2: occlusion fix (inset, not overlay) + zoom removed
- **Items touched:** P1.1 ⬜→🔵 — implemented the design system's §3.3 **"inset, not overlay"** must-fix (design-review punch-list #1) in the floating viewer: when the thumbnail strip and/or comments panel is open, the slide now **scales down and shifts into the safe area beside the panel** instead of rendering underneath it. Also **removed the inert zoom placeholder** (founder decision this session: remove, not implement). This is Stage 2 of the agreed P1.1 plan; founder chose to start here.
- **Files changed:** `web/src/app/viewer/FloatingViewer.tsx` only — inset layout constants (STRIP_INSET/PANEL_INSET); `leftInset`/`rightInset` gated on each panel actually rendering; `measure()` shrinks the fit-box by the insets (clamped) and re-runs on panel toggle; `translateX` offset + 200ms transition on the slide card (snaps under reduced motion); removed the `Placeholder` component + the zoom block; refreshed the header comment.
- **Verified by:** `npm run typecheck` + `npm run lint` both exit 0. Browser preview at 1280×800 on a throwaway 5-slide stored deck: strip-closed = full-bleed (slide 0→1280); strip-open = slide shrinks to 1067 and shifts to left:213, a clean **12px gap** to the strip's right edge (201) → **no overlap** (previously the panel floated over the slide). Screenshot captured; no console errors. The comments-panel side reuses the identical `rightInset`/`PANEL_INSET`/offset code path (verified by construction — a live both-panels-open shot needs a signed-in session; offered to founder).
- **Flags:** schema change? **no.** security-relevant? the **code** change is presentation-only — **no auth/RLS/service-role/MCP touched.** The **verification** created + deleted ONE throwaway orphan deck in the **production** DB via the service-role key (same authorised pattern as P0.3/P0.4); cleanup re-verified ("No slides to display." on the deleted id). Temp seed script removed. MCP surface changed? **no.** **Not committed / not deployed.**
- **Known minor cosmetic (not a bug):** with only the left strip open, the slide can touch the right viewport edge (that side has no panel, so it stays full-bleed there). Acceptable; can add a symmetric edge gap later if founder prefers.
- **New parking-lot entries:** none (the floating-viewer orphan-deck nudge port is already logged for P1, to fold into Stage 4).
- **Recommended next session:** Stage 1 (cosmetic) — amber Send-to-AI **[careful: `SendToClaudeButton` is shared with the classic viewer; parametrise the colour so classic stays purple]**, verify/fix recipient-view z-index (#3), confirm brand-pill icon (#4). Then Stage 3 (rail sliver + always-on counter). Founder: review the inset screenshot and approve before we build wider.

### 2026-06-13 — Floating viewer promoted to default (behind a kill switch)
- **Items touched:** none (not a formal P-item). Flipped the floating viewer from opt-in (`?view=floating`, default off) to the **default** viewer, per founder request. Classic viewer retained as `?view=classic` escape hatch; new `FLOATING_VIEWER_DEFAULT` env var is a server-side kill switch (`0`/`false`/`off` → roll back to classic, no code change). Founder chose env-var flag + escape hatch via AskUserQuestion.
- **Files changed:** `web/src/app/viewer/page.tsx` (added `floatingViewerDefault()` helper + `view === "floating" ? … : view === "classic" ? … : default` branch); `web/src/app/viewer/FloatingViewer.tsx` (header comment); docs: `architecture.md`, `TECHNICAL.md`, `FEATURE-INVENTORY.md`.
- **Verified by:** `npm run lint` + `npm run typecheck` both exit 0. Browser preview: `/viewer` (no param) renders the floating viewer (4 `[data-floating-control]`, zoom/counter chrome, no classic TopNav); `/viewer?view=classic` renders the classic viewer ("Viewing sample deck" banner + thumbnail strip, 0 floating controls); no console errors. **Not yet committed or deployed.**
- **Flags:** schema change? no. security-relevant? no — same server-fetched, role-gated, email-redacted props feed both viewers; presentation-only switch. MCP surface changed? no.
- **Known caveat carried in:** floating viewer has **no mobile layout** and **inert zoom** yet (FEATURE-INVENTORY E); making it the default means phones now get it. Uncommitted "huddle signals" work still sits in `.wip-backup/`.
- **New parking-lot entries:** none.
- **Recommended next session:** commit + deploy this; then prioritise the floating viewer's mobile layout before it's the default for real users at scale.

### 2026-06-13 — Session 3: P0.6 CI baseline (lint + type-check) ✅
- **Items touched:** P0.6 ⬜→✅ — minimal GitHub Actions CI (lint + TypeScript type-check) on push-to-main + PRs. Pushed to main; first CI run on GitHub = success.
- **Files changed (config):** NEW `.github/workflows/ci.yml`; `web/package.json` gained a `"typecheck": "tsc --noEmit"` script. No application code changed.
- **Decision:** `test-loop.mjs` is NOT in CI — it needs the service-role key + live DB (reads web/.env.local, hits prod), which must never be wired into CI. Documented safe path: run it later against a dedicated TEST Supabase project. (Also means the parked stale-test assertion no longer blocks CI.)
- **Verified by:** ran the exact CI commands locally — `npm run lint` (exit 0) and `npm run typecheck` (exit 0). The workflow YAML itself is unverified until it runs on GitHub.
- **Flags:** schema change? no. security-relevant? CI deliberately uses NO secrets/DB (the whole point). MCP surface changed? no.
- **Push/deploy:** Greg approved (option A). Pushed `main` (41041ac..9fff55b) → CI ran green on GitHub (verified via API: completed/success) AND Vercel deployed P0.3 + P0.4 to production. This was the session's first production deploy.
- **New parking-lot entries:** none.
- **Recommended next session:** founder track (P0.7–P0.9). When P0.2 (analytics) is picked up, add the P0.4 orphan-funnel instrumentation event then.

### 2026-06-13 — Session 2: P0.4 orphan-deck comment nudge ✅ + PDF export deprioritized
- **Items touched:** P0.4 ⬜→✅ — orphan decks (no owner yet) now show a clear "comments aren't available until the creator claims it" nudge instead of a comment box that silently fails at the DB. P0.5 marked deferred (founder decision — LLMs can generate PDFs).
- **Files changed:** `web/src/app/viewer/page.tsx` (compute `isOrphanDeck` after the claim logic + pass to SlideViewer), `web/src/app/viewer/SlideViewer.tsx` (prop + gate canComment/canInsert/canFlag off for orphans + pass to panel), `web/src/app/viewer/CommentsPanel.tsx` (prop + orphan footer state). Docs: tracker + `gap-analysis-plan.md` PDF deprioritization. **Code not yet committed at time of writing.**
- **Verified by:** `tsc --noEmit` + eslint clean; browser preview — created a throwaway orphan deck (anon POST), viewed it anonymously, opened the comments panel, confirmed the nudge renders (screenshot); throwaway deck deleted from the DB afterwards (verified gone). The signed-in-orphan path renders the same nudge branch (canComment gated false, tsc-verified).
- **Flags:** schema change? no. security-relevant? the fix touches no auth/RLS/service-role/MCP code; the verification used the service-role key to create + delete one throwaway orphan deck in the *production* DB (consistent with the earlier authorised test run), cleanup confirmed. MCP surface changed? no.
- **New parking-lot entries:** (1) floating viewer has the same orphan dead-end — port the nudge in P1.1; (2 — already logged) stale historical-version-chip test assertion.
- **Recommended next session:** P0.6 (CI on push to main) — bundle the stale-test fix so the suite is green; then the founder track (P0.7–P0.9). P0.4 instrumentation rides on P0.2 when analytics lands.

### 2026-06-13 — Session 1: P0.3 extension-update feedback resolution ✅
- **Items touched:** P0.3 🔵→✅ — wired `clearAddressedFeedback` into the extension update path (parity with MCP `update_deck`), verified end-to-end.
- **Files changed:** `web/src/app/api/slides/route.ts` (import + best-effort `clearAddressedFeedback` after `updateDeck` + `resolvedFeedbackCount` in the response); `web/scripts/test-loop.mjs` (added `restPost` + a P0.3 block that seeds a stub & flag, runs the token-authed update, asserts both `resolved_at` set + `resolvedFeedbackCount === 2`). **Not yet committed.**
- **Verified by:** `tsc --noEmit` + eslint clean; `node scripts/test-loop.mjs` against the live (production) Supabase via a local dev server → all 3 P0.3 assertions pass + full create→update→version loop passes (53 passed, 1 failed). The 1 failure is unrelated test-drift (Parking Lot). Test deck auto-cleaned from the DB (cleanup log confirmed).
- **Flags:** schema change? no. security-relevant? yes — the new call uses the existing (unchanged) service-role-backed `clearAddressedFeedback`; the verification run used the service-role key to seed/delete a throwaway orphan deck in the *production* DB (Greg authorised). No auth/RLS/MCP-surface changes. MCP surface changed? no.
- **New parking-lot entries:** stale `test-loop.mjs` assertion (historical-view version chip) — fix before P0.6 CI.
- **Recommended next session:** founder picks next P0 item (P0.4 / P0.5 / P0.6); commit the P0.3 code change; fix the stale test assertion when wiring P0.6.

### 2026-06-13 — Session 0: orientation, import reference docs, P0.1 ✅
- **Items touched:** P0.1 ⬜→✅ — Greg ran `docs/verify-rls.sql` in production Supabase. Result: all 7 tables `rls_enabled=true`; the anon-policy check returned 0 rows. RLS is live across the whole DB with nothing exposed to the logged-out role. The plan's #1 blocker, closed clean — no remediation needed.
- **Files changed:** imported 5 reference docs into `docs/` — `PROGRESS-TRACKER.md`, `gap-analysis-plan.md`, `design-system.md`, `voice-of-user.md`, `mockups-v2.html` (previously only in Greg's Downloads; verified never in git history). No code or DB changes.
- **Verified by:** Greg's two query results pasted back (7× `rls_enabled=true`; anon check empty). verify-rls.sql confirmed read-only (SELECT-only) before running.
- **Flags:** schema change? no. security-relevant? yes — RLS-live verification; verification only, no changes made. MCP surface changed? no.
- **New parking-lot entries:** none.
- **Recommended next session:** start P0.2 (analytics from zero). First decision for Greg: which analytics tool (PostHog vs Plausible vs alternative) — bring options + recommendation before installing.
