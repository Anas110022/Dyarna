-- Dyarna: الحجوزات — a real short-term/nightly-stay booking marketplace,
-- separate from the existing بيع/إيجار طويل marketplace on the same
-- `listings` table. Purely additive: no existing table, column, RLS
-- policy, or trigger from any prior migration is touched.
--
-- Reuses everything that already exists rather than duplicating it:
--   - listings (title/photos/specs/amenities/location/contact/owner)
--   - governorates (real 14 Syrian governorates)
--   - listing_photos + the public listing-photos storage bucket
--   - profiles (owner identity, is_verified)
--   - public.set_updated_at() (same trigger function every other table uses)
-- A listing becomes bookable only when its owner explicitly creates a row
-- in booking_listings for it — nothing here makes an existing sale/rent
-- listing bookable automatically, and nothing here invents fake pricing,
-- availability, or reviews.
--
-- Run this after 20260912000000_more_categories.sql.

-- ---------------------------------------------------------------------------
-- 1. booking_listings — real per-listing booking configuration, set only by
-- the listing's real owner. One row per bookable listing (listing_id is
-- both the primary key and the foreign key), so "does a booking_listings
-- row exist" already answers "did the owner ever configure this listing
-- for booking"; enabled_for_booking is a separate real flag so an owner can
-- pause bookings without losing their configured price/policy.
-- ---------------------------------------------------------------------------

create table if not exists public.booking_listings (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,

  enabled_for_booking boolean not null default true,

  -- Real nightly price in USD — the same currency every other real price in
  -- this app is already stored in (listings.price_usd), so search/sort/
  -- filter logic never has to reconcile two currencies.
  nightly_price_usd integer not null check (nightly_price_usd > 0),
  minimum_nights smallint not null default 1 check (minimum_nights >= 1),
  maximum_nights smallint check (maximum_nights is null or maximum_nights >= minimum_nights),

  check_in_time time,
  check_out_time time,
  cancellation_policy text,
  security_deposit_usd integer check (security_deposit_usd is null or security_deposit_usd >= 0),
  booking_instructions text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_listings_owner_id_idx on public.booking_listings (owner_id);

create trigger booking_listings_set_updated_at
before update on public.booking_listings
for each row execute procedure public.set_updated_at();

alter table public.booking_listings enable row level security;

-- Publicly browsable only when both the listing is really published AND
-- the owner has really enabled booking — matches §17 "only published/
-- approved listings should be available for public booking". An owner can
-- still see their own row regardless (e.g. while it's disabled) so they
-- can manage it.
create policy "Bookable listings are viewable when published and enabled"
  on public.booking_listings for select
  using (
    (enabled_for_booking and exists (select 1 from public.listings l where l.id = listing_id and l.status = 'published'))
    or owner_id = auth.uid()
  );

create policy "Owners can enable booking on their own published listings"
  on public.booking_listings for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid() and l.status = 'published')
  );

create policy "Owners can update their own booking configuration"
  on public.booking_listings for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners can remove their own booking configuration"
  on public.booking_listings for delete
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. reservations — a real guest stay request against a real bookable
-- listing. `nights`/`total_price_usd` are always computed server-side (see
-- create_reservation below) — never trusted from the client. No direct
-- INSERT/UPDATE policy is granted to end users at all: every reservation is
-- created by create_reservation() and every status change goes through
-- update_reservation_status() (both SECURITY DEFINER, both below), so all
-- of §16's rules ("cannot manipulate price", "cannot mark own booking
-- confirmed", "cannot bypass availability") are enforced at the one real
-- boundary a client can never route around.
-- ---------------------------------------------------------------------------

create extension if not exists btree_gist;

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  guest_id uuid not null references public.profiles (id) on delete cascade,

  check_in date not null,
  check_out date not null check (check_out > check_in),
  nights integer generated always as (check_out - check_in) stored,

  -- The real price actually agreed to at booking time, snapshotted so a
  -- later change to booking_listings.nightly_price_usd never silently
  -- rewrites an existing guest's real total.
  nightly_price_usd_snapshot integer not null check (nightly_price_usd_snapshot > 0),
  total_price_usd integer not null check (total_price_usd > 0),

  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'rejected', 'completed')),
  reference_code text not null unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The real double-booking guard, enforced by Postgres itself: two
  -- pending/confirmed reservations for the same listing can never have
  -- overlapping [check_in, check_out) ranges, even under concurrent
  -- inserts — this is a database constraint, not an application-level
  -- check-then-insert race.
  constraint reservations_no_overlap exclude using gist (
    listing_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status in ('pending', 'confirmed'))
);

create index if not exists reservations_listing_id_idx on public.reservations (listing_id);
create index if not exists reservations_guest_id_idx on public.reservations (guest_id, created_at desc);
-- Powers "which dates are unavailable for this listing" without scanning
-- every reservation in the database (§20's "query only the required date
-- range/listing IDs").
create index if not exists reservations_listing_daterange_idx
  on public.reservations using gist (listing_id, daterange(check_in, check_out, '[)'))
  where (status in ('pending', 'confirmed'));

create trigger reservations_set_updated_at
before update on public.reservations
for each row execute procedure public.set_updated_at();

alter table public.reservations enable row level security;

create policy "Guests can view their own reservations"
  on public.reservations for select
  using (guest_id = auth.uid());

create policy "Owners can view reservations on their own bookable listings"
  on public.reservations for select
  using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()));

-- No insert/update/delete policy for authenticated/anon at all — see the
-- two SECURITY DEFINER functions below, the only legitimate way any row in
-- this table is ever created or changed.

-- ---------------------------------------------------------------------------
-- 3. get_unavailable_dates — real, public (no auth required — matches §5
-- "the property map itself must work without location permission"'s same
-- spirit: browsing real availability isn't a guest-identity operation),
-- narrow read of just the date ranges already booked for one listing. Never
-- exposes which guest booked, only that a range is taken.
-- ---------------------------------------------------------------------------

create or replace function public.get_unavailable_dates(p_listing_id uuid)
returns table (check_in date, check_out date)
language sql
security definer set search_path = public
stable
as $$
  select r.check_in, r.check_out
  from public.reservations r
  where r.listing_id = p_listing_id
    and r.status in ('pending', 'confirmed')
  order by r.check_in;
$$;

grant execute on function public.get_unavailable_dates(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_reservation — the one real path a reservation can ever be
-- created through. Re-validates everything server-side per §11/§16: real
-- auth, real listing (published + really enabled for booking), real dates
-- (not in the past, checkout after checkin, real min/max-night rules), real
-- current price (read fresh from booking_listings, never from the client),
-- and real availability (the exclusion constraint above rejects the INSERT
-- itself if the range overlaps an existing pending/confirmed reservation —
-- caught below and turned into a clean error instead of a raw Postgres
-- exception).
-- ---------------------------------------------------------------------------

create or replace function public.create_reservation(
  p_listing_id uuid,
  p_check_in date,
  p_check_out date
)
returns table (id uuid, reference_code text, nights integer, nightly_price_usd integer, total_price_usd integer)
language plpgsql
security definer set search_path = public
as $$
declare
  v_config record;
  v_listing_status text;
  v_nights integer;
  v_total integer;
  v_reference text;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to book';
  end if;

  if p_check_in < current_date then
    raise exception 'Check-in date cannot be in the past';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in';
  end if;

  select bl.nightly_price_usd, bl.minimum_nights, bl.maximum_nights, bl.enabled_for_booking, l.status
    into v_config
  from public.booking_listings bl
  join public.listings l on l.id = bl.listing_id
  where bl.listing_id = p_listing_id
  for update of bl;

  if v_config is null or v_config.enabled_for_booking is not true or v_config.status <> 'published' then
    raise exception 'This listing is not available for booking';
  end if;

  v_nights := p_check_out - p_check_in;

  if v_nights < v_config.minimum_nights then
    raise exception 'Minimum stay is % night(s)', v_config.minimum_nights;
  end if;
  if v_config.maximum_nights is not null and v_nights > v_config.maximum_nights then
    raise exception 'Maximum stay is % night(s)', v_config.maximum_nights;
  end if;

  v_total := v_nights * v_config.nightly_price_usd;
  v_reference := 'DYR-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  begin
    insert into public.reservations
      (listing_id, guest_id, check_in, check_out, nightly_price_usd_snapshot, total_price_usd, reference_code, status)
    values
      (p_listing_id, auth.uid(), p_check_in, p_check_out, v_config.nightly_price_usd, v_total, v_reference, 'pending')
    returning reservations.id into v_new_id;
  exception
    when exclusion_violation then
      raise exception 'These dates are no longer available for this listing';
  end;

  return query select v_new_id, v_reference, v_nights, v_config.nightly_price_usd, v_total;
end;
$$;

grant execute on function public.create_reservation(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. update_reservation_status — the one real path a reservation's status
-- can ever change through. A guest may only cancel their own
-- pending/confirmed reservation. An owner may only confirm/reject a
-- pending reservation on their own listing, cancel a confirmed one, or mark
-- a confirmed reservation completed once its real check_out date has
-- passed. No one can touch a reservation they don't own on either side.
-- ---------------------------------------------------------------------------

create or replace function public.update_reservation_status(
  p_reservation_id uuid,
  p_new_status text
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_res record;
  v_is_guest boolean;
  v_is_owner boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_new_status not in ('confirmed', 'cancelled', 'rejected', 'completed') then
    raise exception 'Invalid status';
  end if;

  select r.id, r.status, r.guest_id, r.check_out, l.owner_id
    into v_res
  from public.reservations r
  join public.listings l on l.id = r.listing_id
  where r.id = p_reservation_id
  for update of r;

  if v_res is null then
    raise exception 'Reservation not found';
  end if;

  v_is_guest := v_res.guest_id = auth.uid();
  v_is_owner := v_res.owner_id = auth.uid();

  if not v_is_guest and not v_is_owner then
    raise exception 'Not authorized to change this reservation';
  end if;

  if v_is_guest and not v_is_owner then
    if p_new_status <> 'cancelled' or v_res.status not in ('pending', 'confirmed') then
      raise exception 'Guests may only cancel a pending or confirmed reservation';
    end if;
  elsif v_is_owner then
    if p_new_status = 'confirmed' and v_res.status <> 'pending' then
      raise exception 'Only a pending reservation can be confirmed';
    elsif p_new_status = 'rejected' and v_res.status <> 'pending' then
      raise exception 'Only a pending reservation can be rejected';
    elsif p_new_status = 'cancelled' and v_res.status not in ('pending', 'confirmed') then
      raise exception 'Only a pending or confirmed reservation can be cancelled';
    elsif p_new_status = 'completed' and (v_res.status <> 'confirmed' or v_res.check_out > current_date) then
      raise exception 'Only a confirmed reservation past its real check-out date can be marked completed';
    end if;
  end if;

  update public.reservations set status = p_new_status where id = p_reservation_id;
  return true;
end;
$$;

grant execute on function public.update_reservation_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. search_bookable_listings — the real الحجوزات search query, in one
-- round trip: real published+enabled listings, real filters, and (when real
-- dates are given) real availability, checked against the actual
-- reservations table using the same overlap test the exclusion constraint
-- enforces — never scanning every reservation, just this listing set's rows
-- via the gist index created above (§20's "query only the required date
-- range/listing IDs").
-- ---------------------------------------------------------------------------

create or replace function public.search_bookable_listings(
  p_check_in date default null,
  p_check_out date default null,
  p_governorate_id text default null,
  p_category text default null,
  p_min_price integer default null,
  p_max_price integer default null,
  p_min_bedrooms integer default null,
  p_min_bathrooms integer default null,
  p_furnished text default null,
  p_amenities text[] default null
)
returns table (
  listing_id uuid,
  title text,
  category text,
  city text,
  area text,
  bedrooms smallint,
  bathrooms smallint,
  area_sqm numeric,
  amenities text[],
  nightly_price_usd integer,
  minimum_nights smallint,
  cover_photo_path text
)
language sql
security definer set search_path = public
stable
as $$
  select
    l.id, l.title, l.category, l.city, l.area, l.bedrooms, l.bathrooms, l.area_sqm, l.amenities,
    bl.nightly_price_usd, bl.minimum_nights,
    (
      select lp.storage_path from public.listing_photos lp
      where lp.listing_id = l.id
      order by lp.sort_order asc
      limit 1
    ) as cover_photo_path
  from public.listings l
  join public.booking_listings bl on bl.listing_id = l.id
  where l.status = 'published'
    and bl.enabled_for_booking = true
    and (p_governorate_id is null or l.governorate_id = p_governorate_id)
    and (p_category is null or l.category = p_category)
    and (p_min_price is null or bl.nightly_price_usd >= p_min_price)
    and (p_max_price is null or bl.nightly_price_usd <= p_max_price)
    and (p_min_bedrooms is null or l.bedrooms >= p_min_bedrooms)
    and (p_min_bathrooms is null or l.bathrooms >= p_min_bathrooms)
    and (p_furnished is null or l.furnished = p_furnished)
    and (p_amenities is null or l.amenities @> p_amenities)
    and (
      p_check_in is null or p_check_out is null or not exists (
        select 1 from public.reservations r
        where r.listing_id = l.id
          and r.status in ('pending', 'confirmed')
          and daterange(r.check_in, r.check_out, '[)') && daterange(p_check_in, p_check_out, '[)')
      )
    )
  order by l.created_at desc;
$$;

grant execute on function public.search_bookable_listings(date, date, text, text, integer, integer, integer, integer, text, text[]) to anon, authenticated;
