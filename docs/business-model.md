# SlideHuddle — Business Model & Commercial Plan
## From product to commercially successful company

*Companion to "SlideHuddle: The Huddle Model" (concept, moat, build plan). This document covers the commercial layer: market, the free baseline to displace, pricing, go-to-market, metrics, validation, and the product/business gaps that must close. UK-based company targeting English-speaking markets. Data points as of June 2026; sources named inline.*

---

## 1. Executive summary

The product thinking is ahead of the business thinking. This plan closes that gap around one thesis: **SlideHuddle monetises the review, not the creation.** Creation is commoditised — Gamma alone claims 70M+ users and 400M+ AI-generated artifacts, with entry pricing pushed down to $8–10/month. Meanwhile the *review-and-approval* industry (Filestage, Ziflow, PageProof) charges $50–$249+/month because coordinating team feedback is a pain businesses demonstrably pay to remove — but that industry was architected before AI could act on the feedback.

The plan in one paragraph: from a UK base, target **English-speaking boutique agencies and consultancies (5–50 people)** — the UK as the home market for design partners and community access, the US as the volume market — because they produce client decks weekly (solving the frequency problem), need external client review, and already pay for review workflows. The true competitor is not another product but the **free baseline** (Slack/Teams threads, email, native slide comments), so the free tier must *be* the better baseline and monetisation must sit in workflow depth (Section 4). Monetise the **owner/workspace**, keep reviewers and viewers free forever. Price in USD between the prosumer AI tools and the proofing platforms: **Pro at ~$15/owner/month**, **Studio at ~$89/workspace/month**. Exploit the structural margin advantage — users bring their own AI, so AI cost-of-goods is near zero. Grow through the product's built-in viral loop plus a concrete, organic-first channel playbook (Section 6). Validate willingness-to-pay with 5–10 design partners *before* the big conversation-layer build. Target: **first revenue within 90 days, ~$8–10K MRR within 12–18 months as the base case.**

---

## 2. The commercial problem and why now

### 2.1 The problem, stated commercially

Teams now create content with AI individually, but high-stakes content (client decks, board decks, proposals, launch materials) still requires team and stakeholder review before it ships. That review happens today in Slack threads, email chains and meetings — unanchored, unversioned, and manually merged back into the AI by one person. Nobody pays for that today because no product exists for it; the adjacent evidence says they will:

- **Teams pay for review workflows.** Filestage prices at ~$50/month (Basic) to ~$250/month (Professional, unlimited team members); Ziflow at $119–$249+/month, holding SOC 2 and ISO 27001 certifications for enterprise buyers. Both run the unlimited-free-reviewers model — the payer is the workflow owner. (Published pricing via Picflow/Filestage comparisons, 2026.)
- **Creation is commoditised and cheap.** Gamma: free tier plus $8–20/month paid tiers, with a reported median contract of ~$400/year (Vendr deal data via Costbench, 2026); the category's average basic plan is ~$11/month (SaaSworthy). Value is migrating up the stack.
- **The buyers are already AI-native.** 64% of creative agencies adopted generative AI tools in 2025 (Forrester, via industry statistics roundups) — the beachhead doesn't need convincing that AI makes the deck; it needs the team workflow around it.

### 2.2 Why now (the window)

Three curves crossed in 2024–26: AI generation became good and cheap (2024–25); **MCP standardised the AI-to-tool bridge** (2025–26), making an AI-agnostic layer technically possible for a solo founder; and the review layer between teams and AI **does not exist yet** — the proofing incumbents predate actionable AI, the AI deck tools collaborate only inside their walls, and the AI platforms haven't built team review. Windows like this close: the realistic horizon before a credible fast-follow is measured in quarters, not years. Speed-to-validation is therefore a commercial strategy, not just an engineering preference.

---

## 3. Beachhead market and ICP (English-speaking)

### 3.1 Why agencies/consultancies, by the numbers

The brief's audience ("consultants, marketing/sales/product teams, founders") is four markets. The beachhead must be chosen on **deck cadence** — review products live on frequency — and **willingness to pay for review**:

- **Market size, English-speaking core:** ~433,000 advertising agencies globally (IBISWorld, 2024). The US is the volume market: ~41,000 marketing agencies (2025) and ~100,000 digital advertising agencies (IBISWorld, 2026). The UK is the home market: **25,000+ marketing agencies overall** (Gripped, 2025), including ~8,100–8,500 digital agencies (IBISWorld/industry data, 2024–26) generating ~£20.4bn revenue and growing ~7%/year. Canada, Australia and Ireland extend the same playbook with no localisation cost. Even a microscopic slice is a real business: 1,000 paying workspaces ≈ 1% of *UK digital agencies plus a rounding error of US ones*.
- **Cadence:** agencies and consultancies produce client decks and proposals weekly — unlike a product team's quarterly board deck. Weekly cadence is what makes a subscription retain and a habit form.
- **Stakes force review:** their decks go to *clients* — exactly the high-stakes content where one-person-plus-AI is not allowed to ship unreviewed.
- **They need the hardest-to-copy features:** external client review (guest mode), the decision log as an audit trail, custom branding, and version history — mapping one-to-one to SlideHuddle's differentiators.
- **They already pay** the proofing industry for adjacent workflows at $50–250/month — a known budget line to displace or sit beside.
- **The UK home advantage:** dense, accessible agency communities (Agency Hackers, The Agency Collective, BIMA), London meetups, and same-timezone design partners — the founder can do high-touch validation locally, then sell the proven motion into the US at volume.

### 3.2 The ICP, concretely

**Primary persona — the deck owner:** founder, account director, or senior consultant at a 5–50-person English-speaking agency/consultancy. Makes 2–6 client decks/proposals per month with AI (likely Claude or ChatGPT). Currently merges feedback by hand from Slack/email/meetings. Pays for 5–15 SaaS tools already; can approve a sub-$100/month tool without procurement. Buying trigger: a botched review round — wrong version sent to a client, feedback lost, a weekend spent merging comments.

**Secondary personas:** the team reviewers (free, forever) and the *client* reviewer (free, guest — and quietly the most important persona for word-of-mouth: every client who experiences a clean huddle review is a prospect with their own decks).

**Explicitly deferred:** enterprise (needs SSO/SOC 2), solo founders making investor decks (episodic cadence; they arrive via the loop anyway), education, and non-English markets.

---

## 4. The real competitor is free: the baseline today and the displacement case

SlideHuddle's competition is not Gamma or Filestage. It is **what teams already do for nothing.** This section names those baselines, prices their hidden cost, and sets the rule for how a paid product wins against free.

### 4.1 The four free baselines

| Baseline | How the review actually happens | Where it breaks |
|---|---|---|
| **Slack / Teams threads** (the default for internal review) | Owner pastes screenshots or a link; feedback arrives as chat messages, emoji, and side-DMs across days | Unanchored ("which slide?"), unversioned (half the team comments on a stale screenshot), no record of what was decided, nothing reaches the AI except by hand |
| **Email + attachments** (the default for *client* review) | Deck v3_FINAL_v2.pdf goes out; feedback returns as prose paragraphs, annotated PDFs, or a reply-all chain | Slowest cycle; version chaos is the norm; feedback arrives in a form that must be manually decomposed before anyone (human or AI) can act on it |
| **Google Slides / PowerPoint comments** (when the deck lives there) | Anchored comments on slides; resolve buttons | Only exists if the AI's output is flattened into Slides/PPT first — losing the fidelity of what the AI actually made; comments speak to a human editor, not an AI; no curation, no decisions, and the merge back into the AI prompt is still manual |
| **The meeting** (the escalation path for all of the above) | 30–60 minutes of senior people walking the deck | The most expensive review channel that exists; output is verbal, captured (if at all) as someone's notes, then manually re-typed into the AI |

Every baseline shares the same two missing steps — the ones the concept document identified as the actual pain: the **merge** (a human translating scattered feedback into AI instructions) and the **memory** (decisions evaporating between rounds).

### 4.2 What free actually costs

Loaded senior time at an agency runs roughly **£75–£150/hour UK, $100–$200/hour US** (typical billable/loaded rates for account directors and senior consultants). A realistic review round on the free baseline:

- Collect feedback from 2–3 channels and chase the people who haven't replied: 30–60 min
- Reconcile contradictions and merge into a coherent revision brief / AI prompt: 30–90 min
- Re-prompt, re-export, redistribute, and field "which version is this?" questions: 20–40 min

Call it **1.5–3 senior hours per round**, at 2–3 rounds per client deck → **$300–$1,800 of coordination cost per deck**, before counting cycle-time (days, not hours) and the occasional five-figure error of the wrong version reaching a client. An agency shipping 4 decks/month is burning **$1,200–$7,000/month** of senior time on a workflow Studio replaces for $89. The pitch is not "better than free" — it's "you are already paying ten to eighty times this price in partner hours; you just don't see the invoice."

### 4.3 Why a paid product can win against free (the rules)

1. **The free tier must *be* the upgraded baseline.** Viewing and commenting are free forever and better than email/Slack on day one (anchored, versioned, no login to view). Adoption never requires payment — that fight against free is unwinnable and unnecessary.
2. **Monetise depth, never participation.** The paid line sits at workflow scale (active huddles, history, guests at volume, branding, decision-log export) — things the *owner* feels monthly, after the habit exists.
3. **Win on the one axis free cannot reach.** Every baseline can collect opinions. None of them can produce **owner-approved decisions that an AI executes, with the result posted back and resolved.** That loop is structurally impossible in chat, email, slide comments, and meetings — it is the 10x axis, and the demo must show it in under two minutes.
4. **Respect the gravity of "good enough."** Teams don't migrate workflows; they adopt at a trigger moment. The wedge is *the next client deck round*, not a tooling decision — "send this one link instead of the PDF" is the entire ask. Everything in onboarding optimises that single moment.
5. **Make the switching cost work for, not against.** Free baselines have zero switching cost in both directions; SlideHuddle accumulates one (decision logs, version history, the team's record) — the §5 moat expressed commercially.

---

## 5. Business model and pricing

### 5.1 Model principles

1. **The owner/workspace pays; participation is free forever.** Reviewers, commenters and viewers never pay — they are the distribution. This mirrors the proofing industry's proven unlimited-reviewers model and protects the viral loop.
2. **BYO-AI is a margin strategy, not just an architecture.** Users bring their own Claude/ChatGPT subscription; SlideHuddle pays for almost no inference. The only SlideHuddle-paid AI (digests, change summaries) is small, cacheable, and tier-gated.
3. **Charge for workflow depth, not content volume** (per §4.3 rule 2).
4. **Value anchor:** §4.2's coordination cost. Studio at $89/month is priced against one senior hour, recovered in the first review round of the month.
5. **Currency:** priced and displayed in **USD** (the largest target market); Stripe presents localised currency (£/€/A$/C$) at checkout. The UK entity invoices in USD without friction.

### 5.2 Proposed tiers

| Tier | Price (annual billing) | What it includes | Who it's for / why this price |
|---|---|---|---|
| **Free** | $0 | Unlimited viewing & commenting (always); owner: 2 active huddles, 30-day version history, exports carry a small "Made on SlideHuddle" badge, community support | The viral surface and the upgraded free baseline (§4.3). Generous enough to run a real review round — the activation moment |
| **Pro** | ~$15/owner/month ($19 monthly) | Unlimited active huddles, full version history, clean (unbadged) exports, decision-log export, AI catch-up digests, priority email support | The individual consultant/founder. Sits at the Gamma-Pro/Plus-AI price level ($15–20) — a familiar, low-friction price for an AI-adjacent tool |
| **Studio** | ~$89/workspace/month ($109 monthly), up to 10 members | Everything in Pro for all members + shared workspace, unlimited client guest reviewers, custom branding on viewer/exports, client-facing decision-log view, Slack notifications (when built), admin controls | The agency tier. Undercuts Filestage Professional (~$250) and Ziflow Standard ($249) while sitting above their entry plans — one senior hour per month |
| **Founding partner** | $39/month flat, locked for 24 months | Studio features as they ship + direct line to the founder + roadmap input | The design-partner offer for the first 10–20 agencies. Its real purpose is *paid validation* — a pre-sold commitment is the willingness-to-pay test |

Enterprise (SSO, SOC 2, DPA-first procurement) is deliberately deferred 12+ months; Ziflow's certifications show the bar, and it's not a solo-founder fight yet.

### 5.3 Unit economics

- **COGS:** near zero and flat for a long time. Vercel + Supabase paid tiers run ~$50–100/month into the thousands of users; transactional email ~$20/month at early volume; SlideHuddle-paid AI (digests) cents per active huddle. **Gross margin >90%** — better than typical AI-native SaaS, because inference is the customer's.
- **CAC:** near-zero by design in the PLG phase (the viral loop and the organic channel playbook in §6), founder-time-priced in the design-partner phase. Paid acquisition is explicitly out of scope until the loop's metrics are known — freemium paid-traffic converts ~2.8% baseline (Reforge/MKT1 meta-analysis, 2026).
- **Conversion assumptions (from benchmarks):** B2B freemium free-to-paid typically runs 2–5%, ~9% average across PLG models, and 5–15% for tightly targeted, high-intent products (ProductLed 2025; daydream/Guru Startups 2025). SlideHuddle's ICP focus argues for the targeted band — but plan on the conservative band.

### 5.4 A simple 12–18 month revenue scenario (scenarios, not forecasts)

Assumptions: each active huddle exposes ~5 unique recipients; a fraction of recipients become owners (the measured viral coefficient); free→paid at the benchmark bands; blended ARPU ~$18–25 (mix of Pro and Studio).

| Metric at month 12–18 | Conservative | Base | Stretch |
|---|---|---|---|
| Registered owners | 2,000 | 6,000 | 15,000 |
| Free → paid conversion | 3% | 6% | 9% |
| Paying owners / workspaces | 60 | 360 | 1,350 |
| Blended ARPU | $18 | $22 | $25 |
| **MRR** | **~$1.1K** | **~$8K** | **~$34K** |

The honest reading: the conservative case is a side project; the base case sustains a solo founder and proves the model; the stretch case justifies funding or hiring. Which case materialises is determined almost entirely by **activation rate** and **viral coefficient** (§7) — plus design-partner revenue arriving much earlier: 10 founding partners × $39 ≈ $390 MRR in the first 90 days, whose value is information, not income.

---

## 6. Go-to-market and distribution: the channel playbook

Budget rule for the first year: **organic-first; $0 paid acquisition until activation and the viral coefficient are measured.** The founder's time is the scarce input, so every channel below is rated for founder-hours, not just money.

### 6.1 Phase A — Design partners (months 0–3): sell ten by hand

Goal: **5–10 founding partners at $39/month, pre-sold.** This is a manual, high-touch motion and the UK home advantage is the whole point:

- **Sourcing list (UK-first):** Agency Hackers (UK agency-leader community with events and an engaged newsletter), The Agency Collective (peer community for UK agency owners), BIMA, London agency meetups; plus the founder's own first- and second-degree network. Online: r/agency, r/digital_marketing, agency-owner groups on LinkedIn.
- **Targeting filter:** agencies already public about AI — search LinkedIn for agency founders/account directors posting about Claude, ChatGPT or Gamma in client work (the 64%-adoption stat means the timeline is full of them). They self-identify; outreach to them is conversation, not cold-calling.
- **The motion:** 15–20 personalised contacts/week. The message is specific, not salesy: "You're making client decks with AI — I've built the team-and-client review loop around it. Bring your next real deck; I'll run the round with you live, 20 minutes." Demo on *their* deck, never a canned one.
- **The offer:** $39/month founding-partner rate locked 24 months, founder on call, roadmap influence, logo/quote permission requested after their third successful round (not before).
- **What this phase really buys:** assumptions 1–3 in §8 tested with money involved, plus the launch assets (logos, quotes, case numbers like §4.2's hours-saved math made real).

### 6.2 Phase B — Engineer the viral loop (months 2–6)

The product has a built-in loop nobody has designed yet: **owner shares deck → 3–10 recipients experience the huddle → some are deck-makers → some become owners.** Engineering it means: tasteful SlideHuddle branding on the free viewer; a recipient-side moment after their first comment ("you make decks with AI too? start your own huddle"); the orphan-claim flow treated as an onboarding funnel; a "Reviewed on SlideHuddle" footer option on exported PDFs; and a simple referral mechanic (give a month of Pro, get a month) once billing exists. Measure the **viral coefficient (k)** from day one — every 0.1 of k changes §5.4 more than any channel below. Targets: k > 0.3 is promising for a collaboration tool; k > 0.5 changes the company.

### 6.3 Phase C — The channel playbook (months 4–12)

| Channel | Specific motion | Cost / founder time | What good looks like |
|---|---|---|---|
| **AI connector directories** (Anthropic's connector/MCP directory; ChatGPT and Grok equivalents as Phase-3 multi-AI lands) | Polished listing owning the "team review for AI decks" shelf: screenshots of a real round, the 2-minute loop video | Free / low | Directory-attributed signups; being the canonical review connector before a rival exists |
| **Chrome Web Store** | ASO on the extension listing: "Claude slides," "AI presentation," "deck feedback"; refreshed screenshots; review prompts after successful captures | Free / low | Store search as a steady top-of-funnel trickle |
| **Launch moments** | Product Hunt launch (collab tools perform well; prepare hunter, assets, partner quotes), Show HN, BetaList pre-launch | Free / 2–3 weeks prep | Top-10 PH day ≈ 500–1,500 qualified visits + backlink base; timed with Q3 public launch |
| **Founder-led LinkedIn** | 2–3 posts/week where the agency audience lives: before/after review rounds, the §4.2 cost math, build-in-public milestones; comments → DMs → demos | Free / 3–4 hrs week | The compounding channel for this ICP; pipeline measured in DM-to-demo conversions |
| **Community presence** | r/ClaudeAI and r/ChatGPTPro (workflow questions about artifacts/decks are constant — answer genuinely, demo when asked), r/agency, r/consulting; Anthropic/AI Discords | Free / 2 hrs week | Helpful-first reputation; these communities are where the exact user already gathers |
| **SEO / content** | 2 pieces/month on zero-competition, exact-intent queries: "get team feedback on Claude artifacts," "AI presentation review workflow," "how agencies review AI decks with clients"; comparison pages ("SlideHuddle vs Google Slides comments," "vs Filestage for AI decks") | Low / 4–6 hrs piece | Rankings in 3–6 months on terms that didn't exist two years ago; comparison pages convert highest |
| **AI tool directories & newsletters** | Free listings: There's An AI For That, Futurepedia, Toolify. Paid newsletter placements (Ben's Bites, TLDR-class, ~$500–3K) **deferred** until activation ≥30% — don't buy traffic into an untuned funnel | Free now; paid later | Listings = long-tail referrals; one strong newsletter test in Q4 if metrics earn it |
| **YouTube / reviewers** | Outreach to AI-tool channels already reviewing Gamma/Claude workflows: early access + an affiliate code (once billing exists) | Free–affiliate % | One mid-size walkthrough video outperforms months of posts for this category |
| **Partnerships** | (a) AI implementation consultants who set up agency AI stacks — give them a partner rate/rev-share to bundle SlideHuddle; (b) deck-generator co-marketing: "make it in Gamma/Claude, review it in SlideHuddle" — generators are partners, not rivals | Low | A repeatable indirect channel; consultants sell workflow, which is exactly the product |
| **The client-side loop** | Every client guest at a Studio workspace gets a polished branded experience + a quiet "use SlideHuddle with your own decks" path | Free | The B2B2B flywheel unique to the agency beachhead |

### 6.4 Acquisition math and targets

For freemium companies, organic sources (SEO + direct) typically drive ~53% of acquisition and the product itself ~13% (PLG benchmark data) — the playbook above leans into exactly that mix. Funnel targets to hold the channels accountable: visitor→signup ≥6% (freemium benchmark; loop- and community-driven arrivals should beat it), signup→activation 30–40%, free→paid 4%+ by day 90 of each cohort. Channel attribution lives in PostHog from day one (§7); any channel that hasn't produced an *activated* owner in 60 days of effort gets cut without sentiment.

---

## 7. Metrics framework (define before building more)

Only ~34% of PLG companies consistently track activation (ProductLed) — being in that third is a cheap edge. All instrumented in the existing PostHog from named events, defined now:

- **North star: weekly completed review rounds** (a round = feedback → owner approval → AI revision published). This is the unit of delivered value; everything else is upstream of it.
- **Activation:** owner completes their **first revision round with ≥2 other participants within 7 days of first deck**. Target: ≥30% of new owners. (This single metric decides whether the Huddle concept works.)
- **Funnel:** visitor→signup (≥6%), signup→activation (30–40%), free→paid (per §5.3 bands — track at 30/60/90 days; freemium conversions peak months 3–6 per ADV.me cohort data, so don't panic at day 30).
- **Retention:** the brutal one for review tools — **% of teams that start a second huddle within 30 days** (target ≥40% in the agency ICP; if agencies don't return, the cadence thesis is wrong and the beachhead must change).
- **Viral coefficient k:** new owners attributable to recipient exposure ÷ active owners, monthly.
- **Revenue health (later):** logo churn <3%/month, NRR >100% via seat expansion in Studio.

---

## 8. Riskiest assumptions and the validation plan

| # | Assumption (ranked by risk) | Cheapest decisive test | Pass / fail signal |
|---|---|---|---|
| 1 | Teams will run review *conversations* in a new tool rather than the free baseline (§4) | Phase-1 read-only feed + design partners' real decks | ≥half of partner feedback arrives in-product by round 2; fail → pivot to Slack-bridge-first |
| 2 | Owners will pay | Pre-sold founding-partner offer at $39/month | ≥5 of 15 pitched agencies commit with a card; fail → revisit price, packaging, or ICP |
| 3 | Agency deck cadence sustains a habit | Second-huddle-within-30-days metric on partners | ≥40% start a second huddle unprompted; fail → test sales-proposal or docs use case |
| 4 | Clients (external guests) will participate | Guest mode prototype with 2 partner agencies' real clients | Clients comment without hand-holding; fail → agency value prop weakens to internal-only |
| 5 | The viral loop produces owners | Viewer branding + claim-flow funnel, measured | k ≥ 0.2 by month 6; fail → GTM weight shifts to content/community-led (§6.3) |
| 6 | AI trend increases (not removes) team review of content | Watch partners: does deck volume per team rise with AI? | Rising decks-per-team confirms; falling team involvement is the existential bear case to monitor |

Sequencing rule: **assumptions 1–3 must pass before the Phase-3 conversation-core build** in the concept document's plan. The build plan already gates this way; this table is the commercial version of those gates.

---

## 9. Gaps this opens in the product feature plan

The concept document's phases were product-driven. The business plan adds requirements the current plan **does not contain**:

| Business need | Gap in current product plan | Action | Slots into |
|---|---|---|---|
| Agency (Studio) pricing | **No workspace/team entity exists** — the schema is deck-centric with individual owners (`decks.user_id`); there is nothing to sell a Studio plan *to* | Add a lightweight `workspaces` model (members, shared deck ownership, admin) | New Phase 2.5, after profiles/invites |
| Charging anyone at all | **No billing**: no Stripe, no plans, no entitlements, no tax handling | Stripe Billing + Stripe Tax + a plan-gating layer (active-huddle counter, feature flags) | Phase 2.5, before public launch |
| Client review (core agency value) | Guest/observer mode sits in "Phase 6 differentiators" | **Promote to Phase 3** — it's beachhead-critical, not a nice-to-have | Phase 3 |
| The viral loop | No viewer branding, no recipient-side CTA, claim flow not treated as a funnel | Add badge + "start your own huddle" moment + funnel instrumentation — cheap, high-leverage | Phase 1 (immediately) |
| Metrics framework (§7) | PostHog installed but **no defined events**; activation/retention/k unmeasurable today | Named event schema + dashboards, incl. channel attribution for §6 | Phase 0 (now) |
| Retention via reach | Email notifications sit late in the plan | Confirmed as Phase 5 but flagged **commercially mandatory**, not polish | Phase 5 (unchanged, re-justified) |
| Agency branding | No custom-branding/white-label capability anywhere in the plan | Studio feature: logo + colour on viewer/exports | Phase 5 |
| Client-facing audit trail | Decision log exists in concept; no client-view variant | Read-only, brandable decision-log share view | Phase 5 |
| Trust as a selling point | Strong security posture, but no public trust page; no ToS/Privacy/GDPR surface | Security page + ToS/Privacy + UK/EU GDPR basics (data export/delete, DPA template) | Phase 2 |
| Onboarding/time-to-value | No first-run experience; new owner lands in an empty dashboard | Sample huddle + guided first capture/create, optimised for the §4.3 "next deck round" wedge | Phase 2–3 |
| Name/trademark risk | "SlideHuddle" boxes into slides; **Slack owns "Huddles"** as a famous feature — confusion and trademark exposure unresolved | Trademark searches (UK IPO + USPTO, since both markets matter); go/no-go rename decision **before** public launch | Phase 0 decision |

Two of these are genuinely structural: the **workspace entity** (without it there is no agency product) and the **name decision** (rebrands get exponentially costlier after launch).

---

## 10. Business operations checklist (UK edition)

- **Entity & tax:** a **UK Ltd** (Companies House, ~£50, days to set up). UK VAT registration becomes mandatory at £90k taxable turnover — register when approaching it (or voluntarily earlier if input VAT reclaim matters). Sales to EU consumers route through the **VAT OSS non-Union scheme**; US sales-tax exposure is handled by **Stripe Tax** when thresholds are ever reached. Pricing in USD from a UK Ltd is routine.
- **Payments:** Stripe Billing + Stripe Tax (subscriptions, localised currency presentation, invoices agencies expect).
- **Data protection:** UK GDPR applies (plus EU GDPR for EU users) — register with the **ICO** (data-protection fee, ~£52/year, legally required for companies processing personal data); design in data export/delete; keep a standard DPA ready for Studio customers (their clients will ask them, and they will ask you).
- **Legal:** ToS + Privacy Policy (template + one solicitor review).
- **Brand:** trademark searches via **UK IPO and USPTO** (the Slack "Huddles" conflict checked in both) + secure domain/handles — already on the brief's list; now deadline-bound to pre-launch.
- **Support & status:** a support email + public changelog from day one; a status page once paying customers exist.
- **Accounting:** any UK SaaS-friendly online accountant (Crunch-class); revenue recognition is trivial at this scale.

---

## 11. The integrated 12-month plan (business + product, merged)

**Quarter 1 — Validate and scaffold (product Phases 0–1 + commercial Phase A).** Finish PDF export and security verifications; define and instrument the metrics events incl. channel attribution; ship the read-only feed; add viewer branding + claim-funnel (viral loop v0); run the UK IPO/USPTO trademark searches and make the name decision; incorporate the Ltd, set up Stripe; recruit and pre-sell 5–10 founding partners via the §6.1 motion. *Exit gate: assumptions 1 and 2 tested; first recurring revenue exists.*

**Quarter 2 — Build the sellable core (product Phases 2–3 + workspace/billing).** Profiles, invites, role enforcement; workspace entity + billing/entitlements; conversation core (messages, quoting, decisions, real-time) with partners as live testers; guest/client mode (promoted); trust page + legal basics; begin founder-led LinkedIn and community presence (low-cost channels compound early). *Exit gate: assumption 3 (second-huddle retention ≥40% among partners) and a full review round completed by a partner's real client.*

**Quarter 3 — Close the AI loop and launch (product Phases 4–5 start + commercial Phases B/C).** MCP evolution (decisions pipeline, AI feed posts, digest) + OAuth re-review; email notifications; public launch wave: Product Hunt / Show HN, MCP directory listing, Chrome Web Store refresh, first comparison pages live; Studio tier live with partner logos. *Exit gate: activation ≥30%, k measured, free→paid trending into the 4%+ band.*

**Quarter 4 — Pour into what works.** If k and retention are healthy: double down on the loop, the LinkedIn/content engine, and the reviewer/partnership channels; ship Slack bridge + custom branding + client decision-log view; open the multi-AI (ChatGPT) door and its directory. If they aren't: the docs/content expansion (same model, AI-written documents — larger market, higher frequency) is the prepared pivot, and the conversation/decision data model was deliberately built content-agnostic for exactly this. *Exit decision: bootstrap profitably vs. raise on the loop's numbers vs. expand the wedge.*

---

## 12. Honest failure modes (so they're watched, not discovered)

1. **The free-baseline gravity well** — teams try it, like it, and still drift back to Slack/email because "good enough" is free and zero-effort (§4). Watched by assumption 1; the prepared response is the Slack bridge moving up the roadmap (meet the conversation where it lives, keep anchors/decisions/AI loop as the value) and doubling down on the §4.3 wedge moment.
2. **Cadence disappointment** — even agencies review decks less often than believed. Watched by the second-huddle metric; response is the docs expansion (frequency through breadth of content types).
3. **Fast-follow before validation** — a platform ships native review while SlideHuddle is still pre-launch. Mitigation is speed (this plan's 90-day revenue goal) and the neutrality/data positions a platform feature won't replicate.
4. **Solo-founder throughput** — GTM and build compete for the same person. Mitigation: design partners do double duty (revenue *and* testing), Claude Code carries the build, the §6 playbook is deliberately founder-hours-rated, and the Q4 exit decision explicitly includes hiring/funding.
5. **Free-rider equilibrium** — everyone stays on the free tier. Watched by the conversion band; response levers in order: tighten active-huddle limits, gate history depth, raise badge prominence — never gate participation (§4.3 rule 2 is inviolable).

---

*End of document. Sources referenced: IBISWorld (US/UK/global agency counts, 2024–26), Gripped (UK agency count, 2025), Capsule/industry data (UK digital agency revenue, 2025), Forrester via 2025 agency statistics roundups (AI adoption), published Gamma/Pitch/Filestage/Ziflow pricing (SaaSworthy, Costbench, Picflow, 2026), ProductLed PLG benchmarks (2025), Reforge/MKT1 meta-analysis (2026), daydream / Guru Startups freemium benchmarks (2025), ADV.me cohort data (2025). Companion documents: SlideHuddle Project Brief, TECHNICAL.md, Security Review, and "SlideHuddle: The Huddle Model."*
