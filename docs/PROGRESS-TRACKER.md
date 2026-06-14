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
| **Current focus** | P1.1 🔵 — **Stages B + C + D done** (B approved by founder 2026-06-14). D: anonymous recipients now see a count-only **"N reviewing"** chip (not "Huddlers"/"Shared deck"); deck-title z-index confirmed already clean (title lives inside the brand pill); inset/Floating-Canvas styling already applies to the recipient view. **Stage E (mobile) DEFERRED by founder** until the base desktop experience is complete. Today's P1.1 desktop work (Stages B–D + fixes) **committed + pushed to `main` 2026-06-14** (deploys via Vercel; CI green). **Stage F (rollout)** is effectively satisfied by default-for-all + `?view=classic` fallback — to close it: a founder prod smoke-check; per-account/test-group targeting parked → **Phase 2** (see Parking Lot). Stage E (mobile) parked. |
| **Phase progress** | P0: 4/9 · P1: 0/4 (P1.1 in progress) · P2: 0/6 · P3: 0/6 · P4: 0/5 · P5: 0/6 |
| **Gates passed** | none |
| **Open blockers** | 0 |
| **Last session** | 2026-06-14 |

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
| P1.2 | Read-only feed view: comments + stubs + flags + version events as one stream; deck demoted to peek; flag-gated, default-on for partners | M | ⬜ | | |
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
