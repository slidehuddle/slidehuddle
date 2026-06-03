-- SlideHuddle comments version migration
-- Run this once in Supabase → SQL editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS).
--
-- Ties each comment to the deck version it was written on, so a comment made
-- on v1 no longer appears when viewing v2. The viewer stamps every new comment
-- with the version being viewed and reads comments filtered by that version.
--
-- Existing comments default to version 1: they were all created before any
-- deck had a second version, so v1 is the correct home for them.

alter table public.comments
  add column if not exists version integer not null default 1;

-- The viewer queries comments by (deck_id, version, slide_index), ordered by
-- created_at. Index that path; the older comments_deck_slide_created_idx can
-- stay (harmless) or be dropped manually later.
create index if not exists comments_deck_version_slide_created_idx
  on public.comments (deck_id, version, slide_index, created_at);
