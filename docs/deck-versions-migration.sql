-- deck_versions: full history of a deck's captured HTML across updates.
--
-- The `decks` row remains the "latest pointer" — its html_content / version /
-- title / slide_count always mirror the newest version, so the viewer keeps
-- reading decks.html_content with no change. Each version (including v1) also
-- gets an immutable snapshot row here, so we can show version history later
-- and (eventually) roll back.
--
-- Writes happen exclusively through the service-role key in /api/slides, which
-- bypasses RLS. The SELECT policy below is for the future history UI, which
-- will read with the signed-in user's session.
--
-- Idempotent — safe to re-run.

create table if not exists public.deck_versions (
  id           uuid primary key default gen_random_uuid(),
  deck_id      text not null references public.decks(id) on delete cascade,
  version      integer not null,
  html_content text not null,
  title        text,
  slide_count  integer,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  unique (deck_id, version)
);

create index if not exists deck_versions_deck_id_idx
  on public.deck_versions (deck_id);

alter table public.deck_versions enable row level security;

-- Authenticated users may read versions of decks they own OR that have been
-- shared with them (mirrors decks_select_own_or_shared). Anon role gets no
-- policy, so unauthenticated link-viewers can't read history directly; the
-- viewer never needs to (it reads decks.html_content via the service role).
drop policy if exists deck_versions_select_own_or_shared on public.deck_versions;
create policy deck_versions_select_own_or_shared on public.deck_versions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.decks d
      where d.id = deck_versions.deck_id
        and d.user_id = auth.uid()
    )
    or exists (
      select 1 from public.shared_decks s
      where s.deck_id = deck_versions.deck_id
        and s.user_id = auth.uid()
    )
  );
