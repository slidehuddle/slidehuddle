# SlideHuddle — Behaviours Catalogue

> **Living document — update in the same change as any UI behaviour you build or alter (see house style).** This is the plain-language record of *every user-visible behaviour in the app as it stands today*, captured before the viewer's UX is transformed, so nothing subtle gets silently destroyed in the rebuild. If you change what an element looks like, says, or does, edit the matching entry here in the same commit.

*Created 2026-06-27 as a preservation checklist for the upcoming viewer transformation. Grounded in the code, not in memory — every entry names the file it came from. Where the code shows something odd or already-fixed, it's recorded as an **Observation**, not corrected.*

---

## How to read this

Each element is one short entry with the same fields:

- **Element** — what it is, in plain words.
- **Where** — the screen/area + the component file.
- **States** — the visual states it can be in.
- **Behaviour** — what each state looks like and does.
- **Copy** — user-facing text, quoted exactly.
- **Trigger** — what flips it between states.
- **Source** — file (and rough location).

### The colour language ("colour names the actor")

The app uses colour deliberately, so it's worth stating once:

- **Purple** (`#4A3FB5`, "brand") = *an action you take*, and *version numbers* (`v3`). Buttons you press, Share, Send-to-AI, the active-thumbnail border, version chips.
- **Teal / green** (`#0F6E56`, `#E1F5EE`) = *the team* — comments, requested slides, the "Huddlers" people cluster.
- **Amber** (`#854F0B`, `#FAEEDA`, `#EF9F27`) = *the AI's own voice* — its feed posts, its avatar mark, the "this deck was revised" banners. Amber is never used for a button you press.
- **Red / rust** (`#791F1F`, `#C2410C`, `#9A3412`, `#B42318`) = *removal & destructive* — flag-for-removal, delete, error banners.

### Two viewers exist right now

A deck can be shown by one of **two** viewers, chosen server-side ([viewer/page.tsx](../web/src/app/viewer/page.tsx)):

- **Floating viewer** ([FloatingViewer.tsx](../web/src/app/viewer/FloatingViewer.tsx)) — the **default**. Full-bleed slide, controls float in frosted "pill" clusters that tuck away while you read. Escape hatch: `?view=classic`. Server kill-switch: `FLOATING_VIEWER_DEFAULT`.
- **Classic viewer** ([SlideViewer.tsx](../web/src/app/viewer/SlideViewer.tsx)) — the older docked-panel layout, reached via `?view=classic`. **Per project memory, never edit SlideViewer.tsx.** It's documented here because it's still reachable.

There is also a **Feed** landing (`?view=feed`, [DeckFeed.tsx](../web/src/app/viewer/DeckFeed.tsx)) — default-on for design partners (`FEED_PARTNER_EMAILS`), which demotes the deck to a side "peek". Many controls are shared across all three.

A fourth way to *view* — not a fourth rendering — is the **feed↔deck spectrum** (`?view=spectrum`, **Slice 1**): a gated MODE of the floating viewer that brings the feed and the deck onto one resizable screen. It reuses the floating viewer's slide stage + the shared feed column ([FeedStream.tsx](../web/src/app/viewer/FeedStream.tsx), extracted from `DeckFeed`). URL-only for now — nobody lands on it without the param, so the default is unchanged. See **section J**.

---

# A. Feed (the conversation feed)

*The read-only conversation stream — an alternative landing for a deck, default-on for design partners. URL: `?view=feed`. The conversation is the content; the deck is demoted to a right-hand "peek". No composer here — you participate by opening the deck.*
**Source:** [DeckFeed.tsx](../web/src/app/viewer/DeckFeed.tsx), [FeedItemCard.tsx](../web/src/app/viewer/FeedItemCard.tsx), [VersionSpineEvent.tsx](../web/src/app/viewer/VersionSpineEvent.tsx), [feed-items.ts](../web/src/app/viewer/feed-items.ts)

### A1. Feed top bar
- **Where:** top of the feed. `DeckFeed.tsx` (TOP BAR block).
- **States:** signed-in · anonymous-with-count · anonymous-no-count.
- **Behaviour:** left frosted pill = purple SlideHuddle logo + dot, then a divider and the deck title (truncated). **No version chip** — the feed is cross-version, so a single version pill would mislead. Right frosted pill = the people indicator + account control + an **Open deck** button.
- **Copy:** "SlideHuddle"; the deck title; "Open deck"; "Sign in" (when signed out).
- **Trigger:** signed-in → real `HuddleAvatars`; anonymous with ≥1 reviewer → `ReviewingChip`; anonymous otherwise → `SharedDeckChip`. Account control is `AvatarMenu` when signed in, else a "Sign in" link.
- **Source:** `DeckFeed.tsx` ~lines 270–332.

### A2. Version spine — round backbone
- **Element:** each deck version is a full-width "round break"; the comments/requests/flags made during that round indent beneath it on a thread line.
- **Where:** centre column of the feed. `DeckFeed.tsx` (rounds map) + `VersionSpineEvent.tsx`.
- **States:** opening round (v1) · later round (v2+) · current round · past round.
- **Behaviour:** rounds run **oldest-first**, top→bottom like a transcript. The feed **opens scrolled to the current version** (placed ~15% from the top so a sliver of the prior round shows above). Past rounds desaturate (see A4); the current round keeps full colour. **Within a round, items cluster by SLIDE** (the design model's middle level: version → slide → time, 2026-07-02): slide order first — a requested slide sorts into the gap it points at ("after slide N" lands between slide N's and slide N+1's feedback) — then chronological within a slide. Previously the round was purely chronological, which put a slide-4 comment after an "after slide 8" request.
- **Trigger:** version list + timestamps (`buildVersionSpine`). Items fall into the round whose version timestamp precedes them; ordered within it by `slideAnchor` (comment/flag → slide index; stub → position − 0.5), then time.
- **Source:** `DeckFeed.tsx` ~lines 363–442; `feed-items.ts` `buildVersionSpine`.

### A3. "Claude published vN" version event ⭐ *(explicitly confirmed)*
- **Element:** the AI's "I published a new version" post — the headline of each non-opening round.
- **Where:** `VersionSpineEvent.tsx`.
- **States:** opening (v1) · later (v2+) · current (highlighted) · past (greyed).
- **Behaviour:**
  - **v1 "opening":** a person avatar (the starter) + one line: **"{Name} started this huddle"** · title · "N slides" · relative time.
  - **v2+:** the AI mark (see G7) + a headline **"🎉 {AI} published v{N}"** — the "🎉 {AI} published" is amber (`#854F0B`), the **`v{N}` is purple** (`#4A3FB5`) — then " · N slides".
  - **Current version:** a subtly purple-tinted highlight band (`#f1eff9`) **and** a white-on-purple **"current"** pill next to the version number.
  - **Sub-line:** "requested by {Name}" + ", addressed N comments, M requests, K removals" (only the non-zero parts) + relative time.
  - **"see changes ▸":** present only when this version resolved something; expands to a list of resolved items, each "✓ {label}".
  - Below the text, a lazy thumbnail strip of *that version's* slides (clicking a thumb peeks that slide).
- **Copy:** "{Name} started this huddle"; "🎉 {AI} published v{N}"; "current"; "requested by {Name}"; "addressed {N comments, M requests, K removals}"; "see changes ▸" / "see changes ▾"; "✓ Requested: {title}" / "✓ Removal: slide N" / "✓ Comment: {first 48 chars…}". {AI} resolves to **"Claude"**, **"ChatGPT"**, or generic **"AI"** (never guessed).
- **Trigger:** `isOpening` (v1), `isCurrent` (latest), `source` column (which AI), the `addressed` summary computed in `DeckFeed`.
- **Source:** `VersionSpineEvent.tsx` (whole file); labels from `DeckFeed.tsx` `labelForItem`.
- **Observation:** per the tracker, the headline used to be "✦"; it's now "🎉", and the AI mark uses the real Claude/ChatGPT logo (see G7).

### A4. Past-round greyed items — achromatic history ⭐ *(explicitly confirmed; one-way rule 2026-07-04)*
- **Element:** "settled history" treatment — past, resolved conversation desaturates so live threads pop.
- **Where:** feed cards + version events. `DeckFeed.tsx` (`muted` prop) + `FeedItemCard.tsx` + `VersionSpineEvent.tsx`.
- **States:** default (colour) · muted (greyed) · hover/selected (dim lifts — **greys stay**).
- **Behaviour:** a **past-round version event** always desaturates (`grayscale(1) opacity(0.65)`). A **feed item card** desaturates **only if it's in a past round AND is addressed or dismissed** — unaddressed comments, requests, *and* flags stay in colour even in past rounds. The **current round never mutes.** **Hover/selection lift the dim for readability but never restore hue** — settled things may never wear colour again (design-system §2.5 achromatic-history rule; the pre-2026-07-04 colour-on-hover restore is retired). *The muting condition itself is unchanged.*
- **Trigger:** `muted = !round.isCurrent && (item.addressedIn != null || isItemDismissed(item))`; version events keyed off `isCurrent`. Hover/selected via `[filter:grayscale(1)_opacity(1)]` / `[filter:grayscale(1)]` (grayscale kept).
- **Source:** `FeedStream.tsx` (`muted` computation); `FeedItemCard.tsx` (card class); `VersionSpineEvent.tsx` (event class).

### A5. Slide-anchored clusters + feedback rows *(restructured 2026-07-05, Slice B — replaces the flat per-item cards)*
- **Element:** within each round, feedback groups into **one cluster per slide**: a **header** — the slide's thumbnail declared ONCE as the anchor (168px, slightly larger than the old per-card 140px), **"Slide N · {title}" as plain text** (title = the slide's first heading, best-effort; no pill), and a change count ("2 comments · 1 removal") — with the items **falling out beneath it on a quiet connector line** as rows. A **requested slide is its OWN cluster at its position**: the dashed-teal "Requested" preview IS its identity (header text "Requested slide · after slide N" / "· before slide 1", plain text), its body as the row beneath.
- **Where:** indented under each round. `FeedStream.tsx` (clustering + headers), `FeedItemCard.tsx` (`layout="row"`).
- **Row anatomy:** a **bare type ICON in the gutter** (speech bubble = comment, flag = removal, plus-square = requested; the kind's colour when live, grey when settled — §2.5: pills are for status/interaction, not metadata; the old type chips and slide pills are gone from the feed) · avatar + name + tags + relative time + "· edited" · the text. A comment shows the **owner-edited text when one exists** (C3); a flag shows the reason or "No reason given.".
- **States (per row):** default · hover (soft wash) · selected (purple ring) · muted (see A4) · struck (addressed/dismissed — the stub cluster's dashed header thumbnail also greys then) · (spectrum, owner, current round) hover-curation / editing — see **J7**. The signed-in viewer's OWN rows show their account-identity avatar (person icon — G4's `self` rule; no green dot on content surfaces, G9). *(The current-round purple card outline retired with the boxed cards; the round's position under the current version event carries "live".)*
- **Behaviour:** clicking a **row** rings it and drives the deck peek/stage to that item (unchanged from the old cards). Clicking a **cluster's header thumbnail** peeks that slide (current version); clicking a **stub cluster's dashed thumbnail** selects the request itself. Ordering is unchanged (A2: slide order first, chronological within a slide; stubs slot at their position); clusters simply render that existing grouping. Muting rules, curation, timestamps all preserved per row.
- **Copy:** header "Slide {N} · {title}" / "Requested slide · after slide {N}" / "· before slide 1"; count "{N} comment(s)( · {N} removal(s))"; gutter icon tooltips "Comment" / "Requested slide" / "Flag for removal"; author tags "(you)", "(owner)", "(you · owner)"; "· edited"; "Untitled slide"; "No reason given."; preview label "Requested"; "A teammate" (missing author email).
- **Trigger:** clusters = consecutive runs of the round's already-slide-sorted items (`buildSlideClusters`); `selected` = the row's key matches selection.
- **Source:** `FeedStream.tsx` (`buildSlideClusters`, `clusterCountText`, `slideTitles`, cluster render); `FeedItemCard.tsx` (`layout="row"`, `TypeIcon`, exported `RealSlideThumb`/`StubPreviewThumb`); `nameFromEmail` at the bottom. *(The boxed `layout="card"` variant still exists in `FeedItemCard.tsx` but no surface renders it.)*

### A6. Struck addressed/dismissed comments + "Addressed in vN" ⭐ *(explicitly confirmed)*
- **Element:** the resolution state of a feed item.
- **Where:** inside each feed card. `FeedItemCard.tsx`.
- **States:** open · addressed (a later version handled it) · dismissed ("won't action").
- **Behaviour:** when addressed **or** dismissed, the row's body renders **struck-through and dimmed** (`line-through opacity-60`), and the item goes **fully achromatic** (§2.5, 2026-07-04): the gutter type icon flips grey and the stub cluster's dashed-teal header thumbnail desaturates. Below the body:
  - addressed → a **quiet grey** link **"✓ Addressed in v{N}"** that jumps the feed to that version (tooltip "Jump to vN"); the jump arrow **"→" appears on hover and keyboard focus** (underline too). *(Was a teal always-armed link — achromatic-history restyle 2026-07-04.)*
  - dismissed → plain muted text **"Won't send to AI"** (no link). *(Was "Won't action" — unified with the floating panel's provider-neutral curation wording, founder decision 2026-07-02; see I3.)* In the spectrum, the deck **owner** additionally gets **"· Restore"** on a current-round dismissed card (J7).
- **Copy:** "✓ Addressed in v{N}" (+ "→" on hover/focus); "Won't send to AI" (+ " · Restore" for the owner in the spectrum).
- **Trigger:** `addressedIn` is derived — a comment from a past round is treated as "addressed in v(next)"; requests/flags use their `resolved_at`. `dismissed` is the per-item owner flag.
- **Source:** `FeedItemCard.tsx` ~lines 317–380; `feed-items.ts` `addressedRefFor` + comment-addressing logic ~lines 247–258.

### A7. "Earlier in this huddle" + "Feed opens here" markers
- **Where:** around the current round, when older content sits above it. `DeckFeed.tsx`.
- **Behaviour:** a pill button **"↑ earlier in this huddle"** scrolls to the top; a purple marker **"▾ Feed opens here · since vN"** labels where the feed auto-opened.
- **Copy:** "↑ earlier in this huddle"; "▾ Feed opens here · since v{N}".
- **Trigger:** only shown when `currentRoundIndex > 0`.
- **Source:** `DeckFeed.tsx` ~lines 379–413.

### A8. Arrival ribbon ("Since you were here")
- **Where:** top of the feed column. `DeckFeed.tsx`.
- **Behaviour:** a purple-tinted ribbon summarising new comments since the viewer's last visit, with up to three names.
- **Copy:** "**Since you were here:** {count} new comment" / "…new comments" + " · {name, name, name}".
- **Trigger:** `arrivalActivity` (returning signed-in viewer with new comments); never for first-time/anonymous viewers.
- **Source:** `DeckFeed.tsx` ~lines 338–358; logic in `arrival-activity.ts`.

### A9. Deck-peek panel ⭐ *(explicitly confirmed)*
- **Element:** the right-hand "peek" — a scaled live render of the selected slide + its stats + a way into the deck.
- **Where:** right column of the feed (hidden below the `lg` breakpoint). `DeckFeed.tsx` (DECK PEEK block).
- **States:** loading · loaded · (per-slide) has-comments / has-flags / has-requests.
- **Behaviour:** shows a 288px-wide sandboxed iframe of the selected slide; clicking any feed card changes which slide it shows. Stat rows appear beneath. The **"Open slide N"** button deep-links into the deck at that slide (carrying `?from=feed&slide=N`).
- **Copy:** heading "Deck peek"; sub-line "Slide {n} of {count} · v{version}" (or just "v{version}"); "Loading preview…"; stat rows "{n} comments" / "{n} comment", "{n} flagged for removal", "{n} requested here"; button "Open slide {n}"; helper text **"Click any item to peek its slide. The feed is read-only — open the deck to comment, request a slide, or flag one."**
- **Trigger:** `safePeek` = the selected/active slide index; stats from per-slide aggregation.
- **Source:** `DeckFeed.tsx` ~lines 463–530.
- **Observation:** the comments stat always renders (even "0 comments"); flags and requests rows appear only when their count > 0.

### A10. Feed empty state
- **Where:** feed column when there's no conversation. `DeckFeed.tsx`.
- **Copy:** "No conversation yet" / "Open the deck to leave the first comment, request a slide, or flag one for removal — it'll show up here." + an "Open deck" button.
- **Trigger:** `hasConversation` is false (no comments/stubs/flags).
- **Source:** `DeckFeed.tsx` ~lines 444–459.

---

# B. Slide view (the deck itself)

*The deck viewer. Default = the floating viewer; classic is the `?view=classic` fallback. Both render the active slide as a scaled, sandboxed iframe and share the same controls.*
**Source:** [FloatingViewer.tsx](../web/src/app/viewer/FloatingViewer.tsx), [SlideViewer.tsx](../web/src/app/viewer/SlideViewer.tsx)

### B1. The slide stage
- **Element:** the rendered slide, scaled to fit ("letterboxed") on a light grey stage.
- **Where:** centre of both viewers.
- **States:** real slide · requested-slide card (stub) · inset (a side panel is open) · no-slides.
- **Behaviour:** the slide scales to contain the deck's aspect ratio. **Floating viewer:** when the thumbnail strip and/or comments panel open, the slide **shrinks and shifts** into the space beside them (it's never covered) — gliding over ~200ms (or snapping under "reduce motion"). **Classic viewer:** the comments panel docks as a flex sibling, shrinking the stage. A requested slide shows the stub card (see C-section) instead of the iframe.
- **Copy:** empty state "No slides to display."
- **Trigger:** active display item; `stripOpen` / `commentsPanelOpen` drive the floating inset.
- **Source:** `FloatingViewer.tsx` ~lines 730–806; `SlideViewer.tsx` ~lines 835–894.

### B2. Navigation arrows + slide counter
- **Where:** side margins + bottom-centre of the stage. Both viewers.
- **States:** enabled · disabled (first/last) · hidden (floating: when that side's panel is actually **showing** — the right arrow returns whenever the comments panel isn't rendered, e.g. folded in the spectrum's split/feed modes, or a requested-slide card is active).
- **Behaviour:** round frosted ◀ / ▶ buttons; at the first/last item they fade to invisible (`disabled:opacity-0`). Arrow keys ← / → also navigate. A black counter pill sits bottom-centre.
- **Copy:** counter "{n} / {total}", with " · requested slide" appended when the active item is a requested slide. Arrow aria-labels "Previous slide" / "Next slide".
- **Trigger:** `safeIndex`; keyboard listener on the window.
- **Source:** `FloatingViewer.tsx` ~lines 1041–1077; `SlideViewer.tsx` ~lines 955–982.

### B3. Floating controls — collapse / reveal
- **Element:** the frosted "pill" clusters (top-left deck zone, top-right actions) that tuck away while reading.
- **Where:** floating viewer only. `FloatingViewer.tsx`.
- **States:** expanded (full controls) · collapsed (minimal resting set) · pinned (never collapses).
- **Behaviour:** starts expanded, then **collapses after 6 seconds** of no interaction. **Persistent** at rest: logo, slides toggle, Comments, Share, the arrows, the counter, and the left rail sliver. **Collapse away** at rest: version chip + history, avatar/Sign-in, Send-to-AI, the settings gear, the one-time hint. **Re-expands** when the cursor comes within 90px of the top edge, on a top-edge touch, or on keyboard focus. Won't collapse while a menu is open, a control is hovered/focused, or bars are pinned. Honours "reduce motion" (snaps, no animation).
- **Trigger:** `IDLE_FADE_MS` timer; `isHeldOpen()`; top-edge pointer/touch/focus.
- **Source:** `FloatingViewer.tsx` ~lines 385–522, 708–728.

### B4. One-time "controls hide" hint
- **Where:** floating viewer, first visit only. `FloatingViewer.tsx`.
- **Copy:** "These controls tuck away while you read — move your cursor to the top to bring them back."
- **Trigger:** shown once, then `localStorage` flag `sh-floating-hint-seen` suppresses it; auto-fades after ~6s.
- **Source:** `FloatingViewer.tsx` ~lines 507–522, 1167–1178.

### B5. "Pin toolbars" — in the account avatar menu *(the stray settings gear RETIRED 2026-07-05, Slice C)*
- **Where:** the account avatar menu, top-right (G2). The floating gear that used to sit alone at the bottom edge (bottom-left; bottom-right in the spectrum) is **removed** — it held exactly one setting, and §2.5 "position answers scope" puts user-level settings behind the user's identity, not floating in space. `AvatarMenu.tsx` (`viewerSettings` prop) + `FloatingViewer.tsx` (passes `pinned`/`togglePin`).
- **Behaviour:** a checkbox item between "My huddles" and "Sign out"; when checked, the floating bars stop tucking away. Viewer-only — the dashboard/feed avatar menus don't show it.
- **Copy:** menu item "Pin toolbars" / sub-text "Keep the floating bars from tucking away."
- **Trigger:** `pinned` state; `togglePin`; `viewerSettings` passed only by the floating viewer.
- **Caveat:** anonymous link-holders (no avatar menu) no longer have a pin control — hover/`T` still reveal the bars; acceptable until a need shows up.
- **Source:** `AvatarMenu.tsx`; `FloatingViewer.tsx` (top-right cluster).

### B6. Rail sliver (left edge "fingerprints") ⭐
- **Element:** the always-visible collapsed form of the thumbnail rail — a slim strip of teal dots, one per commented slide.
- **Where:** left edge of the floating stage. `FloatingViewer.tsx`.
- **States:** has-comments (teal dots, up to 12) · no-comments (a faint grip mark).
- **Behaviour:** hover, tap, or press **`T`** opens the full thumbnail rail; the sliver hides while the full rail is open.
- **Copy:** aria "Open the slides rail"; tooltip "Slides (T)".
- **Trigger:** `commentedSlides`; `stripOpen`.
- **Source:** `FloatingViewer.tsx` ~lines 1223–1262.

### B7. Comments toggle — *floating viewer's RETIRED 2026-07-05 (Slice C); classic keeps its pill*
- **Element:** the old top-bar "💬 N" toggle for the comments panel.
- **Floating viewer:** **removed, not relocated** — its job dissolved: in the spectrum the feed IS the comments surface; in deck view per-slide counts live on the thumbnails and the panel, and the panel now opens from the slide's **"+" menu → "Add a comment"** (B13), the arrival banner's "Catch up" (B8), and the comment nudge's "View" (B12). The panel's own **"Close comments" ✕** (C1) closes it, so nothing is orphaned.
- **Classic viewer (frozen, unchanged):** a rounded pill labelled "Comments" with a count badge; teal at rest, solid green when open; hidden on requested slides. `SlideViewer.tsx` ~lines 901–940.
- **Trigger (classic):** `commentsOpen`; per-slide count.

### B8. Arrival banner ("N comments since you were here")
- **Element:** a returning signed-in viewer's "catch up" nudge.
- **Where:** top-centre of the floating stage. `ArrivalBanner.tsx`.
- **States:** shown · dismissed.
- **Behaviour:** amber frosted pill; "Catch up" opens the comments panel (jumping to a real slide first if a requested slide is active); the × dismisses it for the session.
- **Copy:** "**{who}** added {count} comment since you were here" / "…comments"; "Catch up". {who} = "{Name}", "{A} and {B}", or "{A}, {B} and N others"; falls back to "Someone".
- **Trigger:** `arrivalActivity` present + comments can open.
- **Source:** `ArrivalBanner.tsx`; gated in `FloatingViewer.tsx` ~lines 981–993.

### B9. Live "deck was revised" banner
- **Element:** an out-of-band-revision prompt — never auto-yanks the page.
- **Where:** floating: top-centre, below the arrival banner. Classic: a docked bar at the top.
- **Behaviour:** every 12s the viewer polls for a newer version; when one appears it **prompts** (so a half-typed comment is never lost). Clicking the action re-fetches and remounts the viewer on the new version. Amber = the AI's revision event; the action button is purple.
- **Copy:** **Floating:** "**This deck was revised** — now on v{N}" + button "Load v{N}". **Classic:** "✨ This deck was just revised — version {N} is ready." + button "Show it".
- **Trigger:** `useDeckVersionWatch` / the classic poll detecting `version > viewingVersion`. (Classic only surfaces the banner if comments are open; otherwise it silently refreshes.)
- **Source:** `FloatingViewer.tsx` ~lines 995–1039; `SlideViewer.tsx` ~lines 109–149, 768–789; `useDeckVersionWatch.ts`.

### B10. Load-error & deck-failure banners
- **Where:** classic viewer. `SlideViewer.tsx`.
- **States:** whole-deck failure · partial-dataset failure.
- **Behaviour:** a red alert. Whole-deck failure replaces the slide entirely; a partial failure shows a thin bar listing what didn't load.
- **Copy:** "Couldn't load this deck — try refreshing."; "Couldn't load {comments / requested slides / removal flags / version history} — try refreshing." (joined with "and").
- **Trigger:** `deckLoadFailed`; `loadErrors`.
- **Source:** `SlideViewer.tsx` ~lines 711–739, 756–818.
- **Observation:** the floating viewer doesn't render these dataset-load-error banners — it shows "No slides to display." for an empty/failed deck.

### B11. "Viewing sample deck" / historical-version notices
- **Where:** classic viewer top (via `page.tsx`).
- **Copy:** "Viewing sample deck"; "You're viewing version {N} — a past version of this deck." + "Back to current version (v{current})".
- **Trigger:** sample source; `viewingHistorical`.
- **Source:** `viewer/page.tsx` ~lines 561–579.

### B12. In-session comment nudge — live "you got a comment" toast ⭐ *(built 2026-07-04)*
- **Element:** ONE transient toast, **bottom-right** (founder placement call; the settings gear that used to sit there is retired, B5), shown when a **teammate's** comment lands via realtime while you're in the deck. Complements the cross-session arrival banner (B8) — this is the "we're both here right now" signal.
- **Where:** floating viewer (all its shapes except spectrum feed mode). `CommentNudge.tsx`; wiring + suppression in `FloatingViewer.tsx`; the event via `useDeckComments`'s `onRemoteInsert`. Classic viewer: none (frozen).
- **States:** appearing — fades + rises ~200ms (skipped under reduced motion) · showing — avatar(s) + text + teal **View** + grey ✕; **dissolves after ~7s**; hovering pauses the countdown · coalesced — a second/third comment arriving while one shows MERGES into the same toast and resets the timer (**never more than one toast** — they cannot stack over the slide) · gone — timer, ✕, or View.
- **Behaviour:** the avatar is the shared `Avatar` (G3's fill/outline language applies). **View** jumps the deck to the newest comment's slide, opens the comments panel there, reveals the chrome, and dismisses the toast. ✕ dismisses instantly. Screen-reader: `role="status"`/`aria-live="polite"`.
- **Copy (verbatim):** single — "**{Name}** commented on **slide {N}**" + "“{comment, truncated at 64 chars}”" · coalesced — "**{n} new comments** from {A} and {B}" / "from {A} and {n−1} others" · buttons "View", ✕ (aria "Dismiss").
- **When it stays quiet:** your own comments (they echo back but you typed them) · **spectrum feed mode** (the card already pops into the visible live feed — no double signal) · the comments panel is open **on that same slide** (the comment appears right there) · historical/read-only views (no realtime) · anonymous viewers (no comment data reaches them).
- **Trigger:** realtime INSERT on the viewed version from another user → `onRemoteInsert` → suppression check (via a ref — flags are computed later in the render) → coalescing append. Analytics: `comment_nudge_shown` {deck_id, slide_index}, `comment_nudge_clicked` {deck_id}.
- **Source:** `CommentNudge.tsx` (whole file); `FloatingViewer.tsx` (nudge state + `nudgeCtxRef` + `viewNudge`); `useDeckComments.ts` (`onRemoteInsert`).

### B13. The slide-scope "+" menu ("This slide") ⭐ *(built 2026-07-05, Slice C)*
- **Element:** ONE purple circle on the slide (bottom-right corner, where the old "…" flag control sat), **44px, ALWAYS visible** (no hover-reveal) with a **deep soft shadow** (`0 10px 30px rgba(0,0,0,0.28)`) so it reads as floating OVER the presentation, carrying a **white round speech bubble with a plus at its lower-right** *(founder calls 2026-07-05, from a mockup round + two sizing/presence refinements: the bare 32px hover-revealed "+" read too generic, too small, and too hidden; the bubble says "add to the conversation about this slide")*. Hover: slightly darker purple + a gentle scale-up. It opens a small menu **labelled with its scope**: an uppercase "THIS SLIDE" eyebrow over three items — **Add a comment · Flag for removal · Request a slide after this**. Slide-scope actions live ON the slide (§2.5 "position answers scope"), not in the global chrome.
- **Where:** floating viewer, real slides only, stored non-orphan decks, not on historical views. `SlideActionsMenu.tsx`; wired in `FloatingViewer.tsx`. Classic viewer: unchanged (keeps its "…" flag control, C6).
- **States:** always visible · hover (darker + slight scale) · menu · flag view · request view. Reopening always starts at the menu.
- **Behaviour — every item reuses an EXISTING path, no new write features:** *Add a comment* → opens the floating comments with the composer **already focused, cursor ready** (C2 — two clicks total: bubble → Add a comment → type) and reveals the chrome. *Flag for removal* → swaps the popover to the shared `FlagPanel` (the exact C6 flow: sign-in prompt / reason form / existing-flag view with "Remove flag"; the item reads "Flagged for removal…" when a flag exists). *Request a slide after this* → swaps to the shared `InsertStubForm` (C9) and inserts at position {this slide + 1}, focusing the new stub card (same as the rail's "+", D3).
- **Copy:** button title "This slide", aria "This slide — add a comment, flag for removal, or request a slide after it"; eyebrow "THIS SLIDE"; items "Add a comment" / "Flag for removal" (or "Flagged for removal…") / "Request a slide after this".
- **Trigger:** `isStored && !readOnly && !isOrphanDeck`; per-action gates (`canFlag`, `canInsert`) handled inside the shared panels (sign-in prompts).
- **Source:** `SlideActionsMenu.tsx` (whole file); `SlideFlagControl.tsx` (`FlagPanel`, shared); `InsertStubForm.tsx` (shared); `FloatingViewer.tsx` (wiring).

### B14. "{Name} is viewing the deck" — the join toast ⭐ *(built 2026-07-05, rides the presence system)*
- **Element:** ONE transient toast, bottom-right (the same slot as the comment nudge, B12), shown when a signed-in teammate **opens the deck while you're in it** — presence's proactive half: the rail dot (G9) answers "who's here?" if you look; this tells you the moment company arrives.
- **Where:** the floating viewer (all shapes). `PresenceNudge.tsx`; join detection + suppression in `FloatingViewer.tsx` (diffs `useDeckPresence`'s live set). Classic viewer: none (frozen). *In-session only — notifying people who AREN'T in the deck (email/push) is the P5.1 notification system, not this.*
- **States:** appearing (fade + rise, skipped under reduced motion) · showing — avatar(s) + text + ✕, **dissolves after ~5s** (shorter than the comment nudge — there's nothing to act on, so no button), hover pauses · coalesced — simultaneous joiners merge ("Rita and Jo are viewing the deck"; never a stack) · gone.
- **When it stays QUIET (the guardrails):** your own arrival — the roster already present when you open the deck produces **zero** toasts (first-sync + 5s settle window) · the same person within **5 minutes** (refreshes and version hops rejoin the room within seconds) · yourself · anonymous viewers (never announced — G9's privacy rule) · while a **comment nudge is showing** (comments win the shared slot; an arriving comment toast also clears a showing join toast — the two can never stack).
- **Copy (verbatim):** "**{Name}** is viewing the deck" · coalesced "**{A} and {B}** are viewing the deck" / "**{A} and {N} others** are viewing the deck" · ✕ (aria "Dismiss"). Screen-reader: `role="status"`/`aria-live="polite"`.
- **Trigger:** presence sync adds a user id not in the previous sync (post-settle, post-debounce) → toast. Analytics: `presence_nudge_shown` {deck_id, joined}.
- **Source:** `PresenceNudge.tsx` (whole file); `FloatingViewer.tsx` (`nudgeViewers`, `prevOnlineRef`, `presenceSettledAtRef`, `lastJoinNotifiedRef`; comments-win clearing in `onRemoteComment`).

### B15. Undo — Ctrl+Z / ⌘Z ⭐ *(built 2026-07-05, founder-requested)*
- **Element:** the OS undo shortcut reverses **your** last action in the viewer — a session-local stack (up to 20 steps), popped one at a time.
- **Where:** the floating viewer (all shapes). `FloatingViewer.tsx` (`undoStackRef`, the `*U` wrapped handlers, the keydown branch); hooks gained id returns + a `{track:false}` option. Classic viewer: none (frozen).
- **What it reverses:** add comment ↔ delete · delete your comment ↔ re-create · flag ↔ remove flag · delete your flag ↔ re-create · request a slide ↔ delete the request · delete a request ↔ re-create · (owner) dismiss/restore ↔ flip back · (owner) edit-sent-text ↔ previous text. Every inverse runs through the SAME RLS-checked write paths — undo can never do something you couldn't do by hand.
- **Keys:** Ctrl+Z (Windows/Linux) or ⌘Z (Mac). **Not while typing** — focus in an input/textarea leaves the browser's native text-undo alone. Shift/Alt chords (redo etc.) are ignored — **no redo in v1**.
- **Feedback:** a small dark toast bottom-centre says what happened ("↶ Comment removed" / "↶ Comment restored" / "↶ Flag removed" / "↶ Requested slide restored" / "↶ Dismiss undone" / "↶ Edit undone") — the undone thing may be on another slide, so the change is named. Auto-fades ~2.2s.
- **Honest limits (by design):** undo is YOURS and THIS TAB's — it can't reverse a teammate's action and doesn't survive a reload. A restored item is a **re-creation**: new id, new timestamp ("just now"), not byte-perfect history. Undo re-creates pass `{track:false}` so undo cycles never inflate the Gate-G1 `feedback_added` numbers.
- **Trigger:** each wrapped action pushes its inverse; the shortcut pops the latest. A popped inverse that fails server-side (e.g. the item was already gone) logs and shows no change.
- **Source:** `FloatingViewer.tsx` (stack, wrappers, keydown, toast); `useDeckComments.ts` / `useDeckFlags.ts` / `useDeckStubs.ts` (id returns + `opts.track`).

---

# C. Comments & curation

*Comments, requested slides, and removal flags — and the deck owner's ability to curate what's sent to the AI. The owner curation controls are the most behaviour-rich part of the app.*
**Source:** [CommentsPanel.tsx](../web/src/app/viewer/CommentsPanel.tsx), [StubSlideView.tsx](../web/src/app/viewer/StubSlideView.tsx), [SlideFlagControl.tsx](../web/src/app/viewer/SlideFlagControl.tsx), [StubFieldsForm.tsx](../web/src/app/viewer/StubFieldsForm.tsx), [InsertStubForm.tsx](../web/src/app/viewer/InsertStubForm.tsx)

### C1. Comments panel — the floating cards (and the classic list) *(floating skin redesigned 2026-07-05, founder mockup round)*
- **Where:** docked sidebar (classic) or FLOATING CARDS over the right of the slide (floating viewer). `CommentsPanel.tsx`; the wrapper in `FloatingViewer.tsx`.
- **Floating (Google-Slides-like):** **no container box, no header** — each comment is its own white card with a soft shadow (`0 4px 16px rgba(0,0,0,0.13)`), floating directly over the stage with the slide showing through the gaps; the flag event keeps its rust-tinted card in the flow. Orientation comes from the slide itself (and, in split/feed, from the feed scrolling to the slide's cluster) — the old "Slide N + count/flagged pills" header is gone. A small **ghost ✕** floats at the top of the column; **Esc** also closes (B-level handler; popovers and the composer own their Esc first). New comments append at the bottom and the column scrolls internally; after posting, the list scrolls to the new comment.
- **Classic (unchanged):** full header ("Slide N" + count/"requested"/"flagged" pills + ✕), bordered list.
- **States:** has-comments · empty · requested-slide · flagged · read-only · orphan · signed-out (the read-only/orphan/signed-out footers render as floating cards in the floating skin).
- **Copy:** empty "No comments on this slide yet."; requested-slide note "This slide hasn't been built yet. Comments open once it's a real slide."; "More" / "Less"; classic header "Slide {N}" + pills.
- **Source:** `CommentsPanel.tsx` (header branch + `cardClass`), `CommentBody`; wrapper + Escape in `FloatingViewer.tsx`.

### C2. Comment composer *(floating skin redesigned 2026-07-05: auto-focus + keyboard-first)*
- **States:** classic always-open form · floating collapsed-"Add a comment" card → expanded composer card (focus ring) · posting · disabled (empty).
- **Behaviour — floating:** entering via the slide's **"+" menu → Add a comment** opens the composer **already focused, cursor ready** (no second click — `composeNonce`); reading entry points (arrival banner "Catch up", comment nudge "View") open the panel with the composer collapsed. **Enter sends · Alt+Enter makes a new line** (inserted manually — browsers don't natively; founder refinement 2026-07-05, was Shift+Enter) **· Esc discards the draft and closes the composer (Esc with an empty composer closes the whole surface).** **After posting, the composer STAYS open, empties, and refocuses — ready for the next comment** (founder refinement; was collapse-on-send); the list scrolls to the new comment. A "Send" button remains for mouse users; **no keyboard-hint copy** (founder call — it cluttered the card). **Classic:** a persistent textarea + "Send", unchanged.
- **Copy:** placeholder "Add a comment…"; floating "Send" / "Sending…"; collapsed card "Add a comment"; classic "Send" / "Posting…".
- **Source:** `CommentsPanel.tsx` (composer + `composeNonce` effect); `FloatingViewer.tsx` (`composeNonce` bump in the "+" menu wiring).

### C3. Owner curation — Edit / Dismiss a comment ⭐ *(explicitly confirmed)*
- **Element:** the deck owner's hover controls to shape what reaches the AI.
- **Where:** on each comment, owner only. `CommentsPanel.tsx`.
- **States:** default · hover (controls fade in) · editing · dismissed · edited.
- **Behaviour:** hovering a comment reveals two dark icon buttons (Edit, Dismiss) over a left-to-right white fade so the comment's start stays readable. **Edit** opens an inline textarea that changes *only what's sent to the AI* — the author's original text is untouched — and the comment then carries a quiet "· edited" tag. **Dismiss** strikes the comment through, dims it (`opacity-60`), and shows "Won't send to Claude · Restore". **Collaborators never see these controls.**
- **Copy:** the recipient name is a prop (`aiName`) — the **floating** viewer says **"AI"**, the **classic** viewer keeps **"Claude"** (founder decision 2026-07-02; see I3). Edit helper "Changes what's sent to {AI|Claude} — the original comment won't change."; Save/Cancel; tag "· edited" (tooltip "The owner edited what's sent to {AI|Claude}"); dismissed line "Won't send to {AI|Claude}" + "Restore"; button aria/labels "Edit what's sent to {AI|Claude}" / "Dismiss — won't send to {AI|Claude}" (with tiny "Edit"/"Dismiss" labels in the classic viewer; icon-only in the floating one).
- **Trigger:** `canCurate` (= owner, not read-only, stored deck); hover via the `group` class; `dismissed` / `owner_edited_body` flags. **These decisions persist across rounds** — they're stored on the row and reapplied every load (and feed the AI prompt identically via `selectCuratedFeedback`).
- **Source:** `CommentsPanel.tsx` ~lines 451–601; gating in `SlideViewer.tsx`/`FloatingViewer.tsx` (`canCurate`).

### C4. Delete your own comment
- **Where:** on your own comments, when you can comment. `CommentsPanel.tsx`.
- **Copy:** "Delete".
- **Trigger:** signed-in author of a non-dismissed comment (`user_id === currentUserId`).
- **Source:** `CommentsPanel.tsx` ~lines 515–525.

### C5. Removal-flag event in the comments list
- **Where:** inline in the comments list, in time order. `CommentsPanel.tsx`.
- **States:** active · dismissed · edited.
- **Behaviour:** a rust-coloured block with a trash icon, "Flagged for removal", the reason, and "by {name}". **The person who RAISED the flag gets a "Delete" link** (floating viewer, 2026-07-05 — mirrors "Delete" on your own comment; one click removes the removal request; RLS restricts delete to the flagger). Owner gets a **Dismiss** hover control (no Edit — a flag is just a removal note); dismissed shows "Won't send to {AI} · Restore" and strikes the reason. *(An owner deleting a DIFFERENT person's flag isn't offered — `removeFlag` is RLS-flagger-only; the owner's tool for others' flags is Dismiss. A true owner-delete would need a server-action/RLS change.)*
- **Copy:** "Flagged for removal"; "by {name}"; "· edited"; flagger "Delete"; "Won't send to {AI|Claude}" + "Restore"; Dismiss aria "Dismiss — won't send to {AI|Claude}". (Same `aiName` prop as C3: floating "AI", classic "Claude".)
- **Source:** `CommentsPanel.tsx` ~lines 300–424.

### C6. Slide flag-for-removal control ("…" menu) — *CLASSIC-only since 2026-07-05 (Slice C)*
- **Element:** the subtle "…" on a real slide to flag it for removal. **In the floating viewer this standalone control folded into the slide's "+" menu (B13)**; the classic viewer keeps the "…" unchanged.
- **Where:** top-left of the slide (classic). `SlideFlagControl.tsx`.
- **States:** hidden-until-hover · not-signed-in · no-flag-yet (reason form) · already-flagged.
- **Behaviour:** the "…" appears on slide hover. Opens a small popover: a reason textarea + rust "Flag for removal" button; if already flagged, shows the reason and (for the flagger) a "Remove flag"; if not signed in, a sign-in prompt. The popover content is the exported **`FlagPanel`** — ONE copy shared with the "+" menu's flag view, so the two flows can never diverge.
- **Copy:** "Why should this slide be removed?"; placeholder "Optional reason…"; "Flag for removal" / "Flagging…"; "Flagged for removal"; "Remove flag"; "Sign in to flag this slide for removal." + "Sign in".
- **Trigger:** `canFlag`; `ownsFlag` (only the flagger can remove).
- **Source:** `SlideFlagControl.tsx` (whole file — `FlagPanel` + the "…" host).

### C7. Requested-slide ("stub") card
- **Element:** a shared, editable draft slide standing in for one that doesn't exist yet — a white card with a dashed border.
- **Where:** the slide stage when the active item is a stub. `StubSlideView.tsx`.
- **States:** default · dismissed (owner) · editing · (owner) hover-curation.
- **Behaviour:** shows a teal "Requested by {name}" badge and three always-visible fields (Title / Subtitle / What should this slide cover) — empty ones read "Not set yet". The requester or owner can edit or delete it. The **owner** also gets hover Edit/Dismiss buttons (top-right of the card); dismissing dims the card and strikes the fields with "Won't send to Claude · Restore".
- **Copy:** "Requested by {name}"; field labels "Title" / "Subtitle" / "What should this slide cover"; "Not set yet"; dismissed "Won't send to {AI|Claude}" + "Restore"; hover aria "Edit this requested slide" / "Dismiss — won't send to {AI|Claude}" (labels "Edit" / "Dismiss"). "a teammate" when the requester email is unknown. (Same `aiName` prop as C3: floating "AI", classic "Claude".)
- **Trigger:** `canEdit`/`canDelete` (= owner or requester); `canCurate` (owner) for Dismiss; `stub.dismissed`.
- **Source:** `StubSlideView.tsx` (whole file).

### C8. Requested-slide "…" menu + delete confirmation
- **Where:** beside the badge (classic, inline) or bottom-right corner (floating). `StubSlideView.tsx`.
- **Behaviour:** menu offers "Edit this request" and a red "Delete this request"; delete swaps to a confirmation card.
- **Copy:** menu "Edit this request" / "Delete this request"; confirm heading "Delete this requested slide?" / body "This removes the request from the deck. It can't be undone, but anyone can request a new slide here again." / "Cancel" / "Delete" (→ "Deleting…").
- **Source:** `StubSlideView.tsx` `StubActionsMenu` ~lines 39–197.

### C9. Request-a-slide / edit-slide form (shared)
- **Element:** the one title/subtitle/content form behind both "Request a slide" and "Edit requested slide".
- **Where:** the insert popover and the edit modal. `StubFieldsForm.tsx`, `InsertStubForm.tsx`.
- **Behaviour:** three fields; submit is disabled until there's at least a title or some content. Create and edit are deliberately identical.
- **Copy:** labels "Title" (placeholder "e.g. Pricing tiers"), "Subtitle" (placeholder "Optional"), "What should this slide cover?" (placeholder "Describe the content you want here…"); create heading "Request a slide" / button "Insert slide" (→ "Adding…"); edit heading "Edit requested slide" / button "Save changes" (→ "Saving…"); signed-out "Sign in to request a new slide here." + "Sign in".
- **Source:** `StubFieldsForm.tsx`; `InsertStubForm.tsx`.

### C10. Comments-panel footers (read-only / orphan / signed-out)
- **Copy:** read-only "Comments are read-only on past versions."; orphan "Comments aren't available yet — this deck hasn't been claimed by its creator. Ask them to claim it to turn on commenting."; signed-out "Sign in to comment." + button "Sign in to comment".
- **Trigger:** `readOnly`, `isOrphanDeck`, or not-signed-in (in that precedence).
- **Source:** `CommentsPanel.tsx` ~lines 711–734.

---

# D. Thumbnails & requested slides

*The slide rail. The classic viewer uses a horizontal strip across the top; the floating viewer uses a vertical panel on the left. The version-spine in the feed uses a third, lazy-loading strip.*
**Source:** [ThumbnailStrip.tsx](../web/src/app/viewer/ThumbnailStrip.tsx), [FloatingThumbnailStrip.tsx](../web/src/app/viewer/FloatingThumbnailStrip.tsx), [LazyThumbnailStrip.tsx](../web/src/app/viewer/LazyThumbnailStrip.tsx), [display-items.ts](../web/src/app/viewer/display-items.ts)

### D1. Slide thumbnail ⭐ *(explicitly confirmed)*
- **States:** active (purple border) · inactive (grey border) · flagged · has-comments.
- **Behaviour:** a scaled live render of the slide. The **active** thumbnail gets a **2px purple border** (`#4A3FB5`); inactive ones a 1px grey border. A **comment-count badge** (teal, white number) overhangs the top-right corner and **"pops"** (animates) when the count rises live. A **flagged** slide dims to 40% opacity with a small red trash-can circle bottom-right (classic strip). The active thumbnail auto-scrolls into view as you navigate.
- **Copy:** aria "Go to slide N"; badge aria "{n} comments"; flag aria "Flagged for removal".
- **Trigger:** `activeIndex`; `commentCountBySlide`; `flaggedSlides`; `sparkKey` (the pop).
- **Source:** `ThumbnailStrip.tsx` `SlideThumb` ~lines 48–160; `FloatingThumbnailStrip.tsx` `SlideThumb` ~lines 56–121.
- **Observation:** the floating strip shows the comment badge but **not** the flagged dim/trash indicator — that corner indicator is classic-strip only.

### D2. Requested-slide thumbnail ⭐ *(explicitly confirmed)*
- **States:** active (purple border) · inactive (teal outline).
- **Behaviour:** a tile with a **teal/green outline** (`1.5px solid #5DCAA5`), the requested title clamped inside, and a teal **"N"** corner bubble (= new / requested). The slide-number label below is teal. When active it takes the purple border like any slide.
- **Copy:** the title (or "Untitled slide"); aria "Go to requested slide: {title}"; corner bubble "N".
- **Source:** `ThumbnailStrip.tsx` `StubThumb` ~lines 162–215; `FloatingThumbnailStrip.tsx` `StubThumb` ~lines 123–173.
- **Observation:** the **word** "Requested" (uppercase) appears on the feed card's mini-preview (A5), not on the strip thumbnail — the strip uses the "N" bubble instead. Minor wording divergence worth keeping straight in any redesign.

### D3. "+" insert-between-slides ⭐ *(explicitly confirmed)*
- **Element:** a hover-revealed "+" in the gap between any two thumbnails (and at either end) to request a new slide there.
- **States:** hidden · hover (purple "+" with thin connector lines) · open (form popover).
- **Behaviour:** hovering a gap fades in a purple "+" circle with faint connector lines; clicking opens the "Request a slide" form (C9), which inserts the stub at that exact position. On a **read-only** (historical) view the gaps render as inert spacers (no "+") so spacing stays identical.
- **Copy:** aria "Insert a slide here".
- **Trigger:** `showInsert`; the gap's hover `group`; `positionForGap`.
- **Source:** `ThumbnailStrip.tsx` `InsertGap` ~lines 219–294; `FloatingThumbnailStrip.tsx` `InsertGap` (now **exported**, with a `orientation="row"|"column"` prop); ordering in `display-items.ts`.
- **Feed fidelity (spectrum, Slice 2):** the same "+" also appears in the **expanded feed** — between the thumbnails of the **current version's** "published vN" spine strip (vertical connector + "+", `orientation="column"`, reusing the exported `InsertGap` — no third copy). Gap g inserts at position g ("after slide g"; 0 = before slide 1), same form (C9), and the stage jumps to the new stub. Past versions' strips and the standalone read-only feed get **no** gaps. Hidden on historical views, matching the rail.

### D4. Classic strip extras — scroll indicator + actions
- **Behaviour:** the classic horizontal strip hides its native scrollbar and shows a slim grey position indicator when it overflows (click to jump; vertical mouse-wheel scrolls it sideways). Pinned to the far right: **Copy link** then **Send to Claude** (see E/G).
- **Source:** `ThumbnailStrip.tsx` ~lines 338–425, 519–537.

### D5. Lazy version strip (feed)
- **Behaviour:** the per-version thumbnail strips in the feed mount each iframe only when it scrolls near the viewport (a 6-version deck would otherwise spawn 30+ iframes); until then a numbered placeholder shows. Clicking a thumb peeks that slide (standalone feed) / opens it in that version (spectrum, J4). Takes an optional `insert` prop for the "+"-between-slides gaps (D3, feed fidelity) — omitted everywhere except the spectrum's current-version strip, so the standalone feed's strips are unchanged.
- **Source:** `LazyThumbnailStrip.tsx`.

---

# E. Versioning

**Source:** [DeckVersionNav.tsx](../web/src/app/viewer/DeckVersionNav.tsx), [UpdatedBanner.tsx](../web/src/app/viewer/UpdatedBanner.tsx), [version-banner.ts](../web/src/app/viewer/version-banner.ts), [deck-diff.ts](../web/src/app/viewer/deck-diff.ts)

### E1. Version chip + history dropdown ⭐ *(explicitly confirmed)*
- **Element:** the `v{N}` chip that opens version history.
- **Where:** top-left cluster (floating, inside the collapsible) / classic top-nav centre. `DeckVersionNav.tsx`.
- **States:** current (purple chip) · viewing-older (white chip + red warning triangle) · single-version (no dropdown arrow).
- **Behaviour:** chip shows "v{N}"; a small down-triangle appears when more than one version exists. Viewing an **older** version turns the chip white-on-black with a hairline ring and adds a **red warning triangle** with a hover tooltip. The dropdown lists versions newest-first; the whole row is the click target; the row you're viewing stays purple-highlighted; each row shows a relative time and a "current"/"viewing" tag.
- **Copy:** "v{N}"; dropdown heading "Version history"; row labels "Current version" / "Version {N}"; tags "current" / "viewing"; older-version tooltip "You're viewing an older version (v{viewing}). The latest is v{current}."
- **Trigger:** `viewingOlder` (viewing ≠ current); `hasChoices`.
- **Source:** `DeckVersionNav.tsx` (whole file).

### E2. "Updated since you last viewed" banner ⭐ *(explicitly confirmed)*
- **Where:** classic viewer top. `UpdatedBanner.tsx` (decision in `version-banner.ts`, summary in `deck-diff.ts`).
- **Behaviour:** an amber, dismissible banner for a signed-in viewer when the deck advanced since their last visit. One-time (the visit records a new last-viewed timestamp, so it won't reappear). The detail is a real slide-by-slide diff.
- **Copy:** "**Claude revised this deck** since you last viewed it — {detail}." where {detail} reads like "v1 → v2 · 1 slide added" / "…2 slides revised" / "…3 of 8 slides updated".
- **Trigger:** `computeUpdateBanner`; detail from `describeChange` + `summarizeDeckChange`.
- **Source:** `UpdatedBanner.tsx`; `version-banner.ts`; `deck-diff.ts`.
- **Observation:** this banner is wired into the **classic** path in `page.tsx`. The floating viewer's equivalent "what's new" surface is the **arrival banner** (B8), which counts comments rather than slide diffs.

### E3. Export as PDF — button + print view *(built 2026-07-03, revives P0.5)*
- **Element:** a quiet grey **download icon** (arrow-into-tray) that exports the **version being viewed** as a PDF, plus the standalone print page it opens.
- **Where:** floating viewer only, **top-RIGHT cluster** since 2026-07-05 (Slice C — export acts on the whole deck, so it lives in the deck-scope corner per §2.5 "position answers scope"; it previously sat top-left beside the version chip, the 2026-07-03 placement). Inside the collapsible group (huddle · export · Send to AI), left of Send to AI; still version-aware — the label follows the version being viewed. `FloatingViewer.tsx` (`ExportIcon` + the `<a>` in the top-right cluster); the print page is `viewer/print/page.tsx` + `viewer/print/PrintView.tsx`. Classic viewer: none (frozen).
- **States (button):** rest — bare grey icon (`#6b6b75`), no fill · hover — soft dark wash (`hover:bg-black/[0.05]`) · collapsed — tucks away with the title/version chip when the floating controls rest · hidden — deck has no slides.
- **Copy (button):** tooltip + aria-label **"Export v{N} as PDF"** (N = the version being viewed — scrub the lens to v5 and it reads "Export v5 as PDF").
- **Behaviour (button):** opens `/viewer/print?id={deck}&v={viewingVersion}` in a **new tab** (the deck stays open); fires `export_pdf_clicked` {deck_id, version, surface}.
- **Behaviour (print page):** renders every slide of that version, one per printed page, via the same `parseDeck`+`buildSrcdoc`+sandboxed-iframe path as the viewer — the browser's own engine makes the PDF, so the slide pixels match the on-screen render. **Page geometry: A4 landscape** (every print destination understands a named paper size + orientation), with each slide at its natural canvas scaled to fit and centred — thin white letterbox bars (A4 is 1.41:1 vs 16:9). **Click-through, not auto-print** (fix round 3): when all slides have loaded, a slim single-row **ready banner** (sheet-width, text left / button right; founder sizing call) appears above the sheets carrying the one instruction that matters — set **Destination → "Save as PDF"** — because Windows' default driver destination ("Microsoft Print to PDF") rotates landscape output sideways (a driver bug CSS can't reach; founder-hit). The dialog opens only when the user clicks the banner's button; the click first **walks every sheet through the viewport** (Chromium paints offscreen sandboxed iframes lazily; unwalked slides can print blank), scrolls back to top, then prints. While walking, both buttons read "Preparing…" and further clicks are ignored (guards a queued second dialog — founder-hit: "the popup stayed"). When the dialog closes (saved OR cancelled, via `afterprint`), the banner text flips to follow-up copy with a "Print again" button. The PDF's filename comes from the page title: "{deck title} — v{N}". *Geometry history:* slide-sized custom `@page` boxes were tried first but only "Save as PDF" honours them; driver destinations forced portrait paper (cropped, then rotated output — founder-hit twice, 2026-07-03) → A4-landscape-with-letterbox is the destination-proof shape.
- **States (print page):** loading — bar "…preparing v{N} for export… {n} of {N} slides ready", bar button disabled/grey, no banner · ready — bar "…ready — set Destination to “Save as PDF”.", ready banner visible, purple buttons enabled · preparing (walking) — both buttons "Preparing…", disabled · printed (dialog closed) — banner text flips to "PDF saved?…" + "Print again" · error — heading "Couldn't export" over the specific reason · empty deck — same error state.
- **Copy (print page, verbatim):** ready banner lead "Ready — {N} slides · v{N}." (after printing: "PDF saved? If it looks right, you can close this tab."); **Windows only** (OS detected client-side; the sideways trap is the Windows-only "Microsoft Print to PDF" driver, so Mac/Linux users see just the lead), a red ⚠ triangle then "Printing from a Windows computer? Please set **Destination → “Save as PDF”** — “Microsoft Print to PDF” turns the slides sideways."; banner button "Print / Save as PDF" → "Preparing…" → "Print again"; bar "{title} · v{N} — preparing v{N} for export… {n} of {N} slides ready" → "— ready — set Destination to “Save as PDF”."; bar buttons "Print / Save as PDF", "Back to deck"; errors "No deck was specified. Open a deck and use its Export button." / "This deck couldn't be found. It may have been deleted." / "Version {N} of this deck couldn't be loaded." / "This deck's slides couldn't be loaded. Please try again." / "This deck has no slides to export."; empty-state heading "Couldn't export".
- **Trigger:** Export button visible when the deck has ≥1 slide; the ready banner when all slide iframes have loaded; the dialog only on user click.
- **Access note:** the print page reads the deck **exactly like `/viewer`** (same by-id fetches, same `?v=` lens) — export is a read of a deck the visitor could already view; no new auth/RLS/service-role/MCP surface. The iframe sandbox is unchanged (`allow-scripts`, never `allow-same-origin`).

---

# F. Dashboard

*"Your decks" — owned decks and decks shared with you, as cards.*
**Source:** [dashboard/page.tsx](../web/src/app/(shell)/dashboard/page.tsx), [DashboardDecks.tsx](../web/src/app/(shell)/dashboard/DashboardDecks.tsx)

### F1. Page header
- **Copy:** "Your decks"; subtitle "Decks you've captured from Claude with the SlideHuddle extension, plus decks others have shared with you."; section headings "My huddles" and "Huddles shared with me".
- **Source:** `dashboard/page.tsx` ~lines 162–197; `DashboardDecks.tsx` ~lines 417–449.

### F2. Deck card
- **Element:** one card per deck.
- **Where:** the two grids. `DashboardDecks.tsx` `DeckCard`.
- **States:** default · hover (accent fills, delete button appears, version pill fades out) · multi-version (stacked-paper effect).
- **Behaviour:** an accent bar (purple for owned, grey for shared), the title (or "Untitled deck"), and a meta line. A deck with more than one version shows a **version pill "v{N}"** top-right and two faint stacked card edges behind it (a "this has history" cue). On hover the version pill fades and a delete/remove button fades in at that corner.
- **Copy:** title or "Untitled deck"; meta "{date} · {N} slides"; "from {ownerEmail}" (shared cards); "Shared with {N} person/people"; "{N} comments" / "{N} comment"; **"{N} new"** (red, with a red dot) for unread; version pill "v{N}"; delete button "Delete" (owned) / "Remove" (shared).
- **Trigger:** `deck.version > 1` (stacked effect + pill); `commentUnread > 0` ("N new").
- **Source:** `DashboardDecks.tsx` ~lines 125–236; meta from `dashboard/page.tsx` `deckMeta`.

### F3. Delete / remove flow (confirm → undo)
- **Behaviour:** clicking delete opens a confirm dialog; confirming optimistically hides the card and starts a **5-second Gmail-style undo** window (a toast); after it lapses the delete commits. A failed commit restores the card and shows an error toast.
- **Copy:**
  - owner dialog: "Delete this deck?" / "&ldquo;{name}&rdquo; and all its versions and comments will be deleted [ for everyone — including the {N} person/people it's shared with ]. You'll have a few seconds to undo." / "Cancel" / "Delete deck".
  - shared dialog: "Remove from your decks?" / "&ldquo;{name}&rdquo; will be removed from your dashboard. The owner and other collaborators keep their copy." / "Cancel" / "Remove".
  - undo toast: "Deck deleted" / "Removed from your decks" + "Undo".
  - error toast: "Couldn't delete that deck. Please try again." / "Couldn't remove that deck. Please try again."
- **Source:** `DashboardDecks.tsx` ~lines 238–327, 348–491.

### F4. Empty "My huddles" → "Start your own decks"
- **Behaviour:** when the user owns no decks, the section collapses to a connector prompt (rather than disappearing) with the MCP URL and a copy button.
- **Copy:** "Start your own decks"; "Add SlideHuddle to Claude as a custom connector, then just ask Claude to build a presentation — your decks land here, ready to share and collect feedback on."; button "Copy URL" / "Copied"; "In Claude: Settings → Connectors → Add custom connector, then paste this URL."
- **Source:** `DashboardDecks.tsx` `StartYourOwnPrompt` ~lines 71–123.

### F5. Comment-counts failure notice
- **Copy:** "Couldn't load comment activity — counts may be missing. Try refreshing."
- **Trigger:** `commentCountsFailed`.
- **Source:** `dashboard/page.tsx` ~lines 171–196.

---

# G. Shared chrome (nav, avatars, share/AI, popovers, toasts)

**Source:** [TopNav.tsx](../web/src/components/TopNav.tsx), [AvatarMenu.tsx](../web/src/components/AvatarMenu.tsx), [Avatar.tsx](../web/src/app/viewer/Avatar.tsx), [HuddleAvatars.tsx](../web/src/app/viewer/HuddleAvatars.tsx), [HuddleChips.tsx](../web/src/app/viewer/HuddleChips.tsx), [CopyLinkButton.tsx](../web/src/app/viewer/CopyLinkButton.tsx), [SendToClaudeButton.tsx](../web/src/app/viewer/SendToClaudeButton.tsx), [PortalPopover.tsx](../web/src/components/PortalPopover.tsx), [AnchoredToast.tsx](../web/src/components/AnchoredToast.tsx), [RelativeTime.tsx](../web/src/app/viewer/RelativeTime.tsx)

### G1. Top navigation bar
- **Where:** dashboard, home, login, classic viewer. `TopNav.tsx`.
- **Behaviour:** left = purple SlideHuddle logo (→ dashboard when signed in, home otherwise). Right = the avatar menu, or a "Sign in" link. An optional centre slot (the classic viewer puts the version chip there).
- **Copy:** "SlideHuddle"; "Sign in".
- **Source:** `TopNav.tsx`.

### G2. Account avatar menu *(restyled 2026-07-03)*
- **Where:** top-right of nav / viewer clusters. `AvatarMenu.tsx`.
- **Behaviour:** click opens a menu with the user's email, a link to the dashboard, **"Pin toolbars" (viewer only — B5; added 2026-07-05, Slice C)**, and sign out. The chip itself is now **deliberately distinct from huddler avatars** (founder call 2026-07-03): a purple circle with a white **person icon** + a **green "signed in" dot** top-right (kept fully inside the button so clipping containers can't cut it) — the same everywhere (viewer, feed, dashboard). It reads as "your account — your door to your other huddles", not "you as a huddler" (that's the shared `Avatar` in the feed/stack). For your own avatar, "signed in" and "online" are the same fact, so the dot reuses the presence green (#3FA344).
- **States:** rest · hover (brand ring wash) · menu open.
- **Copy:** "My huddles"; "Sign out"; (the email row); chip tooltip/aria "{email} — signed in".
- **Source:** `AvatarMenu.tsx`.
- **History:** in a deck context this chip previously rendered the shared person-`Avatar`; after the G4 restyle its owner-ring (an outer box-shadow) was **clipped by the collapsible top-right cluster** ("cut in white", founder-reported 2026-07-03) — the distinct account chip also fixes that (nothing overhangs its bounds).

### G3. Avatar (the one avatar component) ⭐ *(restyled 2026-07-04 — design-system §2.5)*
- **Element:** the single avatar used everywhere a person or the AI appears.
- **Behaviour — the signals at a glance:**
  - **Fill = owner.** The deck owner is the one **FILLED purple circle** (white initials) — fill alone says owner; **no star, no ring** (the 2026-07-03 pastel-fill + owner-star treatment is retired). The owner's default tooltip still appends "· deck owner".
  - **Outline + colour = collaborator.** Collaborators are **outline circles**: white fill, ring + initials in their assigned colour. Colours come from the **per-huddle join-order assignment** (`person-colors.tsx`): an OKLCH max-distance sequence (blue → crimson → green → magenta → azure → olive → rust → slate) that excludes the purple family (owner's) and the amber/orange family (the AI's); collaborator N in the deck's join order (server-resolved: share row / first comment) gets sequence[N], so early joiners are always maximally distinct. Rings clear ≥3:1, initials ≥4.5:1. Within one deck every surface paints a person identically (context provider per surface; deterministic hash fallback outside one).
  - **You = the account identity** (`self`): person icon; owner-you is the filled purple circle, collaborator-you the light account purple. The green dot (the presence exception — the ONE state that wears colour) renders **only where the host passes `online`** — the rail dots you always (you're here); content surfaces (feed cards, panel, nudge) show **no presence indicators at all** (founder call 2026-07-05 — the old always-on self dot read as presence and contradicted the rail).
  - **AI** → a distinct dark circle + amber sparkle here (the feed/rail use `AiMark` — model logo / lilac AI square); never reads as a teammate.
  - **Initials** come from the display name if present, else the email local-part (trailing digits stripped); falls back to a person icon when there's truly nothing.
- **Trigger:** the **owner decision lives only here** — callers pass `userId` + the deck's `ownerId`, and this component alone computes `owner = (userId === ownerId)` and renders filled vs outline, so no surface can disagree.
- **Source:** `Avatar.tsx` (whole file); `person-colors.tsx` (palette, assignment, context); `slide-store.ts` `getDeckParticipants` (`joinedAt`).

### G4. "Huddlers" people cluster + the avatar language *(restyled 2026-07-03)*
- **Where:** floating viewer top-right + feed top bar. `HuddleAvatars.tsx`. **In the spectrum this cluster is SUPPRESSED** — the huddle lives in the left filter stack instead (J8, one element not two; deck mode deliberately shows no huddle at all). Your own account menu stays top-right everywhere.
- **The avatar language (restyled again 2026-07-04 — see G3 for the full anatomy; the 2026-07-03 pastel+star treatment is RETIRED):**
  - **fill = owner** (the one filled purple circle, white initials — no star); **outline + assigned colour = collaborator** (per-huddle join-order palette, G3).
  - **you = the account identity** (`Avatar self`): person icon — in the filter stack, on your feed cards, and in the comments panel (both skins — the panel's old local letter-avatar was retired 2026-07-04). Owner-you renders as the filled purple circle. The green dot appears on your avatar **in the rail only** (G9 — content surfaces carry no presence).
  - **neutral grey count badge = contributions** (stack, J8); **green dot top-right = online now** — LIVE since 2026-07-05 on the roster surfaces (the presence system, G9).
  - the AI mark is unchanged (never reads as a teammate).
  - All of this lives in the ONE shared `Avatar.tsx`; no surface computes role or colour itself.
- **Behaviour (cluster, non-spectrum):** a count of everyone in the huddle (you included) + stacked avatars of the *others* (your own face is the account menu beside it). Up to 4 shown, then a "+N". A small teal speech-bubble marks anyone who has commented. This is "who's involved", not "who's viewing now".
- **Copy:** "{N} Huddler" / "{N} Huddlers"; tooltip lists the roster; overflow "+N".
- **Trigger:** signed-in viewers only (anonymous viewers never receive identities).
- **Source:** `Avatar.tsx` (the language); `HuddleAvatars.tsx` (the cluster); `HuddleFilterStack.tsx` (the spectrum stack, J8).

### G5. Anonymous people chips
- **Where:** floating viewer + feed, for anonymous link-holders. `HuddleChips.tsx`.
- **Behaviour:** a privacy-safe stand-in for the Huddlers cluster — a count only, never names.
- **Copy:** "Shared deck" (no count known); "{N} reviewing" (count known).
- **Trigger:** anonymous viewer; `reviewingCount`.
- **Source:** `HuddleChips.tsx`.

### G6. Copy-link / Share button ⭐ *(explicitly confirmed)*
- **Element:** copies the current deck URL to share.
- **Where:** classic strip ("Copy link") / floating top-right ("Share"). `CopyLinkButton.tsx`.
- **Behaviour:** copies the current URL **with `?source=capture` stripped** (so recipients never inherit the creator-claim flag). Shows a brief "Copied!" swap on the button and a toast. The button width is fixed so it never reflows on the swap.
- **Copy:** label "Copy link" (classic) / "Share" (floating); on-press "Copied!"; toast "Link copied · anyone with this link can view".
- **Trigger:** `handleCopy` deletes the `source` param.
- **Source:** `CopyLinkButton.tsx` (strip at ~line 48).

### G7. "Send to Claude / Send to AI" split button ⭐ *(explicitly confirmed)*
- **Element:** the owner's one-click "send the team's curated feedback to the AI" action — a Google-style split button.
- **Where:** classic strip ("Send to Claude") / floating top-right ("Send to AI"). `SendToClaudeButton.tsx`.
- **States:** active (has feedback) · empty (muted chip).
- **Behaviour:** a purple-outline split button: the **left** primary opens the bound Claude conversation in a new tab (the extension fills the message box from the URL fragment; never auto-sends) and also copies the feedback as a safety net. The **right** chevron opens a small menu. The label carries a quiet **"· N"** count of feedback items. With **no feedback**, it becomes a muted, non-interactive chip with no chevron.
- **Copy:** primary "Send to Claude" / "Send to AI" + " · {N}"; empty chip "No comments for Claude yet" / "No comments for AI yet"; dropdown items "Copy feedback to clipboard" / "Paste into Claude yourself." and "Copy MCP connector URL" / "Add as a custom connector in Claude to link decks directly."; copy toasts "Feedback copied" / "MCP URL copied"; send toasts "Opening your Claude conversation — your feedback will fill the message box (also copied, so you can paste it)." (bound) or "Couldn't find the original chat on this device — opened Claude and copied your feedback. Paste it into the message box." (unbound).
- **Trigger:** `feedbackText` null → empty chip; `count` from the prompt's line count; `conversationId` decides bound vs new chat.
- **Source:** `SendToClaudeButton.tsx` (whole file). Colour rule (purple, not amber) explained in its header comment.
- **Observation:** the AI version mark in the feed (A3) uses the producing model's real logo (`/logos/claude.svg`, `/logos/chatgpt.svg`) with a generic fallback if the source is unknown or the logo file is missing. The generic mark (founder call 2026-07-03) is a soft **lilac** rounded square with the brand-**purple** letters "AI" (was a dark square + amber sparkle) — still a square so it stays distinct from people (circles). `VersionSpineEvent.tsx` `AiMark`/`GenericAiMark`.

### G8. Popovers & toasts (the mechanisms)
- **PortalPopover:** all menus/forms/dropdowns render into a portal on `<body>` so they're never clipped by a scroll area or hidden under the sandboxed slide iframe. They flip above the anchor near the bottom edge, clamp on-screen, and dismiss on outside-click or Escape. `PortalPopover.tsx`.
- **AnchoredToast:** transient toasts portal to `<body>` at a very high z-index so they're never hidden behind a floating panel; they pin just under their anchor and fade out. `AnchoredToast.tsx`.
- **RelativeTime:** relative timestamps render **blank during SSR and the first client paint**, then the real value once hydrated (avoids a hydration mismatch). `RelativeTime.tsx`.

### G9. Presence — the "online now" green dot ⭐ *(built 2026-07-05; was reserved in the rail's anatomy)*
- **Element:** a tiny green dot (`#3FA344`, white ring) on the edge of a huddler's avatar while they have **this deck open right now** — the presence exception, the ONE state allowed to wear colour (§2.5 rule 3). Disappears when they leave.
- **Where:** the ROSTER surfaces only — the huddler rail (J8) and the top-right Huddlers cluster (G4). Deliberately NOT on feed cards, panel comments, or the nudge — **no presence indicator of any kind on content surfaces, your own avatar included** (founder call 2026-07-05: the old always-on `self` dot there read as presence and contradicted the rail — one signal, one place). Tooltips append "· online now". In the rail, YOUR avatar is always dotted (you're here by definition). The AI never gets a dot; the invite seat never gets one. *(The account chip's small dot, G2, is unchanged — that's "signed in" on the chrome, not a huddler.)*
- **Dot only (founder call 2026-07-05):** no offline dimming — dimming keeps its one meaning, "silent this round" (J8). A silent-but-online member reads dimmed WITH a dot (here, but hasn't contributed).
- **Behaviour:** everyone signed-in viewing a deck joins the Supabase Realtime **Presence** room `presence:deck:{id}` and announces their **user id + a freshness timestamp**, re-announced every 30s. Readers show a dot for entries stamped within the last 75s. Clean leaves (tab close, navigation) clear within seconds; an abrupt death (crash, laptop lid) clears in ≤ ~90s via the freshness window even if the server's phantom entry lingers (observed in verification — the TTL exists because of it). A second tab by the same person merges into one entry (people, not tabs). Nothing is stored — presence is pure live socket state, no tables, no schema.
- **Privacy:** the announcement carries the user id ONLY — never an email (emails stay server-resolved behind the signed-in participant gate). **Anonymous link-holders are never announced** and never see the roster. Caveat, accepted for v1: the presence room isn't RLS-gated like table data — it's protected by the unguessable deck id (the same capability-URL model as the share link) and its payload is a bare user id; the stricter Realtime Authorization upgrade would be its own security-relevant change.
- **Trigger:** `useDeckPresence(deckId, currentUserId)` — joins only when both exist (anonymous viewers never join); wired in `FloatingViewer` + `DeckFeed`.
- **Source:** `useDeckPresence.ts` (whole file); `Avatar.tsx` (`online` prop); `HuddleFilterStack.tsx` + `HuddleAvatars.tsx` (pass-through + tooltips).

---

# H. Chrome extension (on claude.ai)

*The injected capture UI on claude.ai, plus the auto-fill of feedback back into Claude's composer. Top-frame UI only; nested iframes just answer capture requests.*
**Source:** [content.js](../content.js)

### H1. "Open in SlideHuddle" injected button
- **Element:** the purple button the extension injects next to a detected slide deck (HTML artifact, code block, or inline slide iframe).
- **States:** idle · capturing · choosing · sending/updating · success · error.
- **Behaviour:** appears beneath a detected deck. On click it captures the best slide HTML, then either creates a new deck or (if this conversation already produced one) asks whether to update or branch. Disabled/"progress" cursor while working; an error state turns the button rust-red and restores after a few seconds. Success opens the deck in a new tab. (PPTX is detected but **no button is injected** — capture isn't built, and a button that fails on click is worse than none.)
- **Copy:** "Open in SlideHuddle"; "Capturing…"; "Choose below…"; "Sending…" / "Updating…"; "Opened ↗" / "Updated ↗"; error labels "Not supported yet", "No slides found", "Capture failed", "Failed — is SlideHuddle running?", or the server's own short error label; "No source found. Open the artifact preview, then try again."
- **Source:** `content.js` `createBar` ~lines 598–733, `flashError` ~lines 735–744, detection ~lines 746–1016.

### H2. Update-vs-create choice card
- **Element:** the in-context prompt shown when the current conversation already has a deck.
- **Behaviour:** a small white card under the button with two choices + a cancel ✕.
- **Copy:** "This conversation already has a deck: "{name}""; buttons "Update to new version" (primary) / "Create separate deck" (secondary); cancel "✕".
- **Source:** `content.js` `showConversationChoice` ~lines 545–594.

### H3. Auto-fill feedback into Claude's composer
- **Element:** the receiving half of "Send to AI" — reads the feedback from the URL fragment and types it into Claude's message box.
- **Behaviour:** when claude.ai opens with `#slidehuddle-feedback=…`, the extension finds the (ProseMirror) composer and fills it — **only if the box is empty, and never sends** (the user presses send). It strips the fragment from the URL up front so a refresh can't re-fill. If the composer can't be found, it relies on the web app's clipboard copy as the fallback.
- **Copy:** no visible UI (console logs only); the inserted text is the curated feedback prompt itself.
- **Source:** `content.js` `autofillFeedbackFromHash` ~lines 386–538.
- **Observation:** there is **no on-page "filled" confirmation chip** in the current code — the only signals are the filled composer text and (from the web app) the "Send to AI" toast + clipboard copy. The capture flow's only chips are the button's own state labels (H1) and the choice card (H2).

---

# I. Observations & known oddities

*Recorded, not fixed (per the task). Each is something to keep in mind during the transformation.*

### I1. Avatar role/shape — the known bug, and what the code shows now ⭐ *(explicitly confirmed)*
- **As reported:** "owner/collaborator shape not keyed to real ownership; owner renders differently in floating nav vs feed."
- **What the code shows today:** `Avatar.tsx` now centralises the owner decision (`owner = userId === ownerId`) and is fed the real `ownerId` everywhere it's used (feed cards, version spine, Huddlers cluster, and the owner's own account avatar in the deck viewer via `AvatarMenu`). So where the shared `Avatar` is used **with the right `ownerId`**, shape *is* keyed to real ownership and should match across feed and floating nav. The historically-reported mismatch appears to have been the target of the avatar-role-fix work.
- **Residual divergences:**
  1. **Comments panel — FIXED for the floating viewer (Slice 3, 2026-07-03).** With `translucent` (the floating panel), comment authors render with the shared `Avatar` (person colour + owner ring + the G4 soft style), so a person reads identically in the panel, the feed cards, and the huddler stack. The **classic** panel (translucent=false) intentionally keeps its local purple letter-circle — classic is never edited; the divergence dies with it.
  2. **Account chip vs deck avatar — RESOLVED BY DESIGN (2026-07-03).** The account chip (G2) is now *intentionally* one uniform thing everywhere (purple person icon + green signed-in dot) and no longer tries to match the person's huddler avatar — the divergence became the design: "your account" and "you in the huddle" are two different concepts with two different looks.
- **Source:** `Avatar.tsx`; `CommentsPanel.tsx` (shared avatar behind `translucent` + `deckOwnerId`); `AvatarMenu.tsx`.

### I2. The "1 Issue" dev chip
- **What it was:** a real React **hydration warning** badge (dev-tools only), from two SSR-vs-client mismatches (relative timestamps in the feed; the `AnchoredToast` portal).
- **Status:** **fixed 2026-06-22** via the shared `useHydrated()` hook + `RelativeTime.tsx` + gating the toast portal on hydration (per the progress tracker). It should no longer appear; flagged here only because the original task called it out.
- **Source:** tracker entry 2026-06-22; `RelativeTime.tsx`; `AnchoredToast.tsx`.

### I3. "Send to Claude" vs "Send to AI" wording split — RESOLVED for floating + feed (2026-07-02)
- **Decision (founder, 2026-07-02): provider-neutral "AI"** everywhere the converging surfaces speak — the floating viewer + the feed now consistently say "Send to AI" / "No comments for AI yet", curation reads "Won't send to **AI**" (comments, flags, stubs — `aiName="AI"` prop), and the feed's dismissed text is "Won't send to AI" (was "Won't action").
- The **classic** viewer intentionally keeps "Send to Claude" / "Won't send to Claude" (the `aiName` default) — it is never edited; its wording dies with it at the eventual classic retirement.
- **Source:** `SendToClaudeButton.tsx` (label props); `CommentsPanel.tsx` + `StubSlideView.tsx` (`aiName` prop, default "Claude"); `FeedItemCard.tsx`.

### I4. Two viewers + a feed = three copies of similar controls
- Comments, stubs, flags, and thumbnails exist in **both** viewer-flavoured implementations (`SlideViewer` + its strip vs `FloatingViewer` + its hooks/strip), plus a third feed rendering. They're kept deliberately separate so the live classic viewer stays untouched (a Phase-7 cutover is planned to remove the duplication). Any behaviour change usually needs to land in more than one place.
- **Source:** hooks `useDeckComments.ts` / `useDeckStubs.ts` / `useDeckFlags.ts` headers; `FloatingViewer.tsx` header.

### I5. Minor stat/indicator divergences (already noted inline)
- Deck-peek always shows the comment count even at "0 comments"; flags/requests rows only when > 0 (A9).
- The floating thumbnail strip omits the flagged dim/trash indicator that the classic strip shows (D1).
- The classic dataset-load-error banners (B10) have no floating-viewer equivalent.

---

# J. Feed↔deck spectrum (`?view=spectrum`) — Slice 1

*The feed and the deck on **one resizable screen**, so you never "leave" one for the other — you resize between them. A gated MODE of the floating viewer (not a new rendering): it reuses the floating slide stage and the shared feed column ([FeedStream.tsx](../web/src/app/viewer/FeedStream.tsx), extracted from `DeckFeed` so there's no second copy). Built behind `?view=spectrum` (URL-only); without the param the floating viewer behaves exactly as before. Slice 1 brings the two surfaces together + the resize; the comments-panel fold (Slice 2) and avatar filtering (Slice 3) are not built yet.*
**Source:** [FloatingViewer.tsx](../web/src/app/viewer/FloatingViewer.tsx) (spectrum branch), [FeedStream.tsx](../web/src/app/viewer/FeedStream.tsx), [page.tsx](../web/src/app/viewer/page.tsx) (the `spectrum` data branch).

### J1. The resizable left region — rail ↔ feed (two fidelities, one region) ⭐
- **Element:** the left column that morphs between the **thumbnail rail** (deck mode) and the **full conversation feed** (feed mode) — the existing strip and the existing feed are literally the two ends of it.
- **Where:** left of the floating stage, in spectrum mode only. `FloatingViewer.tsx` (spectrum left-region block).
- **States:** rail (deck mode) · feed (split/feed modes). **Deck mode always renders the rail** (`FloatingThumbnailStrip` + the "+" insert, D3); split/feed render the full `FeedStream` (the version spine + cards + greyed snapshot, A2/A4/A6 — reused intact) — **except** on a very narrow window (a feed column below **~210px** is too cramped to read), where even feed mode falls back to the rail. Both fidelities sit in the same frosted translucent panel, which animates its width (170ms; snaps under reduced motion).
- **Behaviour:** clicking a feed **card** shows what it points at **in the version of the round it belongs to** — like the thumbnails (J4). A card from the version **already on the stage** focuses in place: a comment/flag → its slide; an **open requested slide → that stub card itself** (the `StubSlideView`), not the neighbouring slide. A card from an **older round** (or an already-addressed request) **navigates to that version** — the deck and the version pill follow, and the split mode is preserved — instead of silently doing nothing. (In the standalone feed there's no live stage, so a card just peeks the current version's nearest real slide.) Clicking a **version-spine thumbnail** is version-aware the same way — see **J4**. The feed's own arrival ribbon is suppressed here (the floating `ArrivalBanner`, B8, already covers it); past-version greying + "✓ Addressed in vN →" jumps work exactly as in the standalone feed.
- **Copy:** region aria "Slides" (rail) / "Conversation feed" (feed). All inner copy is the existing strip/feed copy (D1–D3, A2–A10).
- **Trigger:** `spectrumOn` (page passes the feed dataset) + `leftRegionW` vs `SPECTRUM_RAIL_MAX` (210px).
- **Source:** `FloatingViewer.tsx` spectrum left-region block; `FeedStream.tsx`.

### J2. The Deck / Split / Feed balance toggle
- **Element:** a 3-segment control that sets the split ratio to one of three resting points. **Replaces the slides toggle** (B3) in the top-left cluster while in spectrum mode (the left region is always present here, so a show/hide toggle would be meaningless).
- **Where:** top-left frosted cluster. `FloatingViewer.tsx`.
- **States:** the active segment is purple-filled white; the others are muted with a hover wash. Active = whichever snap the current ratio is nearest.
- **Behaviour:** clicking a segment sets the ratio to **Deck (16%)**, **Split (40%)**, or **Feed (62%)** of the stage width. The chosen mode is mirrored in the **`?mode=deck|split|feed`** URL param so it survives a version navigation (J4) — you stay in the mode you picked.
- **Copy:** "Feed" · "Split" · "Deck" (left→right); group aria "Feed and deck balance".
- **Trigger:** `feedFrac` / `SPECTRUM_SNAPS = [0.16, 0.4, 0.62]`; initialised from `?mode=` on mount.
- **Source:** `FloatingViewer.tsx` (top-left cluster, spectrum branch).

### J3. The resize divider
- **Element:** a draggable purple grip on the right edge of the left region.
- **Where:** between the left region and the slide. `FloatingViewer.tsx`.
- **States:** rest · hover (the grip scales up slightly) · dragging.
- **Behaviour:** **drag** sets any ratio between ~6% and 66%; **release snaps** to the nearest of the three resting points. The grip is focusable; **← / →** step between the resting points. As the divider moves, the slide insets beside the region and **shrinks toward a peek** in feed mode (reusing the existing inset machinery).
- **Copy:** aria "Resize the conversation feed" (a `separator`, `aria-valuenow` = the feed's percentage).
- **Trigger:** pointer drag (`onDivider*` handlers, pointer capture) + `nearestSnap`.
- **Source:** `FloatingViewer.tsx` (divider element + spectrum interaction handlers).

### J4. Switching versions inside the spectrum ⭐
- **Element:** version navigation that keeps you on the co-present screen (instead of dropping you back to the plain viewer).
- **Where:** the version pill dropdown (E1) + the feed's version-spine slide thumbnails (A3/D5) + the feed CARDS (A5), in spectrum mode. `DeckVersionNav.tsx`, `FloatingViewer.tsx`, `VersionSpineEvent.tsx`, `FeedStream.tsx`.
- **States:** viewing current · viewing an older version (read-only).
- **Behaviour:** picking a version from the **version-history dropdown** now preserves `?view=spectrum`, so you stay in the spectrum (deck + feed) showing that version — you no longer get "transferred to the old experience". Clicking a **slide thumbnail under an older version's event**, or **any feed card from an older round** (a comment / requested slide / removal flag), navigates to that version too (staying in the spectrum) and opens on that item's slide. Either way the deck loads that version, the **version pill updates to `v{N}`**, and — when it isn't the latest — the **red "older version" warning** shows (E1); a past version is read-only. Clicking a thumbnail of the version already on the stage just focuses that slide (no navigation). Version navigation **keeps the split mode you're in** (deck/split/feed) — the current `?mode=` rides along on every version link and the thumbnail navigation, so stepping through versions no longer snaps you back to deck.
- **Copy:** unchanged — reuses E1's chip + `You're viewing an older version (v{viewing}). The latest is v{current}.`
- **Trigger:** `DeckVersionNav` `viewParam="spectrum"` + `modeParam` (appends `&view=spectrum&mode={mode}` to every version link); `onSelectVersionSlide` (thumbnails) and `onSelectItem` (cards, carrying the round's version) → `router.push('…&view=spectrum&mode={mode}&v={N}&slide={i}')` when the item's version ≠ the one on the stage (else it focuses in place — an open requested slide focuses its stub card). `page.tsx` reads `?mode=` and seeds the viewer's split via `spectrumFeed.initialMode`.
- **Source:** `DeckVersionNav.tsx` (`viewSuffix`); `FloatingViewer.tsx` (`onOpenVersionSlide`); `VersionSpineEvent.tsx` (thumbnail emits its version); `FeedStream.tsx` (`onSelectVersionSlide`).
- **Note:** a very narrow window can leave even feed mode (62%) below the rail threshold (J1) — the left region stays as the rail. A future mobile pass (deferred) will address small widths.
- **Note (current-version anchoring):** while the STAGE shows a historical version, the **feed stays anchored to the latest version** — the "published vN" event's thumbnail strip and the per-card thumbnails always render the *current* version's slides (parsed from `versionsHtml[currentVersion]`, not the stage's `rawHtml`). Without this, navigating the stage to an older version made the feed show that old version's thumbnails under the current "published vN" event.

### J4b. Deck→feed slide sync ⭐ *(built 2026-07-05, founder call)*
- **Element:** as you move through slides on the stage, the feed scrolls to keep that slide's cluster at the top — so the deck and the conversation stay in step instead of feeling disconnected.
- **Where:** spectrum, feed fidelity showing (split/feed). `FeedStream.tsx` (`activeSlideIndex`/`activeVersion` props + the sync effect); `FloatingViewer.tsx` passes the stage's active slide + version.
- **Behaviour:** navigating slides via the deck (arrow keys, thumbnails, counter) scrolls the feed so the on-stage slide's cluster (that round's feedback for it) sits ~12px from the top, comments beneath. **Feed-originated selections don't scroll back** — clicking a card or a version thumbnail is marked internally (`markSelfNav`), so it never yanks the feed on top of what you clicked. A slide with **no feedback** in that round is a no-op (the feed stays put — there's no cluster to show). Uses **instant** scroll, not smooth: the feed re-renders often (live data), which cancels an in-flight smooth animation, and snapping keeps pace with rapid slide flips. Clusters within one viewport of the feed's bottom can't reach the very top (nothing below to scroll) — they land as high as the content allows.
- **Trigger:** `activeSlideIndex`/`activeVersion` change → the sync effect (skips its first run so mount's open-at-current-round wins, and skips feed-originated changes) → `scrollToCluster` looks up the `{version}:{slideIndex}` cluster ref.
- **Source:** `FeedStream.tsx` (`clusterRefs`, `scrollToCluster`, `selfNavRef`/`markSelfNav`, the sync effect); `FloatingViewer.tsx` (`activeSlideIndex`/`activeVersion` props on `FeedStream`).

### J5. What spectrum mode suppresses (so two left columns never collide)
- **Behaviour:** in spectrum mode the floating viewer hides the controls that assume a *floating* strip: the **rail sliver** (B6), the **toggled thumbnail-strip overlay**, and the **left navigation arrow** (B2, which would sit under the feed column). The right Next arrow, the counter, the version chip, Share, Send-to-AI, Comments, and the settings gear are unchanged. Arrow keys still navigate slides.
- **Trigger:** `!spectrumOn` guards on the sliver / strip / left-arrow.
- **Source:** `FloatingViewer.tsx`.
- **Note:** the folding comments panel (J6) and the provider-neutral copy (I3) landed in **Slice 2** (2026-07-02). Still pending: Slice 3 (avatar filter + the shared-Avatar fix, I1).

### J6. The folding comments panel — one or the other, never both ⭐ *(Slice 2)*
- **Element:** the right comments panel folds away while the feed is expanded, because the same comments are already inline in the feed — the panel belongs to deck mode (design model §3).
- **Where:** the spectrum's right side. `FloatingViewer.tsx` (`commentsFolded` / `commentsVisible`).
- **States:** available (deck + **split** modes) · folded (**feed mode** only — full feed showing).
- **Behaviour:** in **feed mode** the comments panel does not render and the **Comments toggle (B7) hides** — the feed is the whole point and its comments are inline. In **split mode the panel stays available** (founder call 2026-07-03: the slide is a real working surface there, so the per-slide thread is useful even with the feed beside it). The open/closed state is **remembered**: switch back from feed to split/deck and the panel **returns for the current slide** if it was open. The slide un-insets and the **right Next arrow returns** while the panel is folded. On a very narrow window where feed mode falls back to the rail (J1), the panel becomes available again (inline comments aren't visible on the rail).
- **Copy:** none of its own (B7/C1 copy unchanged).
- **Trigger:** `commentsFolded = spectrumOn && mode === "feed" && !spectrumRailMode`; `commentsVisible` additionally requires `commentsPanelOpen`, a stored deck, a signed-in viewer, and a real slide.
- **Source:** `FloatingViewer.tsx` (fold gates on the panel, the B7 toggle, and the Next arrow).

### J7. Live feed + owner curation on feed cards ⭐ *(Slice 2 fix round, 2026-07-02)*
- **Element:** the spectrum's feed column is **live**, and the deck owner can curate directly on its cards.
- **Where:** the spectrum's feed column. `FloatingViewer.tsx` (`spectrumComments/Stubs/Flags` merge), `FeedStream.tsx` (`curation` prop), `FeedItemCard.tsx` (hover controls + inline editor).
- **States:** per card — default · hover (owner, current round: dark Edit/Dismiss icon buttons fade in over a left-to-right white fade) · editing (inline textarea + Save/Cancel) · dismissed ("Won't send to AI · Restore").
- **Behaviour:**
  - **Live:** a teammate's comment/request/flag arriving over Realtime — and your own add/dismiss/edit/insert — appears in the feed column immediately, no refresh. *(Verified end-to-end 2026-07-03: a signed-in collaborator session in the spectrum received an owner comment live, twice. The Realtime socket is re-authorized whenever the session token refreshes — without that, live sync silently died in any tab open longer than ~1h; channel errors are now logged to the console instead of failing silently.)* Implementation: the server-seeded feed data is merged with the same live hooks the deck side uses (current-version comments replace their seed subset; open stubs/flags override/append theirs; a deleted item drops; resolved history is kept from the seed). On a historical stage the seed is shown as-is (frozen snapshot, no Realtime).
  - **Curation:** on **current-round** cards only, the **owner** gets the panel's controls (C3/C5/C7) on the card itself: hover reveals **Dismiss** (all kinds) and **Edit** (comments only — a flag is just a removal note; a stub is edited on its own card). Edit opens an inline textarea changing only what's sent to the AI; dismissed cards strike through and gain "Won't send to AI · Restore". Same server actions as the panel — one curation path. Past-round cards and the standalone read-only feed get **no** controls.
- **Copy:** button aria/tooltips "Edit what's sent to AI" / "Dismiss — won't send to AI"; helper "Changes what's sent to AI — the original comment won't change."; Save/Cancel; "Won't send to AI · Restore".
- **Trigger:** `curation` passed only when `canCurate` (owner, not read-only) AND the card's round `isCurrent`; live merge gated off `readOnly`.
- **Source:** `FloatingViewer.tsx`; `FeedStream.tsx`; `FeedItemCard.tsx`.

### J8. The Huddlers filter stack — one element: the people AND the filter ⭐ *(Slice 3, 2026-07-03)*
- **Element:** a floating vertical pill on the far LEFT edge holding every huddler's avatar — it is both the "who's in this huddle" display and the feed filter (founder mock 2026-07-03).
- **Where:** the spectrum, split/feed modes only — anchored to the **top** of the far-left edge (aligned with the feed region's top, founder call 2026-07-03). `HuddleFilterStack.tsx`; wiring in `FloatingViewer.tsx`; dimming/chip in `FeedStream.tsx` + `FeedItemCard.tsx`. The feed region and divider shift right to make room. **Deck mode hides it entirely** (focused commenting — no huddle display there at all; the top-right G4 cluster is also suppressed throughout the spectrum so the huddle never appears twice).
- **Order + anatomy (restyled 2026-07-04 per design-system §2.5; the rail is THE PARTICIPANTS, human + AI):** on top, a small teal **person icon + the total count** (tooltip "{N} Huddlers"). Then, top→bottom: **YOU** (pinned first, the account identity — person icon + green dot, `Avatar self`); a **grey hairline**; **the AI's model mark** (Claude/ChatGPT logo at **32px** — same footprint as the avatars — generic lilac "AI" square when unknown; kept deliberately, founder call 2026-07-04: the human/AI collaboration stays visible, but the AI holds a **fixed seat** — never ranked, never dimmed for silence, never a person colour); then **everyone else — owner pinned first, then by contribution count DESCENDING**; zero-contribution members **sink to the bottom, dimmed (~55%) and chip-less** (silence visible at a glance; YOU and the owner never silence-dim); up to 8, then "+N" (now a grey chip); and the **dashed "+" invite seat** (copies the share link, same toast as Share; `CopyLinkButton variant="invite"`). **The ordering SETTLES ON LOAD** — it freezes once the feed data is ready and does not re-sort live mid-session (no avatars hopping while people comment; badge numbers stay live, new joiners append at the bottom; the order catches up on the next load/refresh). **Count badges are one quiet NEUTRAL style for everyone** — a soft grey chip with dark text (bottom-right satellite, same size/offset as before, "9+" cap), the AI's version count included (was teal for people / purple for the AI — no coloured badges, badge colour is a lie). Counts remain **ACTIONABLE** contributions: the CURRENT round only — live comments on the latest version + open requests + open flags, excluding dismissed/addressed. Tooltips now carry the **breakdown**: "You — {email} · {N} to action — {2 comments · 1 request}" (self), "{name} · deck owner — {email} · …" (owner), "{name} · {N} to action — {breakdown}" (others; "no contributions this round" at zero); the AI's badge/tooltip reads "published {N} versions". **Green "online now" dots are LIVE (2026-07-05, G9)** — a dot on whoever has the deck open right now, "· online now" in their tooltip; dot only, dimming keeps meaning "silent".
- **States (per avatar):** default · hover (scales up) · **selected** (**purple** halo ring — the current selection is the one thing that wears purple, §2.5; was teal) · dimmed 0.35 + desaturated (someone else is selected) · dimmed 0.55 (zero contributions, no filter active).
- **Behaviour — the filter:** clicking a face filters the feed to that contributor: their cards stay; **everything else HIDES** (dimming made the feed hard to navigate — founder call 2026-07-03); version-spine events always stay (the backbone), and a round whose items are all hidden shows just its version event. Clicking the **AI mark** filters to *its* contributions — every human card hides and the version spine stands alone. A sticky **teal chip** appears at the top of the feed — "Showing {name}'s feedback ✕" / "Showing your feedback ✕" (self) / "Showing {AI}'s versions ✕" — plus "{N} from others hidden" ("{N} feedback items hidden" for the AI). Clicking the same face, or ✕, clears.
  - **Empty filter (2026-07-03):** filtering to a **person with no contributions** replaces the whole spine with a clean empty state — heading **"No contributions from {name} to this deck yet"** ("You haven't contributed to this deck yet" for self) + a line + a **"Show everyone's feedback"** link — instead of the version spine with no cards under it. (The AI filter is exempt — its point is the spine.)
  - **Scroll on clear (2026-07-03):** whenever a filter is **cleared**, the feed scrolls back to the **current version's round** (the same ~15%-from-top position it opens at), so you land on the live comments rather than wherever the filtered view left you.
  - **Mode changes remember the filter**: switch to deck (stack + filter both vanish, filter inert) and back to split/feed — the filter returns visible, chip and all (same pattern as the folded panel, J6). The filter never applies invisibly.
- **Copy:** stack aria "Huddlers — click one to filter the feed to their feedback"; person tooltip "{You|name}( · deck owner) · {N} to action — {breakdown|no contributions this round}"; AI tooltip "{AI} · published {N} version(s)"; invite aria/tooltip "Invite someone — copy the share link"; chip copy as above + "✕" (aria "Clear the filter — show everyone's feedback").
- **Trigger:** `stackVisible` = spectrum + feed fidelity showing + signed-in + participants > 0 (identities never reach anonymous viewers — they never see the stack).
- **Source:** `HuddleFilterStack.tsx`; `FloatingViewer.tsx` (`feedFilterUserId`/`activeFeedFilter`, `contributionCounts`, `stackOffset`); `FeedStream.tsx` (chip + `filteredOut`); `FeedItemCard.tsx` (the dim state).

---

*End of catalogue. If you add or change a user-visible behaviour, update the matching entry above in the same commit.*
