# SlideHuddle — G1 Measurement Spec

*Defines the named events, the cohort, the funnels, the dashboard, and the partner
debrief that together answer Gate G1. Written to be set up **before** the first
partner lands, so the data is clean from round one. Pairs with PROGRESS-TRACKER
(P0.2 analytics, P1.2 feed, Gate G1). June 2026.*

---

## 1. What G1 actually asks

Gate G1 has **two separate claims**. Keep them separate — they're proved differently.

- **Claim 1 — the loop works.** By round 2, **≥ half of partner feedback arrives in-product** (comments / requested slides / removal flags inside SlideHuddle) rather than reaching the owner some other way.
- **Claim 2 — the feed earns its place.** When a partner lands on a huddle, **the feed is preferred or equal** to the deck as the place to catch up.

---

## 2. The measurement reality (read this first)

1. **The "≥ half" proportion is partly unobservable.** PostHog sees in-product feedback; it is blind to feedback that reaches you via Slack, email, a call, or a screenshot. So the *proportion* cannot be computed from events alone — its denominator lives partly outside the product. The proportion comes from the **partner debrief (§7)**; the events **corroborate** the in-product half and tell you *where* it happened.
2. **N is tiny (2–3 partners).** These are **directional** signals, not statistics. The debrief and your own observation carry the weight; the dashboard exists to keep them honest and to keep working as N grows. Don't over-read a funnel built on five sessions.
3. **Set it up before partners arrive.** The point of doing this now is that round 1 is captured cleanly — not reconstructed afterward from memory.
4. **The classic viewer (`?view=classic`) is analytics-blind — by decision.** The G1 events (`feedback_added` especially) fire only from the **floating viewer** (via its `useDeckComments` / `useDeckStubs` / `useDeckFlags` hooks) and the **feed**. The classic viewer's own comment/stub/flag handlers in `SlideViewer.tsx` fire **nothing**, so any feedback left via `?view=classic` is invisible to every G1 number and funnel. This is an **accepted gap, not a bug:** `SlideViewer.tsx` is frozen (never edited — project memory) pending the Phase-7 cutover, and the floating viewer is the default for everyone, so real partners don't land on classic unless they explicitly force the `?view=classic` escape hatch. **What this means for reading the gate:** treat a partner who used classic as *unmeasured*, not as *no feedback* — if a debrief (§7) reports in-product feedback the dashboard didn't capture, check whether they were on `?view=classic` before concluding the events undercount. If you ever see meaningful classic usage in `deck_landing_viewed{view:classic}`, that's the trigger to either retire classic or make instrumenting it the one sanctioned exception to the freeze. *(Flagged in the 2026-07-02 code-quality review as Q2.)*

---

## 3. Identity & cohort (do this first, or everything is polluted)

- **Identify users.** Call `identifyUser(supabase_user_id)` on sign-in so every event is attributed to a real person (not an anonymous device). The seam (`lib/analytics.ts`) already has `identifyUser`.
- **Tag partners.** Set an `is_partner` super-property (true if the signed-in email is in `FEED_PARTNER_EMAILS`) so every event from a partner is flaggable. This is the cohort you measure.
- **Exclude yourself and test accounts.** Build a PostHog cohort **"Design partners"** = the `FEED_PARTNER_EMAILS` set, and **exclude** `greg@getpinpoint`, `greg.manzanera`, and the JC test account from every G1 insight. Your own activity must never count toward partner adoption.

---

## 4. Event schema (named events + properties)

Snake_case names and properties, PostHog convention. `distinct_id` = the Supabase user id.

| Event | Fires when | Key properties | Status |
|---|---|---|---|
| `deck_landing_viewed` | a deck page loads | `view` (feed\|deck), `deck_id`, `role` (owner\|collaborator\|anon), `version` | **exists** |
| `feedback_added` | a comment, stub, or flag is created **in the floating viewer or feed** (classic viewer does not fire — see §2.4) | `kind` (comment\|stub\|flag), **`surface` (feed\|deck)**, `deck_id`, `version`, `role` | **exists — add `surface` + `version` + `role`** |
| `send_to_ai_clicked` | owner clicks Send to AI | `deck_id`, `item_count`, `surface` | **add** |
| `version_published` | a new version is saved (MCP `update_deck` **or** extension update path) | `deck_id`, `version`, `source` (claude\|chatgpt\|null), `addressed_count` | **add (capture server-side)** |
| `feed_open_deck` | partner switches feed → deck | `deck_id`, `from_version` | **exists** |
| `feedback_curated` *(optional)* | owner edits / dismisses / restores an item | `action` (edit\|dismiss\|restore), `kind`, `deck_id` | add (optional — moat health) |
| `huddle_created` *(optional)* | a deck is created | `deck_id`, `source` (extension\|mcp) | add (optional — funnel top) |

**Why `version_published` is essential:** it's the only event that marks a *round boundary*. "By round 2" is meaningless in the data without it. Capture it **server-side** in the update path (don't depend on a browser being open to notice the new version).

**Minimum set for G1** (build these; the rest can wait): identify + `is_partner`, `deck_landing_viewed`, `feedback_added` (with the new props), `send_to_ai_clicked`, `version_published`, `feed_open_deck`.

---

## 5. The two funnels

### Funnel A — Core loop adoption (Claim 1, behavioural)

Cohort: Design partners. Per huddle.

1. `deck_landing_viewed`
2. `feedback_added`
3. `send_to_ai_clicked`
4. `version_published`

A full 1 → 4 is a **completed round in-product**. The key drop-off to watch is **1 → 2**: partners landing but *not* leaving feedback in-product — that's the failure mode G1 is built to catch. The count of step 4 over time *is* your north-star metric (weekly completed review rounds).

### Funnel B — Landing health (Claim 2, behavioural)

Not a clean A/B — partners are *assigned* the feed via the allowlist, they don't choose it — so don't pretend the events prove "preference." Read it as two insights instead, over the partner cohort:

- **Feed engagement:** among `deck_landing_viewed{view:feed}` sessions, the share that go on to fire `feedback_added{surface:feed}`.
- **Feed bail:** among the same sessions, the share that fire `feed_open_deck` (switched straight to the deck).

**High engage + low bail = the feed holds up.** This corroborates the debrief; it doesn't replace it.

---

## 6. The dashboard (PostHog insights)

One dashboard, "G1 — Phase 1 validation," cohort-filtered to Design partners:

1. **Completed rounds per week** — Trend, count of `version_published`. *(North star.)*
2. **In-product feedback by round & surface** — Trend, `feedback_added`, broken down by `version` × `surface`. Shows whether feed-origin feedback is actually happening and whether it grows by round 2.
3. **Core-loop funnel** — Funnel A.
4. **Feed-landing health** — the two ratios from Funnel B (engage rate, bail rate).
5. *(optional)* **Curation usage** — `feedback_curated` count, as a read on whether the moat feature is used.

Once the key is live, this dashboard can be built quickly through the PostHog MCP rather than by hand.

---

## 7. The partner debrief (the manual instrument — this is what actually proves G1)

Ask each partner **after round 1 and again after round 2**. Three questions:

1. **Proportion (Claim 1):** "Of the feedback you and your team gave on this round, roughly what share went *through SlideHuddle* versus reached me another way — Slack, email, a call, in person?" → a rough %.
2. **Preference (Claim 2):** "When you opened the huddle, did the **feed** or the **deck** feel like the better place to land and catch up?" → feed / deck / equal.
3. **The why (gold):** "If any feedback went outside the product, what made you go there instead?" → free text. This is where the real product insight lives.

Log the answers in a two-row-per-partner table (round 1, round 2). With this N, this table *is* your primary evidence; the dashboard backs it up.

---

## 8. Reading the gate

| Claim | Passes when | Primary source | Corroborated by |
|---|---|---|---|
| 1 — loop works | By round 2, ≥ 50% of partner feedback is in-product | Debrief Q1 | `feedback_added` volume is non-trivial and grows round 1 → 2 |
| 2 — feed earns it | Feed preferred or equal | Debrief Q2 | Feed engage rate ≥ bail rate (Funnel B) |

Both must hold. **Only the founder marks G1 passed (👤)** — CC may write "gate evidence ready" but never flips the gate.

---

## 9. Minimum to ship before the first partner lands

- [ ] `identifyUser(user_id)` wired on sign-in; `is_partner` super-property set from `FEED_PARTNER_EMAILS`
- [ ] Founder + test accounts excluded from all G1 insights
- [ ] `feedback_added` carries `surface` + `version` + `role`
- [ ] `send_to_ai_clicked` added
- [ ] `version_published` added — **server-side** in `update_deck` (MCP) **and** the extension update path
- [ ] `NEXT_PUBLIC_POSTHOG_KEY` (+ EU host) live in **both** `.env.local` and Vercel — *this closes P0.2*
- [ ] PostHog cohort "Design partners" = `FEED_PARTNER_EMAILS`
- [ ] The five dashboard insights built
- [ ] **Live smoke-test:** as a test partner, leave one comment *from the feed*, and confirm `feedback_added{surface:feed}` appears in PostHog Live Events. This is the "measurement actually works" check — do it before trusting any number.

---

*The events in §4 are mostly small additions to an existing seam (`lib/analytics.ts`,
`PostHogProvider`); the only structural new one is `version_published`. None of this
touches auth, RLS, the service-role key, or the MCP permission surface — it's
presentation/telemetry only.*
