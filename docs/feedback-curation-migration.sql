-- SlideHuddle feedback-curation migration
-- Run this once in Supabase → SQL editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS).
--
-- Lets the deck owner curate the feedback that gets sent to Claude, from the
-- normal comments/stub/flag UI:
--   * dismissed         — owner excluded this item from the Claude prompt
--                         (still shown in the panel, just not sent).
--   * owner_edited_*     — owner's edited version of the text sent to Claude.
--                         The original author's text is preserved untouched in
--                         the existing body/reason column; this is stored
--                         separately so the author's words are never lost.
-- All default to "included, unedited", so existing data is unaffected.

-- Comments -------------------------------------------------------------
alter table public.comments
  add column if not exists dismissed boolean not null default false;
alter table public.comments
  add column if not exists owner_edited_body text;

-- Requested (stub) slides ---------------------------------------------
alter table public.slide_stubs
  add column if not exists dismissed boolean not null default false;
alter table public.slide_stubs
  add column if not exists owner_edited_body text;

-- Removal flags --------------------------------------------------------
alter table public.slide_flags
  add column if not exists dismissed boolean not null default false;
alter table public.slide_flags
  add column if not exists owner_edited_reason text;
