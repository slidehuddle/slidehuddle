-- SlideHuddle comments migration
-- Run this once in Supabase → SQL editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).

-- 1. comments table -----------------------------------------------------
-- One row per comment on a specific slide of a specific deck.
-- parent_id and resolved are reserved for future replies / triage UI;
-- v1 ignores them but the columns are here so we don't need another
-- migration when those features land.
create table if not exists public.comments (
  id           uuid        primary key default gen_random_uuid(),
  deck_id      text        not null references public.decks(id) on delete cascade,
  user_id      uuid        not null references auth.users(id)   on delete cascade,
  author_email text,
  slide_index  integer     not null check (slide_index >= 0),
  parent_id    uuid        references public.comments(id) on delete cascade,
  body         text        not null check (length(body) > 0 and length(body) <= 4000),
  resolved     boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Quick lookup of all comments on a deck, ordered for stable rendering.
create index if not exists comments_deck_slide_created_idx
  on public.comments (deck_id, slide_index, created_at);

-- 2. Row Level Security -------------------------------------------------
alter table public.comments enable row level security;

drop policy if exists "comments_select_on_accessible_decks" on public.comments;
drop policy if exists "comments_insert_on_accessible_decks" on public.comments;
drop policy if exists "comments_update_own"                  on public.comments;
drop policy if exists "comments_delete_own"                  on public.comments;

-- You can read a comment if you can access the deck — i.e. you own the
-- deck OR have a shared_decks row for it. Anonymous link-viewers (anon
-- role) have no policy and therefore see nothing.
create policy "comments_select_on_accessible_decks"
  on public.comments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.decks d
      where d.id = comments.deck_id
        and d.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.shared_decks sd
      where sd.deck_id = comments.deck_id
        and sd.user_id = auth.uid()
    )
  );

-- You can post a comment as yourself, on a deck you can access. The
-- user_id check ensures you can't impersonate someone else.
create policy "comments_insert_on_accessible_decks"
  on public.comments
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      exists (
        select 1
        from public.decks d
        where d.id = comments.deck_id
          and d.user_id = auth.uid()
      )
      or exists (
        select 1
        from public.shared_decks sd
        where sd.deck_id = comments.deck_id
          and sd.user_id = auth.uid()
      )
    )
  );

-- Edit / delete only your own comments. Resolving / replying (future)
-- will use these policies as-is.
create policy "comments_update_own"
  on public.comments
  for update
  to authenticated
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

create policy "comments_delete_own"
  on public.comments
  for delete
  to authenticated
  using ( auth.uid() = user_id );
