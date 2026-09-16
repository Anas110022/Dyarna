-- المشاريع (Projects) — Stage 3, part 1: extend the existing advertiser
-- verification system with a 4th real type, 'developer' (شركة عقارية),
-- reusing the exact same submission + admin-approval architecture already
-- used for owner/broker/host — no parallel verification system.
--
-- Purely additive: widens the existing check constraint only (confirmed
-- its real name via a live read-only query: verification_requests_
-- advertiser_type_check). Every existing owner/broker/host row and the
-- admin-verification Edge Function's approve/reject flow is untouched.
-- profiles.is_verified remains the one real "an admin approved this
-- person" flag — this migration adds no new trust flag.

alter table public.verification_requests
  drop constraint verification_requests_advertiser_type_check;

alter table public.verification_requests
  add constraint verification_requests_advertiser_type_check
  check (advertiser_type in ('owner', 'broker', 'host', 'developer'));
