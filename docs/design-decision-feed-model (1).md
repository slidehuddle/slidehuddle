# Design decision — the feed model: nested chronology, slide clusters, and the feed↔deck spectrum

*Decision note. Date: June 2026. **Replaces the earlier "slide-clustered brief"
version of this note.** Records the agreed model, the reasoning, what it supersedes,
and what it defers. Trust `docs/PROGRESS-TRACKER.md` over this note where they differ;
this is the rationale, the tracker is the live status. For exact existing UI
behaviours (greyed past versions, strikethrough, copy, etc.), `docs/BEHAVIOURS.md` is
the source of truth — this note references it rather than restating it.*

---

## 1. The decision in one paragraph

Feedback is organised at **three nested levels, not one**. The outermost level is the
**version** — version chronology is the spine of the feed (v1 → v2 → … → vN, each a
"Claude published vN" event showing what changed). Inside a version, the structure is
the **slide** — that version's feedback clusters by slide, because the slide is the
unit of work and the unit the AI revises. Inside a slide, the structure is **time
again** — a slide's comments read in chronological order. So it nests: chronology →
slide → chronology. These don't compete, because each level only orders the things
*within* one item of the level above it. This is experienced through **one resizable
screen** with a **feed↔deck spectrum**: drag/toggle from slide-dominant ("deck mode")
to feed-dominant ("feed mode").

---

## 2. The three nested levels (the core model)

| Level | Structure | The question it answers | Where it shows |
|---|---|---|---|
| **Version** (outermost) | Chronological | "How has the deck evolved over time?" | The feed's spine — version events as the backbone. |
| **Slide** (middle) | Clustered by slide | "What does this version need, slide by slide?" | Within the version being viewed. |
| **Comment** (innermost) | Chronological | "What did people say on this slide, in what order?" | Within a slide cluster / the deck-mode comments panel. |

The earlier mistake (in the superseded note) was crowning one of these the single
organising principle. They are different depths, not rivals: chronology and
slide-clustering only felt contradictory when treated as competitors for the *whole*
feed. They aren't — they live at different levels of the nest.

---

## 3. How it's experienced — the feed↔deck spectrum

There is **one screen**, not two surfaces you travel between. The feed and the deck
are the two ends of a resizable split; the **mode** sets the ratio.

- **The left is always the feed**, at two fidelities:
  - *Collapsed* (deck mode) → a **thumbnail rail** with comment-count hints.
  - *Expanded* (feed mode) → the **full feed** (version chronology + slide clusters +
    comments inline).
  - Same component, two sizes. The existing thumbnail strip and the existing feed are
    literally the two ends of it.
- **The right comments panel belongs to deck mode.** In deck mode it shows the current
  slide's comments (chronological). When the feed expands, those same comments appear
  inline in the feed, so the right panel **folds away** — one or the other, never both.
  Collapse back and it returns for the current slide.
- **The slide** is dominant in deck mode and becomes a **peek** in feed mode.

This resolves the old dead-end: you never "leave" the feed for the deck or vice versa
— you resize.

**Mode summary:**

| | Left | Right | Slide |
|---|---|---|---|
| **Deck mode** (work on this version) | thumbnail rail (collapsed feed) | comments panel (this slide) | dominant |
| **Feed mode** (see the evolution) | full feed (versions + clusters + inline comments) | folded away | a peek |

---

## 4. Previous versions = frozen historical snapshot

When you scrub the version spine to an earlier version, you see that version's feedback
**as it was then — a frozen snapshot**, not a filtered "still-open" view. This is the
deliberate choice: the feed's job is to show how the deck and its feedback actually
evolved.

The current app already implements this, and it's the canonical behaviour to preserve
(see `docs/BEHAVIOURS.md` A4 and A6 for exact mechanics — reference them, don't
restate). The nuance to keep: a **past-round version event always desaturates**; a
**feed item only greys if it's in a past round AND addressed or dismissed** —
unaddressed comments/requests/flags stay in colour even in past rounds; the **current
round never mutes**; and **hover/select restores colour**. Addressed items are
**struck through** with a teal **"✓ Addressed in vN →"** link that jumps to that
version; dismissed items read **"Won't action"**.

This reconciles cleanly with the "don't carry forward" rule (§5): nothing from an old
version bleeds onto the *current* version's working slides, but old feedback stays
visible in the feed **as greyed history**. Past = greyed snapshot you can hover to
read; present = live.

---

## 5. Earlier-round comments are NOT carried forward onto the current version

The **current** version's slides show only the current round's open feedback. Earlier
rounds are reachable only by scrubbing the spine back (where they appear as the §4
snapshot). Reasons:

- It matches existing architecture — comments are **version-scoped** (a comment shows
  only on the version it was written on), and feedback-resolution stops addressed items
  resurfacing.
- Each round is reviewed fresh, not against a pile of settled notes.

What we keep on the current version: a subtle **"changed in vN"** status chip (a fact
about the version, not old comment content).

**Trade-off accepted:** no automatic carry-forward of un-addressed items into the next
version. If it ever bites, a "carry forward open items" toggle can be added later
without disturbing this model.

---

## 6. Settled UX details (from the screenshots/session)

- **New slide between slides:** requesting a slide happens at a position *between*
  slides — the existing "+" insert in deck mode (between thumbnails), and an
  insert-between-clusters affordance in the expanded feed. Same action, both
  fidelities.
- **Avatars as a collaboration filter:** the huddler avatars sit on the feed side;
  clicking one **filters the feed to that person's contributions**, and in deck mode
  highlights which slides carry their comments (via the thumbnail dots). New affordance,
  built on existing avatars; reinforces "team = teal."
- **Text-selection comments (later phase):** select text on a slide to comment on *that*
  selection (the learned Google-Docs behaviour). The schema already reserves
  `element_id` for this. Caveat: the slide is a sandboxed iframe, so the selection must
  be posted out of the iframe, and an anchor tied to specific text may not survive the
  next version (Claude rewrites the HTML on revision). Decide an anchoring strategy
  (stable element ids, or version-scoped anchors that detach gracefully). Direction, not
  a first slice.
- **Buttons:** placement follows from the modes once locked. Some are mode-specific
  ("Add a comment" in deck mode's panel; "Send to Claude" wherever the round is
  curated). Colour rules stand: purple = your actions, amber = the AI's voice, teal =
  the team.

---

## 7. Brand / colour (unchanged rules)

- **Purple** = product + actions you take (incl. "Send to Claude").
- **Teal** = the team (collaborator avatars, comment counts, the version-current
  marker, the rail).
- **Amber** = the AI's voice ("Claude published vN", "changed in vN").
- **Avatars:** shape = role (owner filled, collaborator outline), colour = person.
  (Known shape bug noted in `docs/BEHAVIOURS.md` — fix carries into the rebuild.)

---

## 8. What this supersedes

- The earlier "**one slide-clustered brief is the single organising principle**"
  conclusion is **replaced** by the nested model: the mode/level picks the
  organisation. Feed mode is chronological (evolution); within a version it's
  slide-clustered; within a slide it's chronological.
- The "**whole deck** bucket" is **dropped** — deck-level feedback lands on the title
  slide (it's just slide-1 feedback). No new component, no schema change.
- The fixed two-pane "brief + canvas" becomes the **resizable feed↔deck spectrum**
  (same idea, mode-driven).
- The chronological version spine is **kept** (it was briefly demoted to a lens in the
  earlier note; it returns as the feed's backbone — the lens still applies *within* deck
  mode to scrub one version).

---

## 9. Reuse posture (why this is less work than it feels)

Both halves already exist in the current app (the chronological feed with deck-peek, and
the deck view with thumbnails + comments). The build is largely: (a) put them on one
resizable screen; (b) make the left morph between rail and full feed; (c) fold the right
panel as the feed expands; (d) preserve the §4 greyed-snapshot behaviour. The
load-bearing pieces — slide render, comment rows, curation, stubs, flags, version data,
auth, MCP, security — are reused. See `audit-current-vs-new-plan.md`.

**Architectural reality (from `docs/BEHAVIOURS.md` §I4):** there are already *three*
renderings — the **classic** viewer (`SlideViewer.tsx`, `?view=classic`, **never
edit**), the **floating** viewer (`FloatingViewer.tsx`, the default deck view), and the
**feed** (`DeckFeed.tsx`, `?view=feed`, default-on for design partners). The spectrum is
those last two — floating + feed — brought onto one screen. The comment/stub/flag logic
is currently duplicated (the classic viewer's copy vs the floating viewer's hooks); a
future tidy-up to retire classic and merge the duplicates is noted informally in the
code as "the Phase-7 cutover" — but note this is **developer shorthand, not a planned
milestone**: the master plan only runs Phases 0–6, and there is no Phase-7 spec to align
with (see `docs/architecture.md`, `docs/PROGRESS-TRACKER.md` parking lot, and the hook
file comments). The point that matters for *this* work regardless: converge floating +
feed, leave classic untouched, and don't fork a third copy. That's why it's less new
build than it feels — both halves exist, and connecting them moves toward that eventual
clean-up rather than adding to the duplication.

---

## 10. Open question — mobile

Still deferred. Likely: feed mode becomes the full-screen scroll, the slide a tap-up
sheet. Not a desktop-test blocker; decide before a mobile pass.

---

## 11. Status / next steps

- This note records the direction; it is not "built."
- Prerequisite done: `docs/BEHAVIOURS.md` backfill (preserves current micro-behaviours,
  incl. the greyed-snapshot treatment).
- Build: see `cc-prompt-feed-deck-spectrum.md` — staged slices that bring
  `FloatingViewer` + `DeckFeed` onto one resizable screen (left rail↔feed; folding
  comments panel), targeting floating + feed only (never classic), and converging the
  duplicated logic rather than forking a third copy (the informal "Phase-7" tidy-up
  direction, not a planned milestone).
- Defer: mobile; text-selection comments; any "carry forward open items" toggle.
- Update `docs/PROGRESS-TRACKER.md` as slices land, and `docs/BEHAVIOURS.md` for every
  UI behaviour touched (house style).
