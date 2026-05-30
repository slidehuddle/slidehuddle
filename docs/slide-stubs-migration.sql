-- SlideHuddle slide_stubs migration
-- Run this once in Supabase → SQL editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- A "stub" is a placeholder slide a collaborator requests be added to the
-- deck — a title, subtitle, and a description of what the slide should cover.
-- It sits at a `position` in the deck (how many real slides come before it),
-- so a stub with position = 2 renders after the deck's 2nd slide. The real
-- slides themselves are never modified — stubs are an overlay on top of the
-- captured HTML.

-- 1. slide_stubs table --------------------------------------------------
create table if not exists public.slide_stubs (
  id           uuid        primary key default gen_random_uuid(),
  deck_id      text        not null references public.decks(id) on delete cascade,
  position     integer     not null check (position >= 0),
  title        text        check (title is null or length(title) <= 200),
  subtitle     text        check (subtitle is null or length(subtitle) <= 300),
  body         text        check (body is null or length(body) <= 4000),
  requested_by uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Stable ordering when we render the deck: stubs grouped by deck, ordered
-- by where they sit and then by when they were requested.
create index if not exists slide_stubs_deck_position_created_idx
  on public.slide_stubs (deck_id, position, created_at);

-- 2. Row Level Security -------------------------------------------------
-- Mirrors the comments policies: a stub is gated behind deck access. The
-- viewer page itself reads stubs server-side with the service-role key
-- (so anonymous link-viewers still see them in the strip); these policies
-- govern the *browser* client used to insert/remove a stub.
alter table public.slide_stubs enable row level security;

drop policy if exists "slide_stubs_select_on_accessible_decks" on public.slide_stubs;
drop policy if exists "slide_stubs_insert_on_accessible_decks" on public.slide_stubs;
drop policy if exists "slide_stubs_delete_own"                  on public.slide_stubs;

create policy "slide_stubs_select_on_accessible_decks"
  on public.slide_stubs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.decks d
      where d.id = slide_stubs.deck_id and d.user_id = auth.uid()
    )
    or exists (
      select 1 from public.shared_decks sd
      where sd.deck_id = slide_stubs.deck_id and sd.user_id = auth.uid()
    )
  );

create policy "slide_stubs_insert_on_accessible_decks"
  on public.slide_stubs
  for insert
  to authenticated
  with check (
    auth.uid() = requested_by
    and (
      exists (
        select 1 from public.decks d
        where d.id = slide_stubs.deck_id and d.user_id = auth.uid()
      )
      or exists (
        select 1 from public.shared_decks sd
        where sd.deck_id = slide_stubs.deck_id and sd.user_id = auth.uid()
      )
    )
  );

create policy "slide_stubs_delete_own"
  on public.slide_stubs
  for delete
  to authenticated
  using ( auth.uid() = requested_by );
