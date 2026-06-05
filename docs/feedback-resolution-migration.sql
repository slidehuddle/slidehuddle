-- Non-destructive feedback resolution.
--
-- When a deck is updated in response to feedback, the requested slides and
-- removal flags that were acted on should stop showing as open — but we want to
-- KEEP the record (auditable), not delete it. This adds a nullable `resolved_at`
-- timestamp to both tables: NULL = still open, a timestamp = resolved (and when).
--
-- Comments are unaffected: they're version-scoped, so last round's comments
-- already fall out of the current version automatically and persist on the
-- version they were written on.
--
-- Additive and idempotent — safe to re-run. Existing rows stay NULL (open), so
-- nothing changes until the app starts marking items resolved.

alter table public.slide_stubs
  add column if not exists resolved_at timestamptz;

alter table public.slide_flags
  add column if not exists resolved_at timestamptz;

-- Partial indexes to keep the "open feedback" reads (resolved_at IS NULL) fast.
create index if not exists slide_stubs_open_idx
  on public.slide_stubs (deck_id)
  where resolved_at is null;

create index if not exists slide_flags_open_idx
  on public.slide_flags (deck_id)
  where resolved_at is null;
