# SlideHuddle — Gap Analysis & Master Build Plan
## From the audited codebase to the Huddle model and the commercial launch

*Synthesis of three inputs: the code-derived FEATURE-INVENTORY (12 June 2026, commit 41041ac), "SlideHuddle: The Huddle Model" (concept & moat), and the Business Model & Commercial Plan (UK/English-speaking edition). This document supersedes the phase plans in both earlier documents — it is now the single sequenced plan. June 2026.*

---

## 1. Executive summary

The audit changes the picture in both directions, and on balance **the vision is closer than the plans assumed**. Three findings reshape the build: **real-time sync already works** (the largest assumed engineering risk in the conversation core is mostly done — only presence is missing); **a proto-Huddle viewer is already in flight** (floating viewer, huddle avatars, arrival banner, "My huddles" dashboard — committed after all our documents); and **analytics is at absolute zero** (not "installed but unconfigured" — nothing), which makes measurement the most urgent gap for a commercial launch. Two small but consequential bugs were also surfaced: the extension's update path never resolves addressed feedback, and orphan decks silently block recipients from commenting — both of which would have corrupted Phase-0 user validation had they gone unfound.

Net effect on the plan: Phase 0 grows (analytics from scratch, two bug fixes, CI baseline), Phase 1 gets cheaper (build the feed on the floating viewer rather than from nothing), Phase 3 gets smaller (real-time largely done), and one new dependency moves earlier (a transactional email provider is needed at Phase 2 for invites, not Phase 5 for notifications). The overall scorecard: of the 18 capability areas audited, the **core loop areas (capture, viewing, collaboration, curation, versioning, MCP) are essentially complete**; the **conversation-model areas are roughly half-built** (real-time yes, feed/decisions/presence no); and the **commercial areas are at zero by verified confirmation** (workspace, billing, invites, profiles, email, export, analytics, legal). The master plan in Section 6 sequences all of it in six phases over ~24 weeks, with the business gates from the commercial plan attached to the phases they depend on.

---

## 2. Method

Each target capability from the two planning documents was checked against the inventory's evidence-cited findings. Three categories result: **corrections** (where our plans assumed wrongly — Section 3), **gaps** (target vs. today — Sections 4–5), and **new work items** the plans never contained (folded into Section 6). Where the inventory marked something Uncertain (notably whether RLS is live in production), it is treated as unverified and gated accordingly.

---

## 3. Corrections to the prior documents

What our planning documents claimed vs. what the code says — applied throughout the rest of this document:

| Prior claim (concept / business doc) | Code reality (inventory evidence) | Impact on the plan |
|---|---|---|
| "Real-time: nothing built — but Supabase Realtime is native" (sized medium-large) | Live sync of comments/stubs/flags is **built and working**, RLS-authorized (SlideViewer 247–368; useDeckComments/useDeckStubs). Only **presence** is absent | Phase 3 shrinks; presence is the only real-time build left |
| "PostHog installed but no defined events" | **No analytics of any kind — not even a pageview install** (grep: zero tracking calls) | Phase 0 must install analytics, not just define events; business doc §9 corrected |
| "No rate limiting on `/api/slides`" (security M1 open) | **Fixed**: 30/min/IP (route.ts 31–47, 111) | M1 closed; remaining limit gaps: `/api/deck-version`, OAuth endpoints; per-instance memory caveat stands |
| "Comment author email spoofable" (security M4 open) | **Fixed**: author email re-resolved from `user_id` on read (slide-store 856–869) | M4 closed; profiles still wanted for display names, no longer for security |
| "Six MCP tools" | **Eight** — `search` and `fetch` ChatGPT-connector aliases already exist | Multi-AI (ChatGPT) is partially scaffolded; Phase 6 gets cheaper |
| Guest/observer mode "confirmed absent" | **Partial**: anonymous link-viewing is a de-facto observer mode (slides + stubs, identities redacted); no *named/invited* guest concept | Phase 3 guest work = invited-guest concept on top of an existing anonymous tier |
| Feedback resolution "part of the update flow" | **Only the MCP path resolves feedback**; extension updates never call `clearAddressedFeedback` (api/slides 217–227) | New Phase-0 bug fix — would have corrupted user validation |
| Huddle model is a future build | A **proto-Huddle viewer is in flight**: floating viewer + HuddleAvatars + ArrivalBanner + arrival-activity + "My huddles" copy, behind `?view=floating` (committed 10 Jun) | Phase 1 builds *on* this, not from scratch; its gaps (mobile, zoom, flag UI, version poll) join the plan |
| Catch-up digest = future AI feature | The non-AI half exists: arrival-activity banner + `deck_views` cursor already compute "since you were here" | Digest = add the AI summary pass to an existing mechanism |
| TECHNICAL.md as reliable reference | Eleven doc-vs-code discrepancies in under a week | New working practice: regenerate docs after significant merges |

---

## 4. Gap analysis A — today's code vs. the Huddle model

| Huddle pillar | What already exists (verified) | The actual gap | Size |
|---|---|---|---|
| **The feed** (conversation as home; versions as events) | All feed *ingredients* exist: comments, stubs, flags, `deck_versions` rows with timestamps; arrival banner; floating viewer shell | A chronological feed view composing those into one stream; deck demoted to peek; versions rendered as events | **M** — read-layer over existing data |
| **Threading & message kinds** | `comments.parent_id` reserved in schema (zero references); curation columns live | Activate threading; add `kind` (message/decision/system/AI); make `slide_index` optional; render stubs/flags as feed kinds | **M** |
| **Slide quoting (anchors)** | The hard parts exist: every version's full HTML stored (`deck_versions`), comments are *version-scoped*, `element_id` reserved | Quote payload (slide+version+optional region), thumbnail card generation, quote-to-composer UX, tap-quote-to-peek navigation | **M** |
| **Decisions & owner approval** | The entire curation machinery: dismiss/edit/restore server actions, owner re-checks, `resolved_at`, prompt builder shared with MCP | Promote-to-decision, `approved_at`, the approval-queue UI, decision log view | **S–M** — a reframe of working code |
| **AI as participant** | 8 MCP tools; `update_deck` already resolves feedback and snapshots versions; shared prompt builder | `get_feedback` returns approved decisions; `update_deck` writes a system feed message + change summary; optional `post_message`; extension-path resolution fix | **S–M** |
| **Real-time & presence** | **Live data sync built** (comments/stubs/flags); version polling (current viewer only) | Presence channel ("here now"); port version-awareness to the floating viewer | **S** (was M–L before the audit) |
| **Catch-up digest** | `deck_views` cursor + arrival-activity computation + ArrivalBanner UI | The AI summary pass over unread items; extend beyond the viewer | **S–M** |
| **Profiles & identity** | Email-only identity; avatar = first letter; live-arrived items show "a teammate" | `profiles` table (display name, avatar); fixes the realtime display gap too | **S** |
| **Invites & membership** | `shared_decks` auto-membership on visit; link-only sharing | Invite-by-email (first need for an email provider), pending invites, member list | **M** |
| **Roles & guests** | `role` column written-only; anonymous viewing as de-facto observer | Enforce roles in RLS; named/invited guest (client) concept | **M** |
| **Ownership & hero moments** | Version chip, updated banner, huddle avatars | Pinned deck hero card, attribution in version events ("applied Sara's decision"), sign-off moment | **S–M** |
| **Conversation extras** | — | Reactions (one small table); comments-on-stubs; author self-edit UI (RLS already allows it) | **S each** |

**Reading:** nothing in the Huddle model requires inventing infrastructure. Every pillar is either a view over existing data, an activation of reserved schema, or a reframe of working curation/MCP machinery — except presence (small) and the quoting UX (the one genuinely new interaction build).

---

## 5. Gap analysis B — today's code vs. the commercial requirements

| Commercial requirement (business plan) | Verified state today | The actual gap | Size |
|---|---|---|---|
| **Measure anything** (activation, retention, k, channels) | **Zero instrumentation** — no install, no events | Analytics install + named event schema + channel attribution + dashboards | **S–M, urgent** |
| **Workspace to sell Studio to** | Confirmed absent (no entity, no table) | `workspaces` model: members, shared ownership, admin | **M** |
| **Billing** | Confirmed absent | Stripe Billing + Tax, entitlements (active-huddle counter, feature flags), founding-partner plan code | **M** |
| **Client/guest review** | Partial (anonymous tier exists; no named guests) | Invited-guest role with identity, on the Phase-2 role enforcement | **M** |
| **Viral loop surfaces** | One seed exists: dashboard empty-state "copy the MCP connector URL" prompt | Viewer badge, recipient post-comment CTA, claim flow as instrumented funnel, export footer, referral mechanic (post-billing) | **S, high leverage** |
| **Orphan-deck first experience** | **New finding**: recipients of unclaimed decks *cannot comment* — silently | Sign-in/claim nudge in the viewer; treat as an activation-funnel fix | **S, Phase 0** |
| **Retention reach (email)** | Confirmed absent (no mail library at all) | Provider (Resend-class) arrives at Phase 2 for invites; notification system at Phase 5 | **M then L** |
| **Export (the loop's exit)** | Confirmed absent — no PDF, no print, no download of any kind | PDF export | **M, Phase 0** |
| **Trust & legal** (ToS, privacy, GDPR, trust page) | Confirmed absent (no routes) | Pages + data export/delete + DPA template + ICO registration | **S–M** |
| **Onboarding** | Partial: one floating-viewer hint + empty state | Sample huddle, guided first round, optimised for the "next deck round" wedge | **M** |
| **Search** | MCP title-contains only; no UI, no FTS | Postgres FTS + a search box | **S** |
| **Custom branding (Studio)** | Confirmed absent (brand hardcoded) | Workspace logo/colour on viewer + exports | **S–M** |
| **Quality safety net** | One script, no framework, no CI | CI running lint + the existing E2E script; grow tests with Phase 3 | **S now** |
| **Ops config hygiene** | Hardcoded prod URLs in extension + button; `PRODUCTION` flag is a code edit | Env-driven config; needed before any second environment or contributor | **S** |
| **Security holdovers** | RLS-live-in-prod **still unverified**; no CSP; in-memory rate limits; `/api/deck-version` + OAuth unlimited; no token revocation | `verify-rls.sql` (blocker, Phase 0); CSP baseline; extend limits; revocation stays a documented trade-off | **S each** |

---

## 6. The master sequenced plan

Six phases, ~24 weeks, product and business workstreams merged. Sizes: S (≤ a few days of CC work), M (1–2 weeks), L (2–4 weeks). Every phase ends at a gate tied to the validation plan's assumptions; nothing expensive is built before its assumption has a test. Items marked **NEW** were in no prior plan — they come from the audit.

### Phase 0 — Truth, safety, measurement (weeks 1–3)

The rule for this phase: make the current loop *completable, measurable, and honest* before showing it to anyone.

1. **Run `verify-rls.sql` in production** (S, blocker). The #1 unverified item; everything browser-written and realtime-synced leans on it. If any table comes back RLS-off, that is a drop-everything fix.
2. **Analytics from zero** (S–M, **NEW** severity). Install PostHog (or equivalent), define the named event schema — deck_created, deck_shared, viewer_opened (with referrer/claim attribution), comment_added, stub_added, flag_added, curation_action, send_to_claude, version_published (per path), export_completed — plus the activation and second-huddle derived metrics and channel attribution. Dashboards for the §7 metrics of the business plan.
3. **Fix the extension-path resolution bug** (S, **NEW**): `/api/slides?update=` must call `clearAddressedFeedback` exactly as MCP `update_deck` does. Without it, Phase-0 testers re-work addressed feedback and the validation reads falsely negative.
4. **Fix the orphan-deck comment dead-end** (S, **NEW**): recipients of unclaimed decks get a clear "sign in to comment — ask the deck's creator to claim it" state instead of a silent block; instrument it as a funnel step.
5. **PDF export** (M). The loop's exit; unchanged priority, now verified as truly absent (no print path at all).
6. **CI baseline** (S, **NEW**): lint + `test-loop.mjs` on every push to main. The cheapest insurance available before the Q2 build.
7. **Business track:** trademark searches (UK IPO + USPTO, the Slack-Huddles question) and the name go/no-go; incorporate the UK Ltd; Stripe account; ICO registration.
8. **Real-user test of the current loop** with 2–3 outsiders, now that it's measurable and the two bugs are fixed.

*Gate: loop completable end-to-end including export; events flowing; RLS verified; name decided; first outside users observed.*

### Phase 1 — The feed, on the floating viewer (weeks 3–6)

The audit's gift: the concept test builds on the in-flight floating viewer rather than from scratch.

1. **Finish the floating viewer's known gaps** (M, **NEW** as explicit items): version polling/awareness, flag-creation UI, a mobile layout pass; remove or implement the inert zoom.
2. **The read-only feed view** (M): one chronological stream composing comments + stubs + flags + version events, with the deck as peek/"Open deck"; ship behind the existing flag, default it on for design partners.
3. **Viral loop v0** (S): viewer badge, recipient post-comment CTA ("start your own huddle"), claim flow instrumented as a funnel, "Reviewed on SlideHuddle" export footer option.
4. **Business track:** design-partner recruitment begins (the §6.1 motion from the business plan — UK communities, LinkedIn filter, 15–20 contacts/week), demoing on the feed build as it lands.

*Gate (assumption 1): partners run real review rounds and at least half their feedback arrives in-product by round 2; testers prefer or equal the feed as landing view.*

### Phase 2 — Identity, membership, money (weeks 6–10)

1. **Profiles** (S): display names + avatars, resolved server-side; also fixes the realtime "a teammate" display gap.
2. **Email provider + invites** (M): Resend-class transactional setup (**NEW dependency timing** — needed here for invites, not Phase 5); invite-by-email with pending invites; member list.
3. **Role enforcement + named guests** (M): enforce `shared_decks.role` in RLS at last; add the invited-guest (client) value on top of the existing anonymous tier.
4. **Workspaces** (M): the entity Studio is sold to — members, shared deck ownership, admin.
5. **Billing & entitlements** (M): Stripe Billing + Tax; active-huddle counter and feature flags; Free/Pro/Studio/Founding-partner plans wired.
6. **Trust & legal** (S–M): ToS, privacy, security/trust page, data export/delete, DPA template.

*Gate (assumption 2): ≥5 founding partners committed with a card; a team of 3+ named people assembled by invitation; first charge processed.*

### Phase 3 — Conversation core (weeks 10–16)

The big build — now smaller than planned because real-time sync already exists.

1. **Messages evolution** (M): `kind` column, optional `slide_index`, activate `parent_id` threading; stubs/flags rendered as feed kinds.
2. **Slide quoting** (M): version-pinned quote payload (using `deck_versions` snapshots + the reserved `element_id` for element anchors), thumbnail cards, quote-from-slide and quote-from-composer gestures, tap-quote-to-peek.
3. **Decisions** (S–M): promote-to-decision, `approved_at`, owner approval queue (reusing the curation server actions), the decision log.
4. **Presence** (S): the one remaining real-time piece — "here now" channel for the huddle avatars.
5. **Conversation completeness** (S each): reactions; comments-on-stubs; author self-edit UI.
6. **Client guest mode live** with 2 partner agencies' real clients.

*Gates (assumptions 3–4): ≥40% of partner teams start a second huddle within 30 days unprompted; a partner's real client completes a round without hand-holding.*

### Phase 4 — AI as participant (weeks 14–18, overlapping)

1. `get_feedback` returns **approved decisions with thread context** (same shared prompt builder) (S).
2. `update_deck` posts a **system feed message** with an AI change summary and resolves the decisions it consumed (S).
3. **Catch-up digest** (S–M): AI summary pass on the existing arrival-activity mechanism.
4. Optional `post_message` tool; **OAuth-focused security re-review** of the changed tool surface (standing requirement).

*Gate: a full AI revision round is legible in the feed without opening the deck.*

### Phase 5 — Reach, polish, launch (weeks 18–24)

1. **Notification system** (L): mentions, decision alerts, version posts, daily digest — on the Phase-2 email plumbing.
2. **Onboarding** (M): sample huddle + guided first round, optimised for the "next client deck" wedge.
3. **Search** (S): Postgres FTS over messages/decisions + UI.
4. **Status / deadline / sign-off** (S) and **Studio branding + client-facing decision log** (S–M).
5. **Launch wave (business):** Product Hunt / Show HN, MCP directory listing, Chrome Web Store refresh, first comparison pages — per the channel playbook.

*Gate: activation ≥30%, k measured, free→paid trending toward 4%+; most participation arriving via notification rather than unprompted visits.*

### Phase 6 — Post-validation bets (unchanged, re-costed)

Slack/Teams bridge → Claude-posted variants with voting → live huddle mode → mobile push → **multi-AI via the existing ChatGPT-connector aliases** (cheaper than planned — `search`/`fetch` already exist) → client decision-log distribution → the docs/content expansion as the prepared pivot if agency cadence disappoints.

---

## 7. Critical path and dependencies

The chains that order everything: **verify-RLS → all realtime/browser-write trust**; **analytics → design partners** (never put users into an unmeasured product); **profiles → invites → workspaces → billing → Studio revenue**; **email provider (Phase 2) → notifications (Phase 5)**; **feed (Phase 1) → messages/decisions (Phase 3) → AI-participant (Phase 4)**. The two genuinely large items on the path are the conversation core (Phase 3) and the notification system (Phase 5); everything else is S/M. Solo-founder throughput is the binding constraint — the business workstream is deliberately confined to motions that double as testing (design partners) until Phase 5's launch wave.

## 8. Standing corrections and practices

1. Apply the Section-3 corrections to the concept and business documents (this document supersedes their phase plans; their strategy sections stand).
2. **Docs regeneration habit**: after each phase gate, re-run the inventory prompt (cheap, now written) and refresh TECHNICAL.md — the audit showed one week of drift produces eleven discrepancies.
3. Track the five Uncertain items from the inventory as an ops checklist: RLS-live (Phase 0), applied-migrations record, Supabase auth config, Vercel env audit, extension distribution channel.

---

*End of document. Supersedes: the phase plan in "SlideHuddle: The Huddle Model" §8 and the integrated plan in the Business Model document §11. Source of truth for current state: FEATURE-INVENTORY.md (12 June 2026, commit 41041ac).*
