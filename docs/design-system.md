# SlideHuddle — Brand & Product Design System
## v2.1 · The Floating Canvas direction

*Supersedes §5 (Viewer UI) of the Project Brief and updates §4 (Brand). Codifies the June 2026 redesign ("focus on the content; navigation expands only when needed"), incorporates the design review of 12 June, and serves as the reference for P1.1 (floating viewer completion), the feed build, and all mockups. June 2026.*

*v2.1 (2026-06-14): colour rule refined — **purple names actions you take** (including the Send-to-AI button), **amber names the AI's own voice** (its posts, chips, avatar). See §2.2. NB: the v2 mockup (`mockups-v2.html`) still paints Send to AI amber and Comments as a filled pill — it predates this refinement and will be refreshed separately; where the mockup and this rule disagree, this rule wins.*

---

## 1. What changed, and why it's right

The original viewer spent the brand's stated principles — "the slide takes 80%+ of the screen," "default to nothing" — on a layout that still reserved permanent chrome: a top nav, an actions row, and a thumbnail band. The June redesign takes those principles literally: **the content is the page.** The deck renders full-bleed; everything else — brand, title, people, actions, thumbnails, comments — floats above it in rounded panels and pills that appear when needed and get out of the way when not.

This is kept, for four reasons. It executes the founding principles better than the old design did. It adopts the mental model SlideHuddle's agency ICP already lives in (Figma/Miro/Canva: floating panels over a canvas), rather than Google Slides' fixed chrome. It reads as a modern creative tool — fitting for decks that are living AI-made HTML, not files. And it structurally anticipates the Huddle model: the floating right panel that holds comments today is the same surface that holds the conversation feed tomorrow; the panel grammar inverts cleanly between the deck surface (deck primary, conversation floating) and the huddle surface (conversation primary, deck peeking).

One rule from the old design survives unchanged because the redesign needs it most — see §3.2.

---

## 2. Brand foundations

### 2.1 Name, voice, vocabulary

- **SlideHuddle** (capital S, capital H). A *huddle* is the unit of work: one deck, one team, one conversation. People in a huddle are **Huddlers** — used in owner/team surfaces; on client/guest surfaces soften to neutral copy ("3 reviewing"), since "Huddlers" is ours, not theirs.
- Voice: professional and trusted — Google Workspace, Linear, Notion register. Plain verbs, sentence case, no filler. Never playful or gimmicky; "Huddlers" is the single sanctioned moment of personality.
- Action naming is consistent end-to-end: the button that says **Send to AI** produces a system message that says *sent to AI*. The product says **"Send to AI"**, not "Send to Claude" — the UI is AI-agnostic even while Claude is the only connection; the connected assistant's name may appear in secondary copy ("via Claude").

### 2.2 Colour — the system's signature

Colour names the actor. This is SlideHuddle's most distinctive visual asset and is **non-negotiable in every component**:

| Colour | Hex (core / mid / light) | Means | Used for |
|---|---|---|---|
| **Purple** | #4A3FB5 / #6C5CE7 / #E9E7FB | **You & the product** — actions you take | Brand mark, primary actions (Share, **Send to AI**, Send in composer), active/selected states, thread pins, version ownership |
| **Teal/Green** | #0B5C47 / #3FA784 / #DCF2EA | **The team** | Comments button & counts, quote borders, decision badges, presence, requested-slide stubs, unread signals |
| **Amber** | #7A4708 / #C77D11 / #F8E9CF | **The AI's own voice** | AI avatar & posts, "Queued for AI" / "Sent to AI" chips, AI revision events — **not** the button that invokes the AI (pressing Send to AI is *your* action → purple) |
| Neutral | ink #141413 · grey #46443F · line #DDDCD4 · soft #F4F3EF · bg #FAFAF8 | Structure | Surfaces, text, dividers; dark ink for overlays (popover, counter) |
| Danger | #791F1F on #FCEBEB | Destructive | Removal flags, delete confirms |

Rules: never use an actor colour decoratively; one actor colour per element. **Purple marks actions you take; amber marks the AI's voice** — so the *button* that sends to the AI is purple (it's your action), while the AI's *posts, chips, and avatar* are amber. *(Refined 2026-06-14: an earlier draft put the Send-to-AI button in amber; corrected — colour follows who acts, and pressing Send to AI is something you do.)*

### 2.3 Typography

**Plus Jakarta Sans** everywhere. Scale: display 28–40/700/-0.02em (slide-adjacent headers only) · screen titles 15–16/700 · body 13–13.5/400–500/1.55 · meta 11–12/500 · eyebrows 10.5/700/+0.09em uppercase · button 13/600. Numbers in pills and counters at 600–700. No second typeface.

### 2.4 Iconography

Outline icons, 1.5px stroke, 14–16px in pills. Every icon in persistent chrome must pass the "means something at a glance" test; the current brand-pill device icon fails it and is removed until it has a job (§10).

---

## 3. The Floating Canvas language

### 3.1 Principles

1. **The content is the page.** The deck (or, on the huddle surface, the conversation) renders edge-to-edge as the base layer. No permanent chrome bands.
2. **Chrome floats and earns its place.** Everything else lives in rounded white pills and panels with soft shadows, positioned at the edges. Each floating element must justify being visible *right now*.
3. **Inset, never overlay** *(the carried-over rule, now load-bearing)*: when a panel or rail is **open**, the content **scales and insets into the remaining safe area** — floating chrome may share the screen with content but may never cover it. The slide is HTML; it scales losslessly. When panels close, content breathes back to full bleed. This is the fix for the June build's occlusion flaw and the acceptance test for every screen: *no pixel of slide content sits underneath chrome.*
4. **Navigation expands only when needed.** Closed by default beats auto-hidden: prefer collapsed states with minimal persistent signals (§5) over chrome that vanishes entirely.
5. **Colour names the actor** (§2.2) — on a floating UI with little chrome, colour does even more of the explanatory work.

### 3.2 Layout grammar

- **The stage**: the full-bleed base layer. Background `#FAFAF8` letterboxing when the slide's aspect doesn't fill.
- **Pills** (single-purpose, top corners): brand pill top-left (logo + wordmark; on deck surfaces it extends with deck title + version chip). Action cluster top-right, ordered **Send to AI · Comments · Share**, with hierarchy carried by *weight, not colour*: **Share** is the only filled button (purple — the everyday primary action); **Send to AI** is a calm purple-outline split button; **Comments** is the lightest — a bare teal icon + count (it only toggles the panel, so it isn't styled as an action). The Huddlers/identity cluster sits to their left.
- **Rails** (left edge): the vertical thumbnail rail, floating, numbered, with comment-count badges (teal) and requested-slide stubs (dashed teal). Two states: **open** (≈112px wide incl. padding) and **sliver** (≈14px: a slim rounded strip showing only badge dots — the team's fingerprints never fully disappear).
- **Panels** (right edge): comments / threads / the feed-peek. ≈300–340px, full-height floating card, internally scrolling. One panel open at a time on desktop.
- **Persistent layer**: slide counter (bottom-centre dark pill) and the rail sliver. These never hide.
- **Overlay layer**: the selection popover (dark ink pill: "＋ Start thread | ❝ Quote"), toasts, and modal panels (Claude queue) over a 40% ink scrim.

**Spacing & depth tokens**: edge gap 16px (12px ≤1280w) · gap between floating elements 12px · pill radius 14px · panel radius 16px · shadows `0 10px 30px rgba(20,20,19,.10)` pills / `0 18px 50px rgba(20,20,19,.14)` panels · borders 1px #DDDCD4 on all floating surfaces (shadow alone is not enough on light slides). Z-order: stage 0 · rails/panels 10 · pills 20 · popover/toast 30 · modal+scrim 40. **Fixed rule: toasts always render on the top layer** — portaled to `<body>` above every panel, pill, and popover, so a confirmation can never be occluded by overlapping chrome. Floating popovers/menus clamp to the viewport (flip or shift on-screen) so a panel opened near a screen edge — e.g. the "Request a slide" form on a low thumbnail — never spills off-viewport with its action button unreachable.

### 3.3 Inset math (the acceptance rule, concretely)

Safe area = viewport minus (edge gaps + open rail width + open panel width + persistent counter clearance). The slide scales to fit the safe area, centred. Opening/closing a panel animates the inset 200ms ease; with `prefers-reduced-motion`, it snaps. **Test on every surface: open everything at once — rail + comments — and confirm the full slide, including its corners, is visible.**

---

## 4. Behaviour policies

### 4.1 Show, expand, persist (replaces "auto-hide")

| Layer | Default | Expands when | Persists |
|---|---|---|---|
| Pills (brand, actions) | Visible | — | Fade to 40% after 4s idle in **present mode only**; always full in review mode |
| Thumb rail | **Sliver** | Hover/tap the sliver, or keyboard `T` | Sliver always visible (badge dots = team's fingerprints) |
| Comments/feed panel | Closed | Comments button, a thumbnail badge, a pin, or a quote tap | Never auto-opens except via the catch-up banner's CTA |
| Counter | Visible | — | Always |
| Selection popover | Hidden | Text/region selection on the slide | Dismiss on click-away or Esc |

### 4.2 Re-engagement surfaces

The **catch-up ribbon** (purple-tinted gradient pill, top of feed/panel: "Since Tuesday: 9 messages · 2 decisions — Read the summary") and the **arrival banner** on the deck surface are the habit loop; they are content, not chrome, and never auto-hide. Unread = teal dot grammar everywhere (dashboard cards, rail badges, sidebar counts).

---

## 5. Component inventory (canonical states)

- **Brand pill**: logo square + "SlideHuddle". Deck surfaces append: title (truncate at ~38ch) + version chip (teal tint, "v6 ▾" opens history).
- **Avatar** (the one component, `viewer/Avatar.tsx`): carries TWO signals. **Shape = role** — owner = FILLED with a soft **pastel** of their colour + ink initials (calm, not jarring); collaborator = **white** fill + a 2px coloured ring + ink initials; the AI = a distinct dark/ink circle with an amber sparkle (never reads as a teammate). **Colour = person** — each person gets a deterministic colour by hashing their user id (same everywhere), from a palette deliberately steered AWAY from the system colours — each an ink + pastel pair: blue `#2563EB`/`#DBEAFE`, pink `#DB2777`/`#FCE7F3`, coral `#EA580C`/`#FFE8D6`, slate `#475569`/`#E2E8F0`, rose `#BE123C`/`#FFE4E6`, brown `#92400E`/`#F2E4D5`: **no purple** (brand/buttons), **no teal/green** (comments), **no amber** (the AI). The owner decision lives in this one component (caller passes `userId` + the deck's `ownerId`). **Initials** (1–2 upper): display name → first letter of first + last word (single word → first two); else email local part (strip trailing digits, split on `. _ - +`; 2+ parts → first of first+last, one part → first two). Used everywhere a person appears — feed cards, version lines, the Huddler cluster, and the account menu. Feed cards tag the name with `(you)` (the viewer) and/or `(owner)`. The feed's top-left shows the deck **title only** (no version chip — the feed is cross-version).
- **Huddler cluster**: stacked `Avatar`s + "3 Huddlers"; live presence = teal dot ring. Guests render with their domain initial; anonymous viewers are never shown to others.
- **Version spine** (the one component, `viewer/VersionSpineEvent.tsx`): versions are the feed's BACKBONE, rendered as flush **messages** (NOT boxed cards), full-width and left-justified; the conversation that happened during each version **indents underneath** it under a vertical thread line (two levels only). Three prominence levels: **v1** = "[Owner] started this huddle · [title] · N slides · date" (owner circle avatar); **v2+** = "✦ [AI] published vN · N slides" + sub-line "requested by [name] · addressed N comments[, N requests][, N removals] · date" + a right-aligned "see changes ▸" disclosure (a plain list of what it resolved — NOT an AI summary); the **current** version is a subtly **purple-tinted highlight band** + a "current" pill, with a "▾ Feed opens here · since vN" marker before its conversation. The AI is a distinct **dark rounded square + amber sparkle** (people are circles). Each event carries a horizontally-scrollable thumbnail strip of THAT version's slides (`viewer/LazyThumbnailStrip.tsx`, IntersectionObserver-mounted iframes). **AI provenance** comes from `deck_versions.source` ("claude"→Claude, "chatgpt"→ChatGPT, null→generic "AI" — never guessed). **Addressed feedback** shows **struck-through** with "✓ Addressed in vN →" below the content (links to that spine event); owner-dismissed items show "Won't action". A comment has no resolution column, so it's "addressed in v(N+1)" implicitly — derived from the version timeline (a later version was published after it). The feed opens scrolled to the current version (a slice of the previous round visible above, "↑ earlier in this huddle"). **Settled history (greyscale):** once a newer version exists, every version message **before the current** desaturates (`filter: grayscale(1) opacity(.65)`, incl. its avatar/AI-mark + thumbnail strip), so only the current version keeps its amber ✦ / purple vN; hovering one returns it to colour.
- **Feed item card** (the one component, `viewer/FeedItemCard.tsx`): a HORIZONTAL card — slide **thumbnail** left · content middle · **slide pill** top-right. Avatar = WHO; type icon + thumbnail = WHAT. Three types: **comment** (message-circle, teal; clean real-slide thumbnail), **requested slide** (square-plus, teal; a dashed-teal mini-slide rendered from its 3 inputs), **removal flag** (flag, red; the real slide greyed + X overlay, red card left-border). Pill is type-aware: comment/flag → "Slide N"; stub → "After slide N ↓" (goes *between* slides — never "Slide N"). Click selects the card (purple ring) and drives the deck peek. Thumbnails use the cheap path (scaled-iframe live render). Narrow screens: thumbnail stacks above the text. **Settled items (greyscale):** an **addressed or dismissed** item in a PAST round desaturates the whole card the same way (`filter: grayscale(1) opacity(.65)` — avatar, chips, thumbnail, text); **unaddressed/unresolved** items (no `addressedIn` and not dismissed — comments AND requested slides AND removal flags) keep their colour so live threads pop; the current round never mutes; **hover or selection** returns a muted card to colour. (The muted decision is computed in `DeckFeed`; the card takes a `muted` prop.)
- **Send to AI**: purple-outline split control (white fill, purple border + text) — label "✦ Send to AI · N" + chevron (clipboard fallback, copy MCP URL). Disabled = soft neutral pill "No feedback yet". Purple, not amber: it's an action you take (§2.2).
- **Comments / Feed button**: a quiet **bare teal icon + count** (speech-bubble + number) at rest — *not* a filled button, since it only toggles the panel. Light-green wash on hover; when the panel is **open** it fills solid green with a white icon + count — a clear ON state.
- **Share**: purple filled.
- **Thumbnail rail**: numbered thumbs; active = 2px purple border + light ring; teal corner count badges; stub = dashed teal "Requested"; "+" insert on hover between thumbs; sliver state shows dot-badges only.
- **Comments panel / feed**: white cards on the panel; author + relative time; owner hover-curation controls (36px dark-grey squares: pencil Edit, thumbs-down Dismiss, label beneath) — unchanged from the established curation design; dismissed = struck + "Won't send to AI · Restore".
- **Quote card** (feed): teal left border, slide micro-thumbnail, "Slide 4 · v2 · region" label; tap → deck peeks at that slide+version, region glowing.
- **Decision set**: teal "✓ Decision" badge · amber "✦ Queued for AI" chip · grey "edited by you" tag · resolution line in system copy.
- **AI post card**: amber avatar (✦), white card: "Deck v3 published · same link", change summary, actions (View changes · Open v3), credit line ("Incorporated decisions by Sara and Aisha").
- **Selection popover**: ink pill, white text: "＋ Start thread | ❝ Quote in composer".
- **Counter**: ink pill "4 / 12", bottom-centre.
- **Composer** (feed/mobile): quote chip (purple tint, removable) + input + purple send.

---

## 6. The surfaces

1. **Dashboard** — a page, not a canvas: cards on `#FAFAF8`, but the same pill header grammar. Leads with **Needs you** (owner's queue: approvals, AI revisions to review), then My huddles, then Shared with me. Inbox mental model.
2. **Huddle feed** — the conversation is the content layer: feed column centred, deck **peek** as the right floating panel, huddle list as the left rail. Same grammar, inverted priorities.
3. **Deck viewer** — the June redesign, with §3.3 applied. The slide is the stage; rail left (sliver default), comments/threads panel right, selection popover for anchoring.
4. **Claude queue** — modal panel over the scrimmed stage; included-by-default items with hover curation; **purple** split send (it's a Send-to-AI action — §2.2); footer promise: "Claude will post v4 into the huddle — same link, history kept, decisions credited."
5. **Client / guest view** — the agency's stage: their logo and name lead, SlideHuddle recedes to the footer ("Reviewed on SlideHuddle" — the viral-loop credit). Deck + one obvious comment box (no account wall to view) + Decisions log tab + review deadline. "3 reviewing", never "Huddlers".
6. **Mobile** — floating panels become **bottom sheets**; the feed is the home surface; composer thumb-reach; counter and catch-up chip persist. No hover states: curation controls appear on tap-hold.

---

## 7. Accessibility, motion, quality floor

Focus visible on every floating control (2px purple outline, offset 2). All floating surfaces ≥ 4.5:1 text contrast — the 1px border requirement (§3.2) exists partly because shadows fail on light slides. Keyboard: ←/→ slides · `T` rail · `C` panel · Esc closes top layer. Motion: 150–250ms ease, one orchestrated moment per transition (the inset), nothing ambient; `prefers-reduced-motion` collapses all of it to instant. Touch targets ≥ 40px on mobile sheets.

---

## 8. Copy rules (floating UI edition)

With little chrome, every word works harder. Buttons say what happens ("Send to AI · 2", "Open v3"), never "Submit". Counts live in the control they describe. Empty states direct ("No feedback yet — select anything on a slide to start a thread"). Errors say what happened and what to do; no apologies. System lines are quiet and factual ("Greg approved 2 decisions and sent them to AI · 9:40").

---

## 9. The Huddle-model runway (why this language scales)

The floating grammar maps one-to-one onto the conversation-first roadmap: today's comments panel **is** the feed panel (P3.1 swaps its data source); the deck peek on the huddle surface is the same panel component mirrored; quote cards, decision badges and AI post cards (§5) are the Phase-3/4 component set, specified now so the build matches; the rail's badge-sliver is the "team's fingerprints" persistence the anchor model needs. No throwaway UI between here and the full Huddle model.

---

## 10. Punch list from the 12 June design review (→ P1.1)

1. **Occlusion (must-fix):** implement §3.3 inset — currently the rail covers slide content in both reviewed screenshots. Acceptance: rail + panel open, full slide visible.
2. ~~**Amber restored to Send to AI**~~ — **superseded 2026-06-14.** Send to AI is **purple** (an action you take); amber is reserved for the AI's own voice — its posts, chips, and avatar. See §2.2.
3. **Z-index glitch on the recipient view**: deck title renders behind/through the brand pill — fix layering per §3.2 z-order.
4. **Brand-pill device icon**: remove (or give it a job and a tooltip).
5. **Persistence policy**: implement the rail sliver + always-on counter per §4.1 (replaces blanket auto-hide).
6. **Guest copy**: "3 reviewing" on client surfaces.
7. **Mobile**: bottom-sheet pattern (already P1.1 in the tracker).

---

*End of document. Pairs with: slidehuddle-mockups (v2, Floating Canvas edition) as the visual reference, and PROGRESS-TRACKER P1.1.*
