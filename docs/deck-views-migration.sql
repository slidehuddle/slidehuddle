-- SlideHuddle deck_views migration
-- Run this once in Supabase → SQL editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).

-- 1. deck_views table ---------------------------------------------------
-- One row per (deck, user) recording when that user last viewed the
-- deck. Used to compute "unread" comment counts on the dashboard:
-- comments created_at > last_viewed_at = unread.
create table if not exists public.deck_views (
  deck_id        text        not null references public.decks(id) on delete cascade,
  user_id        uuid        not null references auth.users(id)   on delete cascade,
  last_viewed_at timestamptz not null default now(),
  primary key (deck_id, user_id)
);

create index if not exists deck_views_user_id_idx
  on public.deck_views (user_id);

-- 2. Row Level Security -------------------------------------------------
alter table public.deck_views enable row level security;

drop policy if exists "deck_views_select_own" on public.deck_views;
drop policy if exists "deck_views_insert_own" on public.deck_views;
drop policy if exists "deck_views_update_own" on public.deck_views;

create policy "deck_views_select_own"
  on public.deck_views
  for select
  to authenticated
  using ( auth.uid() = user_id );

create policy "deck_views_insert_own"
  on public.deck_views
  for insert
  to authenticated
  with check ( auth.uid() = user_id );

create policy "deck_views_update_own"
  on public.deck_views
  for update
  to authenticated
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );
