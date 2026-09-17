-- Dyarna/AQARAK: close a real data-exposure gap in public.profiles.
--
-- "Profiles are viewable by everyone" (20260826000000_profiles.sql) was
-- written for one real feature — every listing must show its poster's
-- real name + avatar, never anonymous — but `using (true)` on a plain
-- SELECT policy makes EVERY column readable by anyone holding the app's
-- public anon key, not just full_name/avatar_url. That includes `phone`
-- and `email`, which the app's own Privacy Policy describes as private
-- (a phone number is only ever meant to be shown when a user explicitly
-- adds it as a listing's contact number).
--
-- Verified before writing this: across the entire client codebase, every
-- real read of ANOTHER user's profile (poster cards, chat headers, review
-- authors, booking guest names, property-request responder names) only
-- ever selects full_name/avatar_url/is_verified/created_at — never
-- phone/email. The app's real contact mechanisms are a listing's own
-- explicit contact_phone field and in-app chat, neither of which touches
-- profiles.phone/email. So this fix does not need to touch row-visibility
-- (the `using (true)` policy) at all — only which COLUMNS are selectable,
-- via Postgres column-level privileges layered on top of the existing
-- table-level grant Supabase already sets up for `authenticated`/`anon`.
--
-- Leaving row-visibility alone means every existing embedded-join query
-- (`profiles!conversations_buyer_id_fkey(...)` etc.) keeps working exactly
-- as before — this only removes two specific columns from what any query
-- shape can return, for every row including a user's own.
--
-- Postgres subtlety that matters here: `anon`/`authenticated` hold a
-- *table-level* SELECT grant (Supabase's project-wide default — every
-- public table gets one). A column-level `REVOKE SELECT (col) ON table
-- FROM role` cannot carve a hole out of that — table-level SELECT already
-- implicitly covers every column, and revoking a column-level privilege
-- that was never separately granted is a no-op (verified live: it ran
-- without error and changed nothing). The only way to actually narrow
-- which columns a role can read is to revoke the table-level grant
-- entirely and re-grant SELECT on just the safe column list.

revoke select on public.profiles from authenticated, anon;
grant select (id, full_name, auth_method, is_verified, avatar_url, created_at, notify_on_listing_published)
  on public.profiles to authenticated, anon;

-- The one legitimate exception: a user reading their OWN phone/email
-- (Account screen, edit-profile, advertiser verification prefill). No
-- caller-supplied id — auth.uid() is read from the caller's own session
-- token, so this can never return another user's contact info regardless
-- of how it's called.
create or replace function public.get_own_contact_info()
returns table (phone text, email text)
language sql
security definer
set search_path = public
stable
as $$
  select p.phone, p.email
  from public.profiles p
  where p.id = auth.uid();
$$;

grant execute on function public.get_own_contact_info() to authenticated;
