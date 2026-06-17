# Claude Code — quick adjustment: the top-right action cluster

*Paste the block below into CC. It's a small, self-contained change to how the Send to AI / Comments / Share buttons look. Working rules apply (plan first, plain English, reuse existing components, tell me how to check it).*

---

```
A small UI adjustment to the viewer's top-right action cluster (the Send to AI, Comments, and Share buttons). Right now all three are filled and equally bold, which makes the toolbar feel busy. I've decided how to fix it — please apply this as specified (the reasoning is included so you keep it consistent):

THE CHANGE — fix it with hierarchy, not more colour:
1. Order, left → right: "Send to AI", then "Comments", then "Share".
2. Share = FILLED purple — the primary, everyday action, and the only filled button in the cluster.
3. Send to AI = PURPLE OUTLINE (white background, purple border + purple text, the sparkle ✦ icon, the "· N" count, and the dropdown chevron for the existing split menu). A calm secondary action, not a competitor to Share.
4. Comments = NOT a filled button anymore — make it a quiet, bare ICON + count (speech-bubble icon + the number). It only toggles the comments panel, so it shouldn't look like an action. It sits in the middle.

THE COLOUR RULE behind this (so it stays consistent everywhere):
- PURPLE = actions I take — Share, the composer's Send, and Send to AI (invoking the AI is something I do).
- AMBER = the AI's own voice — its posts in the feed, the "Queued for AI" / "Sent to AI" chips, the AI's avatar. Amber is NOT used on the button I press to invoke it.
- TEAL = the team (unchanged).
IMPORTANT: keep amber where it already marks the AI's voice (feed posts, chips, avatar) — only move it OFF the Send-to-AI button. (The button may currently say "Send to Claude" — keep that label for now; the rename is for later.)

Please:
1. Show me your plan and which file(s)/component(s) you'll touch, and wait for my go-ahead.
2. REUSE/adapt the existing button components — don't rebuild them.
3. After building, show me a screenshot so I can confirm the cluster feels calm, and tell me how to view it myself.
4. Note any other spot in the code that still treats Send to AI as amber, so we catch all of it.
```
