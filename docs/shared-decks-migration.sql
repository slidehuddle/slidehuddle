-- SlideHuddle shared-decks migration
-- Run this once in Supabase → SQL editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).

-- 1. shared_decks table -------------------------------------------------
-- Links a signed-in user to a deck someone else shared with them.
-- The deck itself stays in public.decks; this table just records that
-- the user has "accessed" the deck and should see it in their dashboard
-- under "Shared with me".
create table if not exists public.shared_decks (
  deck_id    text        not null references public.decks(id) on delete cascade,
  user_id    uuid        not null references auth.users(id)   on delete cascade,
  role       text        not null default 'viewer'
              check (role in ('viewer', 'commenter')),
  created_at timestamptz not null default now(),
  primary key (deck_id, user_id)
);

-- Helpful index for the dashboard query (list-shared-by-user, newest first).
create index if not exists shared_decks_user_id_created_at_idx
  on public.shared_decks (user_id, created_at desc);

-- 2. Row Level Security on shared_decks ---------------------------------
alter table public.shared_decks enable row level security;

drop policy if exists "shared_decks_select_own" on public.shared_decks;
drop policy if exists "shared_decks_insert_own" on public.shared_decks;
drop policy if exists "shared_decks_delete_own" on public.shared_decks;

-- Users see only their own shared_decks rows.
create policy "shared_decks_select_own"
  on public.shared_decks
  for select
  to authenticated
  using ( auth.uid() = user_id );

-- Users can only insert rows for themselves.
create policy "shared_decks_insert_own"
  on public.shared_decks
  for insert
  to authenticated
  with check ( auth.uid() = user_id );

-- Users can remove their own shared_decks rows (future "remove from shared
-- with me" UI). They can't delete rows for other users.
create policy "shared_decks_delete_own"
  on public.shared_decks
  for delete
  to authenticated
  using ( auth.uid() = user_id );

-- 3. Update decks SELECT policy to allow shared access ------------------
-- The previous policy let a signed-in user read only decks they own. With
-- the new shared_decks table, the dashboard's "Shared with me" join needs
-- to read those decks too. We widen the SELECT policy: a user can read a
-- deck if they own it OR if it's linked to them via shared_decks.
--
-- The viewer page still uses the service-role key (which bypasses RLS),
-- so anonymous link-viewing keeps working for everyone.
drop policy if exists "decks_select_own"        on public.decks;
drop policy if exists "decks_select_own_or_shared" on public.decks;
create policy "decks_select_own_or_shared"
  on public.decks
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.shared_decks
      where shared_decks.deck_id = decks.id
        and shared_decks.user_id = auth.uid()
    )
  );
