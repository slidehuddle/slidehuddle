-- SlideHuddle slide_flags migration
-- Run this once in Supabase → SQL editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- A "flag" marks a real slide for removal, with a reason. One row per flag.
-- Flags attach to a slide by its stable 0-based index into the captured
-- deck (slide_index), the same key comments use — so a flag never drifts
-- onto the wrong slide when stubs are inserted around it.

-- 1. slide_flags table --------------------------------------------------
create table if not exists public.slide_flags (
  id          uuid        primary key default gen_random_uuid(),
  deck_id     text        not null references public.decks(id) on delete cascade,
  slide_index integer     not null check (slide_index >= 0),
  reason      text        check (reason is null or length(reason) <= 2000),
  flagged_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists slide_flags_deck_slide_idx
  on public.slide_flags (deck_id, slide_index);

-- 2. Row Level Security -------------------------------------------------
-- Same access model as comments / stubs: gated behind deck access for the
-- browser client; the viewer page reads flags server-side with the
-- service-role key so anonymous link-viewers see the dimmed/flagged state.
alter table public.slide_flags enable row level security;

drop policy if exists "slide_flags_select_on_accessible_decks" on public.slide_flags;
drop policy if exists "slide_flags_insert_on_accessible_decks" on public.slide_flags;
drop policy if exists "slide_flags_delete_own"                  on public.slide_flags;

create policy "slide_flags_select_on_accessible_decks"
  on public.slide_flags
  for select
  to authenticated
  using (
    exists (
      select 1 from public.decks d
      where d.id = slide_flags.deck_id and d.user_id = auth.uid()
    )
    or exists (
      select 1 from public.shared_decks sd
      where sd.deck_id = slide_flags.deck_id and sd.user_id = auth.uid()
    )
  );

create policy "slide_flags_insert_on_accessible_decks"
  on public.slide_flags
  for insert
  to authenticated
  with check (
    auth.uid() = flagged_by
    and (
      exists (
        select 1 from public.decks d
        where d.id = slide_flags.deck_id and d.user_id = auth.uid()
      )
      or exists (
        select 1 from public.shared_decks sd
        where sd.deck_id = slide_flags.deck_id and sd.user_id = auth.uid()
      )
    )
  );

create policy "slide_flags_delete_own"
  on public.slide_flags
  for delete
  to authenticated
  using ( auth.uid() = flagged_by );
