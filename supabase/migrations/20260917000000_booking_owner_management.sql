-- Dyarna: الحجوزات v5 — real owner management (edit + delete).
--
-- Edit itself needs no schema change (the existing owner UPDATE policy on
-- booking_listings already covers every editable field); this migration
-- only adds real, RLS-enforced DELETE support:
--
-- An owner may hard-delete their own booking listing ONLY while it has no
-- real reservations — deleting a listing with real guest bookings would
-- cascade-delete those reservations (booking_listing_id references ...
-- on delete cascade) and silently destroy a guest's real booking history,
-- which the product spec explicitly forbids ("do not corrupt existing
-- booking records"). The policy predicate enforces this server-side, not
-- just in the client UI — a listing with real reservations simply cannot
-- be deleted via this policy (the client falls back to archiving it via
-- the existing pause path instead).

drop policy if exists "Owners can delete their own booking listings without reservations" on public.booking_listings;

create policy "Owners can delete their own booking listings without reservations"
  on public.booking_listings for delete
  using (
    auth.uid() = owner_id
    and not exists (
      select 1 from public.reservations r where r.booking_listing_id = booking_listings.id
    )
  );
