-- SlideHuddle — RLS verification script
-- Run this in Supabase → SQL editor → New query → paste → Run.
-- READ-ONLY: it changes nothing. It just reports the live security state of
-- your database so you can confirm the protections the code relies on are
-- actually switched on. (The migrations are applied by hand, so this is the
-- only way to be sure none were missed.)
--
-- WHAT YOU WANT TO SEE:
--   * Section 1: every table listed with rls_enabled = true.
--   * Section 2: each table has the expected policies, and NONE are granted to
--     the "anon" (logged-out) role.
--   * Section 3: returns ZERO rows. Any row here is a table that should have
--     RLS but doesn't — a hole.

-- 1) Is Row Level Security enabled on every SlideHuddle table? ----------------
select
  c.relname                            as table_name,
  c.relrowsecurity                     as rls_enabled,
  c.relforcerowsecurity                as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'decks', 'deck_versions', 'shared_decks', 'deck_views',
    'comments', 'slide_stubs', 'slide_flags'
  )
order by c.relname;

-- 2) What policies exist, and which role is each granted to? ------------------
--    Confirm you do NOT see "anon" in the roles column for any row. Everything
--    should be "{authenticated}" (or "{public}" only where intended). The
--    service-role key bypasses all of this by design.
select
  tablename,
  policyname,
  cmd                                  as command,   -- SELECT / INSERT / UPDATE / DELETE
  roles                                as granted_to,
  qual                                 as using_expression,
  with_check                           as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in (
    'decks', 'deck_versions', 'shared_decks', 'deck_views',
    'comments', 'slide_stubs', 'slide_flags'
  )
order by tablename, cmd, policyname;

-- 3) Red flag: any SlideHuddle table with RLS OFF. Should return NO rows. -----
select c.relname as table_with_rls_disabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
  and c.relname in (
    'decks', 'deck_versions', 'shared_decks', 'deck_views',
    'comments', 'slide_stubs', 'slide_flags'
  );

-- 4) Bonus: confirm no policy is accidentally granted to the anon role. -------
--    Should return NO rows.
select tablename, policyname, roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'decks', 'deck_versions', 'shared_decks', 'deck_views',
    'comments', 'slide_stubs', 'slide_flags'
  )
  and 'anon' = any (roles);
