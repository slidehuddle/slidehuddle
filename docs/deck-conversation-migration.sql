-- Bind each deck to the Claude conversation it was captured from.
--
-- The extension reads the conversation id from the claude.ai URL
-- (https://claude.ai/chat/<uuid>) and sends it on create. This lets a deck's
-- identity track its source conversation: provenance today, and the basis for
-- a future cross-device "this conversation already has a deck" lookup.
--
-- Idempotent — safe to re-run.

alter table public.decks
  add column if not exists claude_conversation_id text;

create index if not exists decks_claude_conversation_id_idx
  on public.decks (claude_conversation_id);
