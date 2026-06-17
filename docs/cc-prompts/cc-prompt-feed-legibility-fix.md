# Claude Code — read-only feed (P1.2): the version-spine architecture

*The horizontal item cards, thumbnails, type icons, slide pills, click-to-peek, and per-slide stats are already built and working. What's left is the VERSION-SPINE architecture — making versions the chronological backbone with the conversation nested beneath each round, plus AI provenance and addressed-feedback handling. It ends with a Phase 1 completeness check. Paste the block into CC. Working rules apply (plan first, plain English, reuse existing components, mockups are reference-only, show me a screenshot).*

---

```
The read-only feed (P1.2) is mostly there — the horizontal item cards with slide thumbnails, type icons, slide pills, click-to-peek, and per-slide stats in the deck peek are all working well. The remaining piece is the VERSION-SPINE architecture: right now version events are just plain text lines ("Greg published deck v4 · 6 slides") stacked together, with no provenance and no structure. This is a styling/structure pass — NOT new features. Do NOT add Phase 3 stuff (messages table, threading, slide-quoting, decisions, a composer). Use slidehuddle-design-system.md for colours/tokens; reuse existing components.

1. VERSION-SPINE ARCHITECTURE — versions are the BACKBONE of the feed (the "break points" where each round of collaboration resets), not plain text lines. Restructure the chronology to read as nested rounds:

   - VERSIONS are FULL-WIDTH, LEFT-JUSTIFIED spine events — visually more prominent and less indented than the conversation, so scanning the left edge tells you the rounds of work. Everything else (comments, requests, flags) INDENTS underneath the version it happened during, connected by a vertical thread line (two levels only — version spine, then indented items; do not nest deeper).

   - THREE LEVELS OF PROMINENCE:
     (a) v1 = the RICH "huddle started" card — the most substantial event in the feed: avatar + "[Owner] started this huddle · [deck title] · [N] slides · [date]" + a HORIZONTALLY SCROLLABLE thumbnail strip of the slides, each thumbnail clicking through to that slide in the deck. This replaces the plain "shared/published deck v1" line.
     (b) v2+ = LEANER spine breaks — same full-width left-justified treatment but compact (punctuation, not the opening): the AI icon + "[AI] published v[N] · [N] slides", a sub-line "requested by [name] · addressed N comments[, N removals] · [date]", a "see changes ▸" affordance (a simple stub for now — see scope note), and the scrollable thumbnail strip for that version.
     v1 still follows the same structure (its conversation indents under it) — it's just the richest-looking spine event.
     (Right now three "published v4/v5/v6" lines stack together — under this structure each becomes its own spine break in true chronological position, with its round's conversation beneath it.)

   - AI PROVENANCE — capture and show WHICH AI produced each version (currently it says "Greg published", which is wrong — a human requests, the AI produces). We don't store this yet, so ADD a small field to the version (e.g. source / ai_provider) captured at create/update time: the MCP path knows if it's Claude vs ChatGPT calling; the extension path knows it's claude.ai. Show the AI's icon + name ("✦ Claude published v2… · requested by Greg"). If the source is unknown, fall back to a generic "AI published…" — do NOT guess/attribute a specific AI you can't verify. (This field also sets up the multi-AI strategy later.) Tell me what you added and where it's captured.

   - ADDRESSED FEEDBACK CROSSED OUT — when a later version has addressed a comment/request/flag, show that item STRUCK-THROUGH and dimmed with a tag "✓ Addressed in v[N] · [date]" linking UP to that version's spine event. (Use the resolution data we already have — the read-only twin of the resolution logic. If an item was DISMISSED by the owner rather than actioned, show it differently: struck-through with "Won't action" — not "Addressed".)

   - OPENS AT THE CURRENT VERSION, not the top: when the feed loads, scroll so the CURRENT (latest) version's spine break sits a little BELOW the top of the viewport — leave a slice of the previous round visible above it so the user can see there's older content (~15-20% down is a starting point; tune by eye — do NOT hardcode a percentage that breaks on different screen heights). Mark the current version "current" (small pill) and tint it subtly. Add an "↑ earlier in this huddle" affordance above it. GUARD the short-feed case: if there's NO content above the current version (brand-new huddle), just show from the top — don't force an awkward offset.

   - Keep date dividers where they help, but the version spine is the primary chronological structure.

   SCOPE NOTE: do the ARCHITECTURE and PRESENTATION now (spine + indentation + v1-rich-card + open-at-current + provenance capture + crossed-out addressed items) — these reorganise/annotate data we mostly already have. Keep the DEEPER richness SHALLOW and forward-compatible: "see changes ▸" can expand to a simple list of which comments/stubs/flags that version resolved, NOT an AI-written change summary or a full decisions view (those are Phase 3/4). If any of this seems to require the Phase 3 messages/decisions model, stop and tell me.

2. WHILE YOU'RE IN HERE — check for any remaining DUPLICATE items in the feed (e.g. the same requested slide appearing more than once); if you find duplication, find why and stop it. (The existing item cards, pills, thumbnails, click-to-peek and per-slide stats are working — don't rework those; just don't regress them.)

Show me your plan first (the version-spine event should be ONE reusable component). Then build it, show me a screenshot at desktop width AND a narrow/mobile width (the indented spine needs to still work when narrow — indentation may reduce on small screens), and tell me how to view it with a few test users.

PHASE 1 COMPLETENESS CHECK — before you call P1.2 done, re-read slidehuddle-gap-analysis-plan.md (Phase 1) and PROGRESS-TRACKER.md, and confirm with a yes/no + one line each:
- Does the feed compose ALL existing item types — comments, requested slides (stubs), removal flags, AND version events?
- Is it instrumented with the Phase 0 analytics (P0.2) so I can measure feed vs deck usage — and is the DECK view instrumented too, so I can compare? (Evidence for the Phase 1 gate.)
- Is it flag-gated and default-ON for the design-partner accounts, with everyone else still landing on the deck view?
- Does it stay READ-ONLY (no composer, threading, decisions, slide-quoting) — nothing from Phase 3 leaked in?
- Does participation work end-to-end: read in the feed, open the deck to comment/request/flag, see the new item back in the feed?
List anything in P1.2 (or P1.1, e.g. the floating-viewer gaps) that is NOT yet done, so I have a clear picture of what's left before the Phase 1 validation gate. Don't fix those now unless tiny — just tell me.

Then update PROGRESS-TRACKER.md (P1.2). If quick, also reflect the version-spine architecture into slidehuddle-design-system.md so doc and build stay in sync — otherwise tell me and I'll handle the doc.
```
