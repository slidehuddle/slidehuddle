# Claude Code — Phase 1 Prompt Pack
## "The feed, on the floating viewer" — the cheap concept test for conversation-first

*Source of the plan: `slidehuddle-gap-analysis-plan.md` (Phase 1). Current-state truth: `FEATURE-INVENTORY.md`. Tracker: `PROGRESS-TRACKER.md`. Design reference (now load-bearing): `slidehuddle-design-system.md` + the visual mockups `slidehuddle-mockups-v2.html`.*

---

## Before you start — commit two files to the repo

Phase 1 is the first phase that **needs the design**, so put these in the repo before the first session (CC can only read what's in the repo):

- **`slidehuddle-design-system.md`** — the rules and tokens for the Floating Canvas redesign.
- **`slidehuddle-mockups-v2.html`** — the visual target. Open it in a browser yourself first; it shows the five screens CC is building toward.

Keep the filenames exactly as above. The prompts reference these names.

## What Phase 1 is (and the one big change from Phase 0)

Phase 0 was about *function*; **Phase 1 is where the look changes.** This is the deliberate visual shift to the Floating Canvas design — so here you DO want CC using `slidehuddle-design-system.md` and the mockups, the opposite of the Phase 0 instruction.

The goal of the whole phase is a **cheap validation test**: get the conversation-first experience in front of design partners and see if it resonates — *before* the expensive conversation-core build in Phase 3. So the feed in this phase is deliberately **read-only** (it composes data you already have; it does NOT build the messages/decisions/quoting machinery — that's Phase 3).

### Recommended order

| Order | Item | Why here | Who |
|---|---|---|---|
| 1 | **Kickoff** | Re-orient CC to Phase 1 and the design shift | CC + you |
| 2 | **P1.1 — Floating viewer redesign + completion** | The visual foundation everything else sits on | CC (multi-session) |
| 3 | **P1.2 — Read-only feed** | The actual concept test, in the new language | CC |
| 4 | **P1.3 — Viral loop v0** | Small; builds on P0.2 analytics + P0.4 claim flow | CC |

**Founder-only, in parallel:** **P1.4** — design-partner recruitment (the motion in `slidehuddle-business-model.md` §6.1: UK agency communities, the LinkedIn filter, ~15–20 contacts/week), demoing on the feed as it lands. Only you can mark **Gate G1**.

---

## KICKOFF — paste once at the start of Phase 1

```
We're moving from Phase 0 to PHASE 1 of the plan. The working rules from before still apply (I'm non-technical; plan first in plain English and wait for my go-ahead; build incrementally; don't break what works; tell me exactly how to test; surface choices with a recommendation; flag anything touching auth/RLS/the service-role key/the MCP surface).

Reference documents (please read the ones relevant to each task):
- PROGRESS-TRACKER.md — read at the START, update at the END of every session, per its embedded instructions. We are now on PHASE 1.
- slidehuddle-gap-analysis-plan.md — the plan. Phase 1 is "the feed, on the floating viewer."
- FEATURE-INVENTORY.md — the verified current state. Still trust the code over TECHNICAL.md.
- slidehuddle-design-system.md — the "Floating Canvas" design system. IMPORTANT: unlike Phase 0, Phase 1 IS where we adopt this redesign. Use it.
- slidehuddle-mockups-v2.html — the visual target for the redesign (open-able in a browser). Treat it as the picture of where we're going.

Two framing notes so we stay aligned:
1. Phase 1's PURPOSE is a cheap validation test of the conversation-first idea with real users — not a full build. The "feed" we build here is READ-ONLY: it shows data we already have in a new way. We are NOT building the full conversation system (messages, threads, slide-quoting, decisions, real-time) — that is Phase 3. If you find yourself wanting to build those, stop and tell me; it's out of scope for Phase 1.
2. There is already a partial "floating viewer" in the code behind a ?view=floating flag. Phase 1 builds ON that, not from scratch.

For THIS first session, don't build anything yet. Please:
1. Read the tracker and the design system, and look at the floating viewer that already exists in the code (the ?view=floating one).
2. Tell me, in plain English: what the existing floating viewer already does, and how it differs from the Floating Canvas design in slidehuddle-design-system.md (especially §10, the punch list).
3. Tell me your recommended plan for P1.1 (the redesign + completion), broken into stages, noting where you'll want me to look at a screenshot and approve before you roll a change out widely.
Then stop and wait for me.
```

---

## P1.1 — Floating viewer: redesign + completion

*The existing `?view=floating` viewer becomes the real Floating Canvas experience. This bundles the design-review punch list (`slidehuddle-design-system.md` §10) with the functional gaps the audit found. It's the M-sized item and will span several sessions — that's expected.*

```
Phase 1, item P1.1 — turn the existing floating viewer into the real Floating Canvas experience, and fix its functional gaps. Working rules apply. This is a multi-session item; log each stage in the tracker session log.

Use slidehuddle-design-system.md for the rules/tokens and slidehuddle-mockups-v2.html as the visual target. Build in these stages, and STOP for my approval where noted — I want to see screenshots before a change rolls out widely.

REUSE — important: build on what already exists, don't rewrite it.
- The existing ?view=floating viewer already has real, working pieces (the floating shell, the huddle avatars, the arrival/activity banner, presence scaffolding). REUSE and EXTEND these components and their styles wherever you can, rather than rebuilding from scratch — that's how we keep Phase 1 cheap and avoid regressions. Where you must change something, prefer adapting the existing component over replacing it.
- slidehuddle-mockups-v2.html is a VISUAL REFERENCE ONLY — it shows how things should look. It is hand-built illustration markup, NOT production code. Do NOT copy its HTML/CSS into the app; translate the look into our real React/Next.js components and existing styling approach. If you're unsure whether something exists already or needs building, tell me before rebuilding.

STAGE A — plan. Confirm your understanding of the existing ?view=floating viewer and map each item below to what you'll change. Show me the plan; wait for go-ahead.

STAGE B — the deck viewer redesign (the core screen). Apply the Floating Canvas design to the deck viewer:
  - THE MUST-FIX (design system §3.3, §10.1): panels/rails must INSET the slide, never cover it. When the thumbnail rail and a side panel are open, the whole slide — including its corners — must still be fully visible, scaled into the remaining space. This is the acceptance test: open the rail AND a panel together, confirm nothing covers the slide.
  - Apply the ACTION-CLUSTER spec from slidehuddle-design-system.md §5 (the Send to AI / Comments / Share hierarchy and their colours) EXACTLY as written there — do not assume a colour from memory; the design system was updated specifically for this and is authoritative. (Note: the button may currently say "Send to Claude" — keep the current label for now; the rename to "Send to AI" is a later phase.)
  - Persistence policy (§4.1): the thumbnail rail collapses to a thin "sliver" showing comment-count dots (so the team's activity never fully disappears); the slide counter is always visible.
  - Floating pills/panels over a full-bleed content layer, per the design system and mockups.
  Then STOP and show me a screenshot of the redesigned deck viewer for approval before going further.

STAGE C — functional gaps the audit flagged in the floating viewer:
  - Version awareness: the floating viewer should notice when a deck has been revised (the non-floating viewer already polls for this — reuse that logic) and prompt a refresh.
  - Flag-creation UI: the floating viewer is missing a way to flag a slide for removal — add it (the data/action already exists; it needs the UI).
  - Zoom: there's an inert zoom control — either make it work or remove it. Recommend which and why.

STAGE D — the recipient (client) view:
  - Fix the layering glitch where the deck title renders behind/through the brand pill (design system §10.3).
  - Use the guest copy "3 reviewing" (not "Huddlers") on this client-facing surface (§10.6).
  - Apply the same inset rule and Floating Canvas styling.

STAGE E — mobile: floating panels become bottom sheets on a narrow screen (§6, §10.7). Show me a screenshot on a phone-width viewport.

STAGE F — make it the default for our test group, safely: keep the old viewer available as a fallback, but ensure design partners land on the new Floating Canvas experience by default. Recommend the lightest way to do this (a flag, a per-account setting, or similar) and how I switch a given account onto it.

After each stage, tell me how to see/test the result. Flag anything touching permissions or the recipient view's access. Update the tracker (P1.1) after each session with the stage(s) completed and evidence.
```

---

## P1.2 — Read-only feed (the concept test)

*The actual test of conversation-first: land in a chronological feed instead of the deck. Deliberately read-only — it composes existing data (versions, comments, stubs, flags) into one stream. The full conversation system is Phase 3; do not build it here.*

```
Phase 1, item P1.2 — build a READ-ONLY conversation feed as an alternative landing view for a deck. Working rules apply. Use the Floating Canvas language from P1.1 and slidehuddle-design-system.md (the "Huddle feed" surface in slidehuddle-mockups-v2.html is the visual target). REUSE the Floating Canvas components and styles you built/adapted in P1.1 (panels, pills, avatars, etc.) rather than making new ones; the mockups are a visual reference only — don't copy their markup into the app.

SCOPE — read this carefully, it's the most important part:
- DO build: a single chronological stream for a deck that composes data WE ALREADY HAVE — deck version events (e.g. "v2 shared — 12 slides"), comments, requested slides (stubs), and removal flags — newest-relevant ordering, with the deck demoted to a "peek"/"Open deck" panel rather than being the main view.
- DO NOT build (this is Phase 3, explicitly out of scope now): a new messages/threads table, threading via parent_id, slide-quoting, decisions / promote-to-decision, a message composer inside the feed, or real-time presence. If any of these seem necessary, stop and ask me.
- How people still participate in Phase 1: they READ the conversation in the feed, and to ADD a comment/request/flag they open the deck (the peek / "Open deck") and use the EXISTING controls there; their new comment then shows up in the feed. The feed itself is read-only for now. (If a tiny "jump to deck to comment" shortcut is trivial, fine — but no new composer.)

Also:
- Make it flag-gated and default it ON for our design-partner accounts (reuse whatever mechanism P1.1 Stage F established). Everyone else keeps the deck view as their landing.
- INSTRUMENT BOTH the feed view and the deck view with the analytics from Phase 0 (P0.2), so I can measure which one partners actually use and whether feedback volume goes up — this is the evidence for the Phase 1 gate.

Tell me your plan first. Then build it, and tell me how to test: open a deck with some existing comments/stubs/flags as a partner account, confirm I land in a readable feed with the deck as a peek, and confirm I can still get into the deck to comment. Update the tracker (P1.2) at the end.
```

---

## P1.3 — Viral loop v0

*Small, high-leverage, and it builds on work already done: the P0.4 claim flow and the P0.2 analytics. (The referral mechanic from the plan needs billing, so it's deferred to Phase 2 — not here.)*

```
Phase 1, item P1.3 — the first version of our viral loop. Working rules apply. Floating Canvas styling (P1.1 / slidehuddle-design-system.md).

The loop: every shared deck is seen by several people who are often deck-makers themselves; some should become owners. Build these, reusing existing work where it overlaps:
1. A tasteful "Made on SlideHuddle" badge on the free/shared viewer (in-app). (P0.5 added an export footer; this is the in-app viewer version. Keep it subtle, per the design system.)
2. A recipient moment: after someone leaves their first comment as a recipient, show a light, non-pushy prompt inviting them to start their own huddle ("Made with your AI? Start your own huddle"). Match the design system; don't nag.
3. Treat the claim flow as an instrumented funnel — EXTEND the events P0.4 already added (orphan_deck_viewed, claim_prompt_shown, deck_claimed); don't duplicate them. Add whatever's needed so I can see recipient → new-owner conversion.
4. Set up the events so I can compute our viral coefficient (k = new owners attributable to recipient exposure ÷ active owners). Tell me how to read it in PostHog.

NOT in scope now: a referral reward mechanic (give-a-month/get-a-month) — that needs billing, which is Phase 2. Note it as a follow-up, don't build it.

Plan first, then build, then tell me how to test each piece and how I'll see the funnel in analytics. Update the tracker (P1.3) at the end.
```

---

## After the Phase 1 build items

With P1.1–P1.3 in, the phase is about **learning, not building**:

- Run **P1.4** (yours): get design partners actually using it — real decks, real review rounds — using the recruitment motion in `slidehuddle-business-model.md` §6.1.
- Watch the analytics from P0.2/P1.2: do partners prefer (or at least equally use) the feed as the landing view, and does feedback arrive in-product rather than in Slack/email?
- **Gate G1 / Assumption 1** (only you can mark it): ≥half of partner feedback arrives in-product by round 2, and the feed holds up as a landing experience. If it falls flat, the concept stops here cheaply — which is exactly the point of doing it before Phase 3.

When you're ready, ask me to generate the **Phase 2 prompt pack** — identity, invites, workspaces, and billing (the sellable core). It references the same real filenames and will need an email provider and Stripe, as flagged in the plan.
```
