-- Dyarna: production identity-verification state machine + a real,
-- authorization-gated admin review system.
--
-- This does NOT implement automated document/identity verification itself —
-- that genuinely requires a third-party identity-verification provider
-- (see the accompanying report). What this migration makes real:
--   - a proper multi-state verification lifecycle (not just pending/
--     approved/rejected),
--   - a DB-level guarantee a user can only ever have one active
--     verification request at a time,
--   - a real admin-authorization table with NO client-readable policies at
--     all, so "is this caller an admin" can only ever be answered
--     server-side, never via a client-supplied flag.
--
-- Purely additive: no existing table, RLS policy, or trigger is removed.
-- Run this after 20260903050000_account_v2.sql.

-- ---------------------------------------------------------------------------
-- 1. Real admin authorization — a dedicated table, not a column on the
-- publicly-readable profiles table (which would leak who's an admin to
-- every user). No RLS policies at all: only a service-role context (i.e.
-- an Edge Function using the service-role key) can ever read or write this
-- table. There is deliberately no client-callable way to grant admin — the
-- first admin is granted by directly running SQL as the project owner.
-- ---------------------------------------------------------------------------

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Expand verification_requests into a real state machine.
--
-- Existing states pending/rejected keep their meaning; 'approved' is
-- renamed in spirit to 'verified' (the real, badge-granting terminal
-- state) — both old rows and new code paths are handled below.
-- ---------------------------------------------------------------------------

alter table public.verification_requests
  add column if not exists document_type text check (document_type in ('passport', 'national_id', 'residence_id')),
  add column if not exists provider_reference_id text,
  add column if not exists failure_reason text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz;

-- Any pre-existing 'approved' rows (none expected yet, but this migration
-- must be safe to run against a real table that could already have some)
-- become 'verified' under the new naming.
update public.verification_requests set status = 'verified' where status = 'approved';

alter table public.verification_requests drop constraint if exists verification_requests_status_check;
alter table public.verification_requests
  add constraint verification_requests_status_check
  check (status in ('pending', 'processing', 'verified', 'rejected', 'requires_review', 'failed'));

drop trigger if exists verification_requests_set_updated_at on public.verification_requests;
create trigger verification_requests_set_updated_at
before update on public.verification_requests
for each row execute procedure public.set_updated_at();

-- A user can only ever have one *active* (non-terminal) verification
-- request at a time — the real, DB-enforced guard against duplicate/abuse
-- submissions the app was asked for. A new submission is only possible
-- once the previous one reaches a terminal state (verified/rejected/failed).
create unique index if not exists verification_requests_one_active_per_user
  on public.verification_requests (user_id)
  where status in ('pending', 'processing', 'requires_review');

-- RLS already only grants users SELECT + INSERT on their own rows (no
-- UPDATE policy exists) — status transitions were already impossible for a
-- normal authenticated user before this migration; nothing to add there.
