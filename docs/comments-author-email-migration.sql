-- SlideHuddle comments: stop author_email spoofing at the database
-- Run this once in Supabase → SQL editor → New query → paste → Run.
-- Safe to re-run (DROP POLICY IF EXISTS).
--
-- BACKGROUND: comments are inserted by the BROWSER client (SlideViewer), which
-- supplies `author_email` itself. The old insert policy only checked `user_id`,
-- so a signed-in user could store a comment with someone else's email in
-- author_email and impersonate them in the UI / live updates.
--
-- This recreates the insert policy with one extra condition: author_email must
-- be NULL or exactly match the signed-in user's own email from their JWT. A
-- forged value is now rejected by Postgres at write time. (The app also
-- re-resolves the display email from user_id on read, as defence-in-depth, so
-- any rows stored before this migration are shown correctly too.)
--
-- NOTE: this is the same policy as in comments-migration.sql, with the
-- author_email check appended — keep the two in sync if you change one.

drop policy if exists "comments_insert_on_accessible_decks" on public.comments;

create policy "comments_insert_on_accessible_decks"
  on public.comments
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      author_email is null
      or author_email = (auth.jwt() ->> 'email')
    )
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
