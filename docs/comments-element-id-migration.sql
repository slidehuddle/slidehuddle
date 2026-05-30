-- SlideHuddle comments: add element_id column
-- Run this once in Supabase → SQL editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS).
--
-- The viewer redesign keeps using the existing `comments` table (one row per
-- comment on a specific slide of a specific deck). The only schema change it
-- needs is a nullable `element_id` column, reserved for future element-level
-- comments. v1 always leaves it NULL — it's here so we don't need another
-- migration when element-level comments land.

alter table public.comments
  add column if not exists element_id text;
