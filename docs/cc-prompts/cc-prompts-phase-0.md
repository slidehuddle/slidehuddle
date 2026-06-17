# Claude Code — Phase 0 Prompt Pack
## "Truth, safety, measurement" — make the current loop completable, measurable, and honest before showing it to anyone

*Lives in the repo alongside the other planning docs. Source of the plan: `slidehuddle-gap-analysis-plan.md` (the Gap Analysis & Master Build Plan), Phase 0. Current-state truth: `FEATURE-INVENTORY.md`. Tracker: `PROGRESS-TRACKER.md`.*

---

## How to use this pack

1. **Paste the Kickoff once** at the start of your first Phase 0 session. It orients CC and asks it to confirm the plan before building.
2. **Then paste one Session prompt per working session**, in the recommended order below. Each is self-contained — CC re-reads the tracker and the relevant code each time.
3. **Each session ends by updating the tracker.** That's built into every prompt.
4. Prompts in `code blocks` are what you paste. Text outside them is for you.

### Recommended order (and why)

| Order | Item | Why here | Who runs it |
|---|---|---|---|
| 1 | **Kickoff** | Orient CC, confirm the plan, initialise the tracker | CC + you |
| 2 | **P0.1 — Verify RLS is live** | Blocker; everything else leans on it; mostly you-run, so start it early | CC prepares · **you run the SQL** |
| 3 | **P0.6 — CI baseline** | Protects every change that comes after it | CC + you (GitHub) |
| 4 | **P0.2 — Analytics from zero** | Foundational; everything should emit events; needed before user testing | CC + you (PostHog account) |
| 5 | **P0.3 — Extension resolution bug** | Quick fix; would corrupt user-test results if left | CC |
| 6 | **P0.4 — Orphan-deck nudge** | Quick fix; protects the first-time viewer experience | CC |
| 7 | **P0.5 — PDF export** | The big one; do it when everything else is stable | CC |

P0.3 and P0.4 are both small and both touch the feedback/comment lifecycle — you can run them back-to-back in one session if you prefer.

**Founder-only tasks, in parallel (not CC):** P0.7 trademark searches (UK IPO + USPTO) and the name decision; P0.8 incorporate the UK Ltd, set up Stripe, register with the ICO; P0.9 the real-user test — do this **after** P0.2–P0.5 are in.

---

## KICKOFF — paste once at the start

```
You're helping me build SlideHuddle. Important context about how we'll work together:

I'm a NON-TECHNICAL founder. So, every session:
- Explain your plan in plain English BEFORE you build anything, and wait for my go-ahead.
- Build incrementally, in small steps I can follow. Don't break existing functionality.
- When you finish, tell me EXACTLY how to test what you built — step by step, assuming I don't know the codebase (e.g. "open this URL, click X, you should see Y").
- If you hit a choice (a library, an approach), show me the options with a clear recommendation and your reasoning, and let me pick. I may reply with a screenshot.

Reference documents (please read before planning):
- PROGRESS-TRACKER.md — where we are. Read it at the START and update it at the END of every session, following the instructions embedded at the top of that file.
- slidehuddle-gap-analysis-plan.md (the Gap Analysis & Master Build Plan) — the phased plan we're executing. We are on PHASE 0.
- FEATURE-INVENTORY.md — the verified current state of the code. TRUST THE CODE OVER TECHNICAL.md: a recent audit found TECHNICAL.md had drifted from reality, so if a doc and the code disagree, the code wins, and tell me about the discrepancy.
- slidehuddle-design-system.md (the Brand & Product Design System, "Floating Canvas") — this describes a UI redesign that is scheduled for PHASE 1 (item P1.1), NOT Phase 0. For Phase 0, build any UI to match the app's CURRENT styling so it stays consistent with what's already there. Do not introduce the Floating Canvas redesign during Phase 0. (If this document isn't in the repo yet, that's fine — you won't need it until Phase 1.)

Safety rule for every session: if your work touches authentication, Row Level Security, the service-role key, or the MCP tool surface, tell me explicitly what you changed and what you verified — in plain English.

For THIS first session, don't build anything yet. Please:
1. Read the tracker and confirm you understand the Phase 0 items (P0.1–P0.6) and that I (not you) own P0.7–P0.9.
2. Confirm you can see the codebase structure and tell me, in 3–4 sentences, your understanding of how the app fits together (web app, extension, MCP, database) so I know we're aligned.
3. Tell me which Phase 0 item you'd recommend starting with and why.
Then stop and wait for me.
```

---

## P0.1 — Verify Row Level Security is actually live in production

*The security review could not confirm from code that RLS is switched ON in your live database (migrations are applied by hand). This is the #1 unverified risk, and everything browser-written and live-synced depends on it. CC prepares and explains; **you run the SQL** in the Supabase SQL editor and paste the results back.*

```
Phase 0, item P0.1 — verify RLS is live. Working rules from the kickoff apply (plan first, plain English, tell me how to test).

Background: our database migrations are applied by hand, so we've never confirmed that Row Level Security is actually switched ON in production. A script docs/verify-rls.sql is supposed to exist for this.

Please:
1. Open docs/verify-rls.sql. Check that it verifies ALL of these for EVERY one of our 7 tables (decks, deck_versions, shared_decks, deck_views, comments, slide_stubs, slide_flags):
   (a) RLS is ENABLED on the table,
   (b) the expected policies exist,
   (c) NO policy is granted to the anon (logged-out) role.
   If the script is missing any of those checks, or any table, improve it so it's complete. If the file doesn't exist, create it.
2. Write me a plain-English "how to read the results" guide: for each thing the script outputs, tell me what a GOOD result looks like and what a BAD result looks like. Make it crystal clear which result means "STOP — this is critical, tell Claude immediately" (e.g. any table with RLS OFF, or any access granted to anon).
3. Give me step-by-step instructions to run it in the Supabase SQL editor (I'm non-technical — tell me where to click).

This is a verification task — don't change any application code. When done, update the tracker: P0.1 stays "in progress" until I run the script and confirm the results (only I can mark the gate). Tell me to paste the results back to you.
```

---

## P0.6 — CI baseline (do this before the bigger changes)

*No tests, no CI today — one handwritten script is the whole safety net, and you push straight to `main`. A minimal CI gate protects everything built after it.*

```
Phase 0, item P0.6 — a minimal CI safety net. Working rules from the kickoff apply.

Background: we have no continuous integration. We push to main and Vercel deploys. There's a script (scripts/test-loop.mjs or similar — please find it) that tests the core loop. As a non-technical solo founder I want a basic automated check so I don't accidentally ship something broken, especially before the bigger Phase 0 changes.

Please:
1. First tell me, in plain English, what automated checks we CAN run cheaply: at minimum lint and TypeScript type-checking (these need no database). Then check whether the existing test script can run in CI safely — does it need secrets or a live database? If it needs production credentials, do NOT wire those in; instead tell me what a safe option is (e.g. run it only against a test environment later, or skip it in CI for now and keep lint+typecheck).
2. Recommend the approach and wait for my go-ahead.
3. Set up GitHub Actions to run the safe checks on every push to main and on pull requests. Keep it minimal and GREEN — we are NOT building a big test suite now (that grows later in Phase 3).
4. Tell me how to confirm it works: how to see the check run in GitHub, and how I'd know it would catch a real error (e.g. describe introducing a deliberate type error locally).

Note if you change any config files. Update the tracker (P0.6) at the end with what you set up and how it's verified.
```

---

## P0.2 — Analytics from zero

*The audit found **no analytics of any kind** — not even a pageview install — despite PostHog being in the original plan. Until this exists you cannot answer "did anyone use it?", and the real-user test (P0.9) needs it. We're a UK/EU company, so this must be GDPR-aware from the first line.*

```
Phase 0, item P0.2 — install analytics from scratch and define our event schema. Working rules from the kickoff apply. This touches how we identify signed-in users, so flag anything privacy-relevant.

Background: a code audit found we currently have NO analytics installed at all. We need product analytics so we can measure activation and retention. We are a UK-based company serving the UK/EU, so this must be GDPR-aware from the start (cookieless or consented; person-profiles only for signed-in users; anonymous viewers must not be personally tracked).

Step 1 — recommend the tool. My prior intent was PostHog. Please recommend a setup (I expect PostHog with EU hosting for GDPR reasons) and explain why, with one alternative. Wait for my go-ahead. I'll create the account and give you the project key.

Step 2 — once I approve, install it in the Next.js web app, configured GDPR-safely (explain the privacy choices you made in plain English).

Step 3 — implement these named events at the right points in the code (use these exact names so they stay stable even as UI labels change):
- deck_created
- deck_shared
- viewer_opened  (capture the referrer/UTM and whether the opener arrived via capture vs a shared link — this is for our viral-loop measurement)
- comment_added
- stub_added  (a requested slide)
- flag_added  (a removal flag)
- curation_action  (owner edit/dismiss/restore; include which kind)
- feedback_sent_to_ai  (this is the current "Send to Claude" action)
- version_published  (include which path: extension vs MCP)
- export_completed  (we'll add the export itself in P0.5; wire the event now if easy, or note it as a hook for P0.5)
Tell me, for each event, exactly where it fires.

Step 4 — explain how I'll read our two key metrics in the PostHog dashboard:
- Activation = an owner completes their first review round (feedback → owner action → a new version) with at least 2 other participants, within 7 days of creating their first deck.
- Second-huddle retention = a team starts a second huddle within 30 days.
Set up the events so these are computable, and describe the dashboard/funnel I should create (I'll build the dashboard following your instructions).

Don't over-track — only the events above for now. Update the tracker (P0.2) at the end. Also tick the relevant line in the tracker's "Key metrics" note once events are flowing.
```

---

## P0.3 — Fix: revising via the extension must resolve addressed feedback

*Audit finding: only the MCP `update_deck` path calls `clearAddressedFeedback`. Revising via the Chrome extension (`/api/slides?update=…`) does **not**, so addressed stubs/flags resurface and get re-worked — the exact bug the brief thought was solved. Your Phase-0 testers will mostly use the extension, so they'll hit it.*

```
Phase 0, item P0.3 — fix a feedback-resolution bug. Working rules apply. This touches our core file (slide-store) — be careful not to break the MCP path.

The bug (from a code audit): when a deck is revised through the MCP server (update_deck), the feedback that was addressed gets marked resolved (via a function called clearAddressedFeedback). But when a deck is revised through the Chrome extension (the /api/slides endpoint with an ?update= parameter, around lines 217–227 of that route), this does NOT happen — so addressed comments/requested-slides/removal-flags reappear on the next round and get re-worked. Please verify this is true in the code first, then fix it.

One thing to think through and explain to me before coding: when someone revises via the extension, the system doesn't automatically know WHICH feedback was incorporated (unlike the MCP path). So tell me the options for what "resolve" should mean here — for example, resolving the feedback that was in the last "Send to Claude" batch for this deck, versus resolving all open feedback on the previous version when a new version lands. Recommend the cleanest option that matches how the MCP path behaves, and wait for my go-ahead.

Then:
1. Implement it by REUSING the same resolution logic as the MCP path (don't duplicate it).
2. Confirm the MCP path still works exactly as before.
3. Tell me how to test: create a deck, add a comment/request/flag, revise the deck via the extension, and confirm the addressed feedback does NOT resurface — step by step.

Flag this as a slide-store change in your tracker entry (P0.3).
```

---

## P0.4 — Fix: orphan-deck recipients hit a silent comment dead-end

*Audit finding: a deck captured while signed out has no owner (`user_id` NULL). It's viewable by link, but recipients **cannot comment** — comment permissions require the deck to be owned/shared, so it silently fails until someone claims the deck. This quietly breaks the first experience of the viral loop.*

```
Phase 0, item P0.4 — fix the orphan-deck comment dead-end. Working rules apply. This is about permissions/UX, so flag anything auth-related.

The problem (from a code audit): when someone captures a deck while NOT signed in, the deck has no owner. Anyone with the link can VIEW it, but no one can COMMENT on it — the comment permission requires the deck to be owned or shared, and an unowned deck satisfies neither. Right now this fails silently: a recipient just can't comment and isn't told why.

Important: do NOT remove the "capture works without signing in" behaviour — that's an intentional design choice. The fix is to make the situation clear and recoverable, not to force sign-up at capture.

Please:
1. Verify the behaviour in the code.
2. Tell me your plan, then build it: when someone tries to comment on an unclaimed deck, show a clear, friendly state instead of silence — explaining that comments unlock once the deck's creator signs in and claims it. If the person viewing IS the creator (arrived via capture), nudge them to sign in and claim so collaboration unlocks. STYLING: match the app's CURRENT styling — do NOT introduce the new "Floating Canvas" design here. The visual redesign is a separate later task (Phase 1, item P1.1); for now this state should look consistent with the existing UI around it. Keep the copy plain and non-apologetic.
3. Add analytics events for this funnel (these matter for activation): orphan_deck_viewed, claim_prompt_shown, deck_claimed. (Use the P0.2 analytics setup.)
4. Tell me how to test: capture a deck while signed out, open it as a different person, and confirm you see a helpful explanation rather than a dead end — step by step.

Update the tracker (P0.4) at the end.
```

---

## P0.5 — PDF export (the loop's exit — and a competitive necessity)

*No export of any kind exists today. This completes the loop AND, per the voice-of-user research, is a competitive wedge: "the PowerPoint/PDF export is broken" is the single loudest complaint about AI deck tools. So the quality bar is faithful rendering, not a degraded screenshot. This is the M-sized item and may take more than one session.*

```
Phase 0, item P0.5 — add PDF export. Working rules apply. This is the biggest Phase 0 item, so plan it in stages and check in with me between them.

Background and the quality bar: we have no export at all today, and export is how a finished deck leaves SlideHuddle. Critically, user research shows the #1 complaint about AI deck tools is that their export DEGRADES the deck (fonts change, layouts break, it's a fuzzy screenshot). Our whole pitch includes "faithful rendering," so our PDF must look like the real deck: correct fonts (Plus Jakarta Sans), correct layout, one slide per page, crisp — not a low-quality image. Our slides are HTML rendered in a sandboxed iframe, so the export should render that same HTML.

Step 1 — recommend the approach and the trade-off, then wait for me. I expect the realistic options are: (a) render the HTML to PDF with a headless browser running inside our Vercel functions (e.g. Playwright/Puppeteer with a serverless-compatible Chromium build) — cheap, fits our "keep costs near zero" principle, but watch cold-starts and bundle size; or (b) a hosted rendering API — more reliable but a paid dependency. Recommend one (I lean cheap unless quality suffers) and explain in plain English.

Step 2 — build it in stages, showing me a test PDF after each:
  a. Render a single slide to a correct-looking PDF page (fonts embedded, right aspect ratio).
  b. Render the whole deck, one slide per page, in order (including requested-slide/stub pages if they're part of the deck view).
  c. Add a "Download PDF"/export action in the viewer. STYLING: match the app's CURRENT viewer styling — do NOT introduce the new "Floating Canvas" design here (that redesign is a separate later task, Phase 1 / P1.1). Place the export control wherever it sits naturally given the current UI (e.g. near the existing Share/Send action).
  d. Decide with me who can export (at least the owner; likely signed-in collaborators too) and confirm it's enforced server-side, not just hidden in the UI.
  e. Include a subtle "Made on SlideHuddle" footer on the exported PDF, with a flag so we can switch it off for paid plans later (this supports our viral loop).

Step 3 — fire the export_completed analytics event (from P0.2).

Step 4 — tell me how to test: open a multi-slide deck, export, and confirm the PDF matches what's on screen — fonts, layout, one slide per page — and opens normally in a standard PDF reader. Compare it visually to the deck and tell me what to look for.

Flag anything that touches permissions. Update the tracker (P0.5) — it may stay "in progress" across more than one session; log each stage in the session log.
```

---

## After Phase 0 build items are done

Once P0.1–P0.6 are complete and your parallel admin tasks (P0.7–P0.8) are in motion, run **P0.9 — the real-user test**: get 2–3 people outside the company to run the whole loop end to end now that it's measurable (analytics live), completable (export works), and the two bugs are fixed. Watch where they get stuck — that directly shapes Phase 1. Only you can mark **Gate G0** passed.

When you're ready for Phase 1, ask me to generate the Phase 1 prompt pack — it builds the read-only feed on your floating viewer and the viral-loop v0, using slidehuddle-design-system.md as the reference.
```
