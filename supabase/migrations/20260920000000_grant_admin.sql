-- Grants admin access to a single existing, already-authenticated real
-- account (owner-authorized directly, per the "no client-callable way to
-- grant admin" design in 20260904000000_identity_verification.sql).
-- Purely additive: inserts exactly one row, touches no other table, no
-- other user, and no auth data.
insert into public.admin_users (user_id)
values ('b7bffabd-de92-4416-b37c-53da9b8c2073')
on conflict (user_id) do nothing;
