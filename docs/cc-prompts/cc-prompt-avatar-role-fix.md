# Claude Code — fix the avatar owner/collaborator shape (surgical)

*The avatar colours and initials are correct. The ROLE shape is not: collaborators are showing as filled (only the owner should be filled), and the owner is highlighted differently in the floating navigation vs the feed. One consistent rule, applied from one place. Paste the block into CC. Working rules apply.*

---

```
Small, surgical fix to the avatar component — do NOT rebuild the feed, and don't change the avatar colours or initials (those are correct: greg@getpinpoint -> GR and greg.manzanera -> GM are two different accounts, so two different avatars is right; Juan Castro -> JC is also right).

The problem is the ROLE shape (filled vs outline):
1. COLLABORATORS are currently showing as FILLED avatars. Only the deck OWNER should be filled. Collaborators must be OUTLINE (coloured ring + initials on a light tint of their colour).
2. The OWNER is highlighted DIFFERENTLY in the floating navigation (the Huddlers cluster at the top) vs in the FEED. It must look the SAME in both — and everywhere else an avatar appears.

Root cause to fix: the filled-vs-outline decision must be driven by ACTUAL DECK OWNERSHIP (is this user's id == the deck's user_id / owner?), resolved in ONE place — the shared avatar component — and every surface (feed items, the Huddlers cluster, the floating nav, anywhere else) must use that same component and the same rule. No surface should compute "is owner" or "highlight the owner" on its own.

So:
- Make the avatar component take whatever it needs to know if the user is the owner (e.g. pass the deck owner id, or an isOwner flag resolved centrally), and render: owner = FILLED (solid colour bg, white initials); everyone else = OUTLINE (2px ring + initials in their colour on a light tint fill). The AI stays its own distinct ink + sparkle treatment.
- Find and REMOVE any separate owner-highlighting logic in the floating nav / Huddlers cluster that differs from the feed — they should all just render the shared avatar.
- Confirm with my test accounts: greg@getpinpoint and greg.manzanera and Juan Castro — whichever is the deck's owner should be filled in BOTH the feed and the floating nav; the other two should be outline in both. Tell me which account your code thinks is the owner so I can verify it's right.

Show me your plan first (where the avatar component lives, and every place that currently renders an avatar or highlights the owner). Then fix it, show me a screenshot of BOTH the feed and the floating nav so I can see they match, and tell me how to check. Update PROGRESS-TRACKER.md (P1.2) if relevant.
```
