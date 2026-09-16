-- Real-time chat delivery. The conversations/messages tables and their RLS
-- already exist (20260904010000_chat.sql) and are untouched here — this
-- only enables Postgres Changes replication so an already-authorized
-- participant's client receives new message events live, instead of only
-- on screen focus. Realtime enforces the existing RLS SELECT policy on
-- every change event, so a client only ever receives rows it could already
-- SELECT — no security change, purely additive.

alter publication supabase_realtime add table public.messages;
