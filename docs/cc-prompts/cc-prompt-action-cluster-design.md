# Claude Code — Design decision: the top-right action cluster

*A short, doc-first task. Run it before P1.1 Stage B (the deck-viewer redesign), so the design system is correct before you build the cluster. Updates `slidehuddle-design-system.md`; informs `cc-prompts-phase-1.md` (P1.1).*

---

## Paste this into CC

```
A small design task — mostly updating our design doc, then it informs the P1.1 build. Working rules apply (I'm non-technical; plan first in plain English; reuse existing components; the visual mockups are reference-only, not code to copy). This is a DESIGN DECISION I've made — please apply it as specified rather than re-deciding it; I've included the reasoning so you apply it consistently.

THE DECISION — the viewer's top-right action cluster
Today three filled, equally-loud buttons (Send to AI, Comments, Share) compete and make the toolbar feel busy. We're fixing it with HIERARCHY, not more colour. New rules:

1. Layout, left → right: "Send to AI", then "Comments", then "Share".
2. Share = FILLED purple. It's the primary, everyday action — the only filled button in the cluster.
3. Send to AI = PURPLE OUTLINE (white background, purple border + purple text, the ✦/sparkle icon, the "· N" count, and the dropdown chevron for the existing split-button menu). It's a calm secondary action — a sibling of Share, not a competitor.
   - Optional, LATER (don't build now, just note it in the doc as a future enhancement): Send to AI may become filled purple ONLY when there is curated feedback waiting to send, and return to outline when the count is zero. Context-aware emphasis. Not required for now.
4. Comments = NOT a filled button. It becomes a quiet, bare ICON + count (a speech-bubble icon and the number, e.g. "8"), because it only toggles the comments panel — it's not an action. It sits in the middle.

Result: one filled button (Share) plus two quiet elements. Calm and content-first.

THE COLOUR-SYSTEM RULE THIS CHANGES (the important part)
We are refining what amber means, so the system stays consistent across the whole app. The rule is now:
- PURPLE = me and the product, including ALL ACTIONS I TAKE — Share, the composer's Send, and Send to AI. (Invoking the AI is an action I take, so its button is purple.)
- AMBER = the AI's OWN VOICE / PRESENCE — the AI's posts in the feed, the "Queued for AI" / "Sent to AI" chips, the AI avatar, and version events authored by the AI. Amber is NOT used on the button I press to invoke the AI.
- TEAL = the team (unchanged: comments, presence, decision badges, stubs).
Plain-English logic to keep it straight: purple = what I do, teal = what the team does, amber = what the AI does. The Send-to-AI button is something I do (purple); Claude's reply in the feed is the AI speaking (amber).
IMPORTANT: keep amber where it already signals the AI's voice (feed posts, chips, avatar, AI-authored version events). Do NOT strip amber from those — we're only moving it OFF the Send-to-AI button.

WHAT TO DO
1. Update slidehuddle-design-system.md:
   - §2.2 (the colour table / rules): rewrite the purple and amber rows to match the rule above (purple includes Send to AI and all user actions; amber is the AI's voice only, explicitly not the invoke-the-AI button). Add the one-line "what I do / what the team does / what the AI does" logic.
   - §5 (component inventory): update the action-cluster / button specs — Share filled purple; Send to AI purple-outline (icon, count, chevron) with the optional context-aware-fill noted as a future enhancement; Comments as a bare icon + count, placed in the middle.
   - §10 (the punch list): the item that currently says "amber restored to Send to AI" now CONTRADICTS this decision — replace it with "Send to AI is purple-outline (it's a user action, not the AI's voice), per the revised §2.2 colour rule."
   Show me, in plain English, the before/after of each section you changed, and wait for my go-ahead before saving — I want to confirm the wording.
2. Once I approve the doc changes, this becomes the authoritative spec for P1.1 Stage B (the deck-viewer redesign). When you build that, follow the updated §5 — and reuse/adapt our existing button components rather than making new ones.
3. When you build the cluster (in P1.1), show me a screenshot so I can confirm it feels calm before it rolls out.

Note any other place in the doc or code that still implies "amber = Send to AI" so we catch all of it. Update PROGRESS-TRACKER.md if this counts as progress on P1.1 (a design-spec sub-step), otherwise just note it in the session log.
```

---

## Notes for you (not for CC)

- **The decision encoded above is option 4-a** — purple-outline Send to AI, with amber kept for the AI's *voice* (feed posts, chips, avatar). To switch to **option 2** (amber-outline button) or **option 4-b** (drop amber entirely), change the colour-rule paragraph and the §2.2/§5 instructions accordingly — tell me and I'll rewrite the prompt.
- **Ownership / avoiding drift:** this prompt has CC edit `slidehuddle-design-system.md` directly. That's good *if* we now treat the **repo copy as the single source of truth** going forward (like TECHNICAL.md). I'm deliberately **not** keeping a separate updated copy of my own, so we don't recreate the two-versions drift you flagged earlier. From here, the design system lives in the repo and CC maintains it; if you want a change, ask CC (or ask me and I'll give you exact text to paste).
- **Mockups:** `slidehuddle-mockups-v2.html` still shows Send to AI in amber fill — it's illustration only, and the design-system doc now wins where they disagree. Not worth updating the mockup unless you want it visually exact; CC builds from the doc, not the mockup.
- This is genuinely low-stakes and reversible — once it's in, let the design partners react rather than us iterating further.
```
