# Read the house style first

**Before starting any task, read [`docs/HOUSE-STYLE.md`](../docs/HOUSE-STYLE.md) and follow it.** In particular: plan in plain English before building, reuse existing components, flag anything security-sensitive (auth / Supabase RLS / service-role key / MCP surface), and **document any user-visible behaviour you create or change in [`docs/BEHAVIOURS.md`](../docs/BEHAVIOURS.md) in the same change** (a task that changed UI behaviour but left `BEHAVIOURS.md` untouched is not finished). `docs/HOUSE-STYLE.md` is the single source of truth — these are pointers, not a copy.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
