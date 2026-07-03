# How we work — Claude Code house style

> **Canonical source of truth for how Claude Code works on SlideHuddle.** Read this at the start of every task and follow it. It's referenced from the session-start files (`web/AGENTS.md` → imported by `web/CLAUDE.md`) so it's loaded when work begins. If you change how we work, change it here — don't fork these rules into other files; point at this one instead.

---

## About the founder

- The founder is non-technical. Explain your plan in plain English before building. Build incrementally. Don't break existing functionality. Always tell me how to test what you changed, step by step.
- When you hit a decision or an interactive option-dialog, surface the choices with a clear recommendation and your reasoning — I may reply with a screenshot.
- I value seeing designs visually before approving — prefer a mockup/visual before building UI.

## Working method for any task

- Plan first, in plain English. Wait for go-ahead on anything non-trivial.
- Reuse existing components; don't create parallel copies or rename files. Any mockups I share are reference-only, not code to copy.
- Use the real repo filenames (the repo uses shorter names than originally generated — no `slidehuddle-` prefix).
- Keep each task scoped to one phase/item; don't let it balloon into later-phase work.

## Security-sensitive work — flag and report

- Flag anything that touches authentication, Supabase RLS, the service-role key, or the MCP surface. For those, build with explicit per-point security checks and report exactly what you verified. When in doubt, stop and ask.

## Document user-visible behaviour as you build it

- `docs/BEHAVIOURS.md` is a living catalogue of the app's user-visible behaviours. It is a build artifact, not an afterthought — keep it true to the code at all times.
- **The rule:** whenever you create or change any user-visible behaviour, record it in `docs/BEHAVIOURS.md` *in the same change*, before the task is done. "User-visible behaviour" includes at minimum: hover states, active/selected states, empty states, loading states, error states, disabled states, transitions and animations, colour-on-state (e.g. greyed-then-colour-on-hover), struck-through / dimmed treatments, micro-interactions, and all user-facing copy (button labels, chips, toasts, helper text, empty-state text).
- **Each entry records:** the element in plain language, where it lives (screen + component file), every state it can be in, what it looks like and does in each state, the exact user-facing copy quoted verbatim, and what triggers each state change.
- If you change an existing behaviour, update its entry in the same change. If you remove a behaviour, remove or mark its entry.
- A task that changed user-visible behaviour but left `docs/BEHAVIOURS.md` untouched is **not finished.**

## Close-out for every task

- Update `docs/PROGRESS-TRACKER.md` with what landed and what's pending.
- Update `docs/BEHAVIOURS.md` for any UI behaviour touched.
- In your end-of-task summary, state explicitly: (a) which `BEHAVIOURS.md` entries you added or changed, or "none — no user-visible behaviour touched"; and (b) what, if anything, was security-sensitive and what you verified.
