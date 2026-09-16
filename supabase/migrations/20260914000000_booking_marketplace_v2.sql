-- Dyarna: الحجوزات rebuilt as a genuinely SEPARATE short-term/nightly
-- booking marketplace — not a booking config bolted onto a normal
-- بيع/إيجار `listings` row anymore. A booking listing is now its own real
-- entity with its own 5 real types, its own photos, its own amenities, and
-- its own publish/trust lifecycle — mirroring `listings`' own proven
-- pattern (guard trigger, SECURITY DEFINER auto-publish, real advertiser
-- verification gate) rather than inventing a new one.
--
-- Both `booking_listings` and `reservations` from 20260913000000_bookings.sql
-- are dropped and recreated: verified empty in production before writing
-- this (zero rows in either table — nobody could book anything yet, since
-- search always returned real zero results), so this is not a destructive
-- change to any real data. `listings`, `listing_photos`, and every other
-- normal-marketplace table/policy/trigger are completely untouched.
--
-- Run this after 20260913000000_bookings.sql.

drop function if exists public.search_bookable_listings(date, date, text, text, integer, integer, integer, integer, text, text[]);
drop function if exists public.update_reservation_status(uuid, text);
drop function if exists public.create_reservation(uuid, date, date);
drop function if exists public.get_unavailable_dates(uuid);
drop table if exists public.reservations;
drop table if exists public.booking_listings;

-- ---------------------------------------------------------------------------
-- 1. booking_listings — a real, standalone bookable property/venue. Exactly
-- 5 real types (§2 of the spec), each with only the fields that genuinely
-- apply to it — never the full normal-real-estate field set.
-- ---------------------------------------------------------------------------

create table public.booking_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,

  booking_type text not null check (
    booking_type in ('furnished_apartment', 'furnished_studio', 'furnished_villa', 'chalet', 'wedding_hall')
  ),

  title text not null check (char_length(title) > 0),
  description text not null check (char_length(description) >= 20),

  governorate_id text not null references public.governorates (id),
  city text not null check (char_length(city) > 0),
  area text,
  lat double precision not null check (lat between 32.0 and 37.5),
  lng double precision not null check (lng between 35.5 and 42.5),

  -- Real price the provider set. per_night for the 4 accommodation types,
  -- per_event for قاعة أفراح — price_unit only changes how the same real
  -- number is labeled/displayed, never a second price system.
  price_usd integer not null check (price_usd > 0),
  price_unit text not null default 'per_night' check (price_unit in ('per_night', 'per_event')),

  -- Stay-length rules. A wedding_hall booking is always exactly one day
  -- (an event date, modeled as a 1-night range so it reuses the exact same
  -- real availability/exclusion-constraint machinery below) — enforced by
  -- the posting form always saving minimum_nights = maximum_nights = 1 for
  -- that type, not a special case in the reservation RPCs.
  minimum_nights smallint not null default 1 check (minimum_nights >= 1),
  maximum_nights smallint check (maximum_nights is null or maximum_nights >= minimum_nights),

  -- Accommodation-only real specs (furnished_apartment/furnished_studio/
  -- furnished_villa/chalet) — null for wedding_hall.
  bedrooms smallint check (bedrooms is null or bedrooms >= 0),
  bathrooms smallint check (bathrooms is null or bathrooms >= 0),
  beds smallint check (beds is null or beds >= 0),

  -- Capacity — the one spec genuinely shared by every type ("عدد
  -- الأشخاص/السعة" for accommodation, "السعة" for the hall).
  max_guests smallint check (max_guests is null or max_guests >= 1),

  -- Wedding-hall-only real specs — null for the 4 accommodation types.
  hall_type text check (hall_type is null or hall_type in ('indoor', 'outdoor', 'both')),
  number_of_halls smallint check (number_of_halls is null or number_of_halls >= 1),

  amenities text[] not null default '{}'::text[],

  check_in_time time,
  check_out_time time,
  cancellation_policy text,
  security_deposit_usd integer check (security_deposit_usd is null or security_deposit_usd >= 0),
  booking_instructions text,

  contact_phone text not null check (char_length(contact_phone) > 0),

  status text not null default 'pending_review' check (status in ('pending_review', 'published', 'rejected', 'archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index booking_listings_owner_id_idx on public.booking_listings (owner_id);
create index booking_listings_status_idx on public.booking_listings (status);
create index booking_listings_type_governorate_idx on public.booking_listings (booking_type, governorate_id);
create index booking_listings_amenities_gin_idx on public.booking_listings using gin (amenities);

create trigger booking_listings_set_updated_at
before update on public.booking_listings
for each row execute procedure public.set_updated_at();

-- Same real trust boundary as guard_listing_trust_rules (20260903000000):
-- a booking listing can never self-publish on INSERT, owner_id can never
-- be reassigned, and only an admin (service_role) or the real
-- publish_booking_listing_if_eligible RPC below (via the same
-- transaction-scoped app.auto_publish flag) can ever move status to
-- 'published'.
create or replace function public.guard_booking_listing_trust_rules()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'pending_review';
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id cannot be changed';
  end if;

  if auth.role() <> 'service_role' and coalesce(current_setting('app.auto_publish', true), '') <> 'on' then
    if new.status is distinct from old.status and new.status = 'published' then
      raise exception 'Only an admin (or the automatic publish check) can publish a booking listing';
    end if;
  end if;

  if new.status = 'published' and old.status is distinct from 'published' then
    if (select count(*) from public.booking_listing_photos where booking_listing_id = new.id) < 3 then
      raise exception 'A booking listing needs at least 3 photos before it can be published';
    end if;
  end if;

  return new;
end;
$$;

create trigger booking_listings_guard_trust_rules
before insert or update on public.booking_listings
for each row execute procedure public.guard_booking_listing_trust_rules();

alter table public.booking_listings enable row level security;

create policy "Published booking listings are viewable by everyone"
  on public.booking_listings for select
  using (status = 'published' or auth.uid() = owner_id);

create policy "Users can create their own booking listings"
  on public.booking_listings for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Owners can update their own booking listings"
  on public.booking_listings for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- No delete policy — same as `listings`: an owner pauses/removes a booking
-- listing by setting status to 'archived' via the update policy above, a
-- real row is never hard-deleted out from under an existing reservation.

-- ---------------------------------------------------------------------------
-- 2. booking_listing_photos — exact same real pattern as listing_photos.
-- ---------------------------------------------------------------------------

create table public.booking_listing_photos (
  id uuid primary key default gen_random_uuid(),
  booking_listing_id uuid not null references public.booking_listings (id) on delete cascade,
  storage_path text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index booking_listing_photos_booking_listing_id_idx on public.booking_listing_photos (booking_listing_id);

alter table public.booking_listing_photos enable row level security;

create policy "Booking photos are viewable if their listing is"
  on public.booking_listing_photos for select
  using (
    exists (
      select 1 from public.booking_listings bl
      where bl.id = booking_listing_id and (bl.status = 'published' or bl.owner_id = auth.uid())
    )
  );

create policy "Owners can add photos to their own booking listings"
  on public.booking_listing_photos for insert
  to authenticated
  with check (exists (select 1 from public.booking_listings bl where bl.id = booking_listing_id and bl.owner_id = auth.uid()));

create policy "Owners can reorder their own booking listing photos"
  on public.booking_listing_photos for update
  using (exists (select 1 from public.booking_listings bl where bl.id = booking_listing_id and bl.owner_id = auth.uid()));

create policy "Owners can remove their own booking listing photos"
  on public.booking_listing_photos for delete
  using (exists (select 1 from public.booking_listings bl where bl.id = booking_listing_id and bl.owner_id = auth.uid()));

-- Reuses the existing public listing-photos bucket/RLS (20260902000000) —
-- its policy already only checks that the object's first path folder is
-- the uploading user's own auth.uid(), which is agnostic to whether the
-- photo belongs to a normal listing or a booking listing, so no new bucket
-- or storage policy is needed. Booking photos are namespaced under
-- `<owner_id>/booking/<booking_listing_id>/...` by the client.

-- ---------------------------------------------------------------------------
-- 3. booking_amenity_types — same real reference-table pattern as
-- amenity_types (20260903010000), scoped to the 5 real booking types
-- instead of the normal property categories, so the two amenity systems
-- never mix.
-- ---------------------------------------------------------------------------

create table public.booking_amenity_types (
  key text primary key,
  name_ar text not null,
  name_en text not null,
  applicable_booking_types text[] not null
);

alter table public.booking_amenity_types enable row level security;

create policy "Booking amenity types are viewable by everyone"
  on public.booking_amenity_types for select
  using (true);

insert into public.booking_amenity_types (key, name_ar, name_en, applicable_booking_types) values
  ('parking', 'موقف سيارات', 'Parking', array['furnished_apartment', 'furnished_studio', 'furnished_villa', 'chalet', 'wedding_hall']),
  ('ac', 'مكيف', 'Air conditioning', array['furnished_apartment', 'furnished_studio', 'furnished_villa', 'chalet', 'wedding_hall']),
  ('wifi', 'واي فاي', 'WiFi', array['furnished_apartment', 'furnished_studio', 'furnished_villa', 'chalet']),
  ('kitchen', 'مطبخ', 'Kitchen', array['furnished_apartment', 'furnished_studio', 'furnished_villa', 'chalet']),
  ('elevator', 'مصعد', 'Elevator', array['furnished_apartment', 'furnished_studio']),
  ('pool', 'مسبح', 'Pool', array['furnished_villa', 'chalet']),
  ('garden', 'حديقة / مساحة خارجية', 'Garden / outdoor space', array['furnished_villa', 'chalet']),
  ('bbq', 'شواء (BBQ)', 'BBQ', array['chalet']),
  ('outdoor_seating', 'جلسات خارجية', 'Outdoor seating', array['chalet']),
  ('catering', 'خدمات تموين', 'Catering services', array['wedding_hall']),
  ('tables_chairs', 'طاولات وكراسي', 'Tables and chairs', array['wedding_hall']),
  ('sound_system', 'نظام صوت', 'Sound system', array['wedding_hall']),
  ('stage', 'منصة / مسرح', 'Stage', array['wedding_hall'])
on conflict (key) do nothing;

create or replace function public.validate_booking_listing_amenities()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.amenities is not null and array_length(new.amenities, 1) > 0 then
    if exists (
      select 1 from unnest(new.amenities) as a(key)
      where not exists (select 1 from public.booking_amenity_types t where t.key = a.key)
    ) then
      raise exception 'Unknown booking amenity key in amenities array';
    end if;
  end if;
  return new;
end;
$$;

create trigger booking_listings_validate_amenities
before insert or update of amenities on public.booking_listings
for each row execute procedure public.validate_booking_listing_amenities();

-- ---------------------------------------------------------------------------
-- 4. publish_booking_listing_if_eligible — same real gate as
-- publish_listing_if_eligible (20260903000000) + the same real advertiser-
-- verification gate (20260911000000): owner-only, >=3 real photos, and the
-- owner's real profiles.is_verified must already be true (an unverified
-- provider's booking listing stays in pending_review, same as a normal
-- listing would — not a second trust system).
-- ---------------------------------------------------------------------------

create or replace function public.publish_booking_listing_if_eligible(p_booking_listing_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
  v_title text;
  v_photo_count int;
  v_owner_verified boolean;
  v_notify boolean;
begin
  select owner_id, status, title into v_owner, v_status, v_title
  from public.booking_listings
  where id = p_booking_listing_id;

  if v_owner is null then
    return false;
  end if;

  if v_owner <> auth.uid() then
    raise exception 'Not authorized to publish this booking listing';
  end if;

  if v_status <> 'pending_review' then
    return false;
  end if;

  select count(*) into v_photo_count
  from public.booking_listing_photos
  where booking_listing_id = p_booking_listing_id;

  if v_photo_count < 3 then
    return false;
  end if;

  select is_verified into v_owner_verified from public.profiles where id = v_owner;
  if not coalesce(v_owner_verified, false) then
    return false;
  end if;

  perform set_config('app.auto_publish', 'on', true);

  update public.booking_listings
  set status = 'published'
  where id = p_booking_listing_id
    and status = 'pending_review';

  select notify_on_listing_published into v_notify from public.profiles where id = v_owner;
  if coalesce(v_notify, true) then
    insert into public.notifications (user_id, type, title, body, related_booking_listing_id)
    values (
      v_owner,
      'booking_listing_published',
      'تم نشر عقارك للحجز',
      format('عقارك "%s" أصبح ظاهرًا الآن في الحجوزات.', v_title),
      p_booking_listing_id
    );
  end if;

  return true;
end;
$$;

grant execute on function public.publish_booking_listing_if_eligible(uuid) to authenticated;

-- notifications.related_listing_id is FK'd strictly to `listings` — a
-- separate nullable column lets a booking-listing notification link back
-- to its real row without loosening or duplicating that existing FK.
alter table public.notifications
  add column if not exists related_booking_listing_id uuid references public.booking_listings (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 5. reservations — same real schema/guarantees as before (generated
-- `nights`, real GIST exclusion constraint against double-booking), just
-- pointed at the new standalone booking_listings instead of `listings`.
-- ---------------------------------------------------------------------------

create extension if not exists btree_gist;

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  booking_listing_id uuid not null references public.booking_listings (id) on delete cascade,
  guest_id uuid not null references public.profiles (id) on delete cascade,

  check_in date not null,
  check_out date not null check (check_out > check_in),
  nights integer generated always as (check_out - check_in) stored,

  nightly_price_usd_snapshot integer not null check (nightly_price_usd_snapshot > 0),
  total_price_usd integer not null check (total_price_usd > 0),

  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'rejected', 'completed')),
  reference_code text not null unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reservations_no_overlap exclude using gist (
    booking_listing_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status in ('pending', 'confirmed'))
);

create index reservations_booking_listing_id_idx on public.reservations (booking_listing_id);
create index reservations_guest_id_idx on public.reservations (guest_id, created_at desc);
create index reservations_booking_listing_daterange_idx
  on public.reservations using gist (booking_listing_id, daterange(check_in, check_out, '[)'))
  where (status in ('pending', 'confirmed'));

create trigger reservations_set_updated_at
before update on public.reservations
for each row execute procedure public.set_updated_at();

alter table public.reservations enable row level security;

create policy "Guests can view their own reservations"
  on public.reservations for select
  using (guest_id = auth.uid());

create policy "Owners can view reservations on their own booking listings"
  on public.reservations for select
  using (exists (select 1 from public.booking_listings bl where bl.id = booking_listing_id and bl.owner_id = auth.uid()));

-- No insert/update/delete policy — every write goes through
-- create_reservation / update_reservation_status below.

-- ---------------------------------------------------------------------------
-- 6. get_unavailable_dates / create_reservation / update_reservation_status
-- — same real logic as 20260913000000, re-pointed at booking_listings.
-- ---------------------------------------------------------------------------

create or replace function public.get_unavailable_dates(p_booking_listing_id uuid)
returns table (check_in date, check_out date)
language sql
security definer set search_path = public
stable
as $$
  select r.check_in, r.check_out
  from public.reservations r
  where r.booking_listing_id = p_booking_listing_id
    and r.status in ('pending', 'confirmed')
  order by r.check_in;
$$;

grant execute on function public.get_unavailable_dates(uuid) to anon, authenticated;

create or replace function public.create_reservation(
  p_booking_listing_id uuid,
  p_check_in date,
  p_check_out date
)
returns table (id uuid, reference_code text, nights integer, nightly_price_usd integer, total_price_usd integer)
language plpgsql
security definer set search_path = public
as $$
declare
  v_listing record;
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

  select bl.price_usd, bl.minimum_nights, bl.maximum_nights, bl.status
    into v_listing
  from public.booking_listings bl
  where bl.id = p_booking_listing_id
  for update of bl;

  if v_listing is null or v_listing.status <> 'published' then
    raise exception 'This booking listing is not available for booking';
  end if;

  v_nights := p_check_out - p_check_in;

  if v_nights < v_listing.minimum_nights then
    raise exception 'Minimum stay is % night(s)', v_listing.minimum_nights;
  end if;
  if v_listing.maximum_nights is not null and v_nights > v_listing.maximum_nights then
    raise exception 'Maximum stay is % night(s)', v_listing.maximum_nights;
  end if;

  v_total := v_nights * v_listing.price_usd;
  v_reference := 'DYR-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  begin
    insert into public.reservations
      (booking_listing_id, guest_id, check_in, check_out, nightly_price_usd_snapshot, total_price_usd, reference_code, status)
    values
      (p_booking_listing_id, auth.uid(), p_check_in, p_check_out, v_listing.price_usd, v_total, v_reference, 'pending')
    returning reservations.id into v_new_id;
  exception
    when exclusion_violation then
      raise exception 'These dates are no longer available for this listing';
  end;

  return query select v_new_id, v_reference, v_nights, v_listing.price_usd, v_total;
end;
$$;

grant execute on function public.create_reservation(uuid, date, date) to authenticated;

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

  select r.id, r.status, r.guest_id, r.check_out, bl.owner_id
    into v_res
  from public.reservations r
  join public.booking_listings bl on bl.id = r.booking_listing_id
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
-- 7. search_bookable_listings — real, type-aware search in one round trip.
-- Every filter genuinely used by the app (§3/§4 of the spec) is applied
-- server-side, including real date-range availability against the actual
-- reservations table via the gist index above — never scanning every
-- reservation, and never returning a hardcoded/fake count (the caller
-- counts the real rows this returns).
-- ---------------------------------------------------------------------------

create or replace function public.search_bookable_listings(
  p_check_in date default null,
  p_check_out date default null,
  p_booking_type text default null,
  p_governorate_id text default null,
  p_min_price integer default null,
  p_max_price integer default null,
  p_min_bedrooms integer default null,
  p_min_bathrooms integer default null,
  p_min_beds integer default null,
  p_min_guests integer default null,
  p_hall_type text default null,
  p_amenities text[] default null
)
returns table (
  id uuid,
  booking_type text,
  title text,
  city text,
  area text,
  price_usd integer,
  price_unit text,
  minimum_nights smallint,
  bedrooms smallint,
  bathrooms smallint,
  beds smallint,
  max_guests smallint,
  hall_type text,
  number_of_halls smallint,
  amenities text[],
  cover_photo_path text
)
language sql
security definer set search_path = public
stable
as $$
  select
    bl.id, bl.booking_type, bl.title, bl.city, bl.area, bl.price_usd, bl.price_unit, bl.minimum_nights,
    bl.bedrooms, bl.bathrooms, bl.beds, bl.max_guests, bl.hall_type, bl.number_of_halls, bl.amenities,
    (
      select p.storage_path from public.booking_listing_photos p
      where p.booking_listing_id = bl.id
      order by p.sort_order asc
      limit 1
    ) as cover_photo_path
  from public.booking_listings bl
  where bl.status = 'published'
    and (p_booking_type is null or bl.booking_type = p_booking_type)
    and (p_governorate_id is null or bl.governorate_id = p_governorate_id)
    and (p_min_price is null or bl.price_usd >= p_min_price)
    and (p_max_price is null or bl.price_usd <= p_max_price)
    and (p_min_bedrooms is null or bl.bedrooms >= p_min_bedrooms)
    and (p_min_bathrooms is null or bl.bathrooms >= p_min_bathrooms)
    and (p_min_beds is null or bl.beds >= p_min_beds)
    and (p_min_guests is null or bl.max_guests >= p_min_guests)
    and (p_hall_type is null or bl.hall_type = p_hall_type)
    and (p_amenities is null or bl.amenities @> p_amenities)
    and (
      p_check_in is null or p_check_out is null or not exists (
        select 1 from public.reservations r
        where r.booking_listing_id = bl.id
          and r.status in ('pending', 'confirmed')
          and daterange(r.check_in, r.check_out, '[)') && daterange(p_check_in, p_check_out, '[)')
      )
    )
  order by bl.created_at desc;
$$;

grant execute on function public.search_bookable_listings(date, date, text, text, integer, integer, integer, integer, integer, integer, text, text[]) to anon, authenticated;
