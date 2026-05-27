-- SlideHuddle auth migration
-- Run this once in Supabase → SQL editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).

-- 1. Schema changes -----------------------------------------------------
-- Add user_id, title, slide_count to the existing decks table.
-- user_id is nullable on purpose: extension POSTs from claude.ai have no
-- session cookie and create orphan decks. Those stay viewable by link.
alter table public.decks
  add column if not exists user_id    uuid references auth.users(id) on delete set null,
  add column if not exists title       text,
  add column if not exists slide_count integer;

-- Helpful index for the dashboard query (list-by-user, newest first).
create index if not exists decks_user_id_created_at_idx
  on public.decks (user_id, created_at desc);

-- 2. Row Level Security -------------------------------------------------
-- Make sure RLS is on (it should already be).
alter table public.decks enable row level security;

-- Wipe any previous SlideHuddle policies so this script is idempotent.
drop policy if exists "decks_select_own" on public.decks;
drop policy if exists "decks_insert_own" on public.decks;
drop policy if exists "decks_update_own" on public.decks;
drop policy if exists "decks_delete_own"  on public.decks;

-- Signed-in users can read their own decks via the anon key.
-- (Service-role key bypasses RLS — that's how the viewer keeps working for
-- everyone, including orphan decks. RLS only governs anon-key access.)
create policy "decks_select_own"
  on public.decks
  for select
  to authenticated
  using ( auth.uid() = user_id );

-- Insert their own rows only. The API uses the service-role key today, so
-- this is defence-in-depth in case we ever switch the dashboard to insert
-- via the anon client.
create policy "decks_insert_own"
  on public.decks
  for insert
  to authenticated
  with check ( auth.uid() = user_id );

-- Update / delete only their own rows.
create policy "decks_update_own"
  on public.decks
  for update
  to authenticated
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

create policy "decks_delete_own"
  on public.decks
  for delete
  to authenticated
  using ( auth.uid() = user_id );

-- Note: we deliberately do NOT grant any policy to the `anon` role. That
-- means logged-out users hitting Supabase directly with the anon key see
-- nothing. The /viewer page still works because it reads via the
-- service-role key on the server (bypassing RLS).
