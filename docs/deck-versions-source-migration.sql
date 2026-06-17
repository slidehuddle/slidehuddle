-- P1.2 — AI provenance on deck versions.
-- Adds a nullable `source` column to deck_versions recording WHICH AI produced
-- the version (e.g. 'claude', 'chatgpt', 'other'), captured at create/update
-- time. NULL = unknown (e.g. versions created before this migration) → the feed
-- shows a generic "AI published…". Safe to run more than once.
--
-- Run in the Supabase SQL editor (production), same as the earlier migrations.

alter table public.deck_versions
  add column if not exists source text;

-- (No backfill: historical versions genuinely have no known source.)
