-- Dyarna: storage for the app's own real, 6-digit email signup OTP codes.
--
-- Supabase Auth's own generated token (from admin.generateLink) is real but
-- its digit length is controlled by a project-wide "Email OTP Length"
-- setting (currently 8 on this project) — not something the app can force
-- to 6 without changing that project setting. Since editing the Confirm
-- signup email template is blocked on this Free plan, the app instead
-- generates its own real, cryptographically random 6-digit code, stores
-- only its hash (never the plaintext) with a real expiry here, and emails
-- that code itself via Resend. Supabase Auth's own token is still used
-- internally afterward (see supabase/functions/email-otp) to actually
-- create the session — this table only guards the code the user types.
--
-- Locked down to the service role only: no RLS policies are defined, so
-- anon/authenticated requests are denied entirely; only the email-otp Edge
-- Function (using the service-role key, which bypasses RLS) ever reads or
-- writes this table.
--
-- Run this after 20260903020000_ad_info.sql.

create table if not exists public.email_otp_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.email_otp_codes enable row level security;
