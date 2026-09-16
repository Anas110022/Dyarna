-- Dyarna: الحجوزات v3 — two real changes to the standalone booking
-- marketplace from 20260914000000:
--
-- 1. Removes `max_guests` (عدد الضيوف) and the whole amenities system
--    (`amenities` column + `booking_amenity_types` table) from
--    booking_listings. Per explicit product direction: these were never
--    meant to be part of the booking flow — a booking place is described
--    by its real type-specific specs (bedrooms/bathrooms/beds, or hall
--    type/number of halls) plus its free-text description, not a
--    guest-count field or a normal-listing-style amenities picker.
--
-- 2. Adds real owner-managed availability: `booking_listing_blackout_dates`
--    lets an owner block specific real calendar dates (independent of any
--    reservation) — e.g. the place is closed for maintenance, or already
--    booked outside the app. get_unavailable_dates and
--    search_bookable_listings both now treat a blackout date exactly like
--    a 1-night reservation for availability purposes, and create_reservation
--    now also rejects a real overlap with a blackout date, so "availability"
--    is enforced the same way everywhere, not just previewed.
--
-- Both booking_listings and reservations are verified empty in production
-- again right before this migration (re-checked via REST count=exact: 0
-- rows in each), so dropping/recreating booking_listings (to drop the two
-- columns) destroys no real data. `listings` and every normal-marketplace
-- table are untouched.

drop function if exists public.search_bookable_listings(date, date, text, text, integer, integer, integer, integer, integer, integer, text, text[]);
drop function if exists public.create_reservation(uuid, date, date);
drop function if exists public.get_unavailable_dates(uuid);
-- notifications.related_booking_listing_id (added in v2) FK's straight to
-- booking_listings, which blocks dropping that table below — drop the
-- constraint here and the "add column if not exists" further down
-- re-attaches it to the newly recreated table (the column and any real
-- notification rows referencing it are untouched, only the FK is redone).
alter table public.notifications drop constraint if exists notifications_related_booking_listing_id_fkey;
drop table if exists public.reservations;
drop table if exists public.booking_listing_photos;
drop table if exists public.booking_listings;
drop table if exists public.booking_amenity_types;

-- ---------------------------------------------------------------------------
-- 1. booking_listings — same as v2 minus max_guests/amenities.
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

  price_usd integer not null check (price_usd > 0),
  price_unit text not null default 'per_night' check (price_unit in ('per_night', 'per_event')),

  minimum_nights smallint not null default 1 check (minimum_nights >= 1),
  maximum_nights smallint check (maximum_nights is null or maximum_nights >= minimum_nights),

  -- Accommodation-only real specs (furnished_apartment/furnished_studio/
  -- furnished_villa/chalet) — null for wedding_hall.
  bedrooms smallint check (bedrooms is null or bedrooms >= 0),
  bathrooms smallint check (bathrooms is null or bathrooms >= 0),
  beds smallint check (beds is null or beds >= 0),

  -- Wedding-hall-only real specs — null for the 4 accommodation types.
  hall_type text check (hall_type is null or hall_type in ('indoor', 'outdoor', 'both')),
  number_of_halls smallint check (number_of_halls is null or number_of_halls >= 1),

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

create trigger booking_listings_set_updated_at
before update on public.booking_listings
for each row execute procedure public.set_updated_at();

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

-- ---------------------------------------------------------------------------
-- 2. booking_listing_photos — unchanged from v2.
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

-- ---------------------------------------------------------------------------
-- 3. publish_booking_listing_if_eligible — unchanged logic from v2.
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

alter table public.notifications
  add column if not exists related_booking_listing_id uuid;

alter table public.notifications
  add constraint notifications_related_booking_listing_id_fkey
  foreign key (related_booking_listing_id) references public.booking_listings (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. reservations — unchanged real schema/guarantees from v2.
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

-- ---------------------------------------------------------------------------
-- 5. booking_listing_blackout_dates — NEW real owner-managed availability.
-- The owner marks specific real calendar dates unavailable (independent of
-- any reservation — e.g. already booked elsewhere, under maintenance).
-- Plain owner-scoped table CRUD via RLS (no RPC needed, same pattern as
-- booking_listing_photos) — every availability query below then treats a
-- blackout date exactly like a real 1-night reservation.
-- ---------------------------------------------------------------------------

create table public.booking_listing_blackout_dates (
  id uuid primary key default gen_random_uuid(),
  booking_listing_id uuid not null references public.booking_listings (id) on delete cascade,
  blocked_date date not null,
  created_at timestamptz not null default now(),
  unique (booking_listing_id, blocked_date)
);

create index booking_listing_blackout_dates_listing_idx on public.booking_listing_blackout_dates (booking_listing_id, blocked_date);

alter table public.booking_listing_blackout_dates enable row level security;

create policy "Blackout dates are viewable if their listing is"
  on public.booking_listing_blackout_dates for select
  using (
    exists (
      select 1 from public.booking_listings bl
      where bl.id = booking_listing_id and (bl.status = 'published' or bl.owner_id = auth.uid())
    )
  );

create policy "Owners can add blackout dates to their own booking listings"
  on public.booking_listing_blackout_dates for insert
  to authenticated
  with check (exists (select 1 from public.booking_listings bl where bl.id = booking_listing_id and bl.owner_id = auth.uid()));

create policy "Owners can remove blackout dates from their own booking listings"
  on public.booking_listing_blackout_dates for delete
  using (exists (select 1 from public.booking_listings bl where bl.id = booking_listing_id and bl.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. get_unavailable_dates / create_reservation — real reservations UNION
-- real owner blackout dates, so a caller sees one consistent real
-- unavailable-dates picture regardless of which of the two caused it. A
-- blackout date is represented as the half-open range
-- [blocked_date, blocked_date + 1) so it plugs directly into the exact same
-- range-based "is this day blocked" logic the client already uses for
-- reservations — no separate client-side concept needed.
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
  union all
  select b.blocked_date, b.blocked_date + 1
  from public.booking_listing_blackout_dates b
  where b.booking_listing_id = p_booking_listing_id
  order by 1;
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

  if exists (
    select 1 from public.booking_listing_blackout_dates b
    where b.booking_listing_id = p_booking_listing_id
      and b.blocked_date >= p_check_in and b.blocked_date < p_check_out
  ) then
    raise exception 'These dates are no longer available for this listing';
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

-- update_reservation_status is untouched by this migration (no column it
-- reads changed) — its 20260914000000 definition stays in effect.

-- ---------------------------------------------------------------------------
-- 7. search_bookable_listings — same real single-round-trip search, minus
-- p_min_guests/p_amenities (dropped fields), plus real blackout-date
-- availability filtering alongside the existing real reservation overlap
-- check.
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
  p_hall_type text default null
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
  hall_type text,
  number_of_halls smallint,
  cover_photo_path text
)
language sql
security definer set search_path = public
stable
as $$
  select
    bl.id, bl.booking_type, bl.title, bl.city, bl.area, bl.price_usd, bl.price_unit, bl.minimum_nights,
    bl.bedrooms, bl.bathrooms, bl.beds, bl.hall_type, bl.number_of_halls,
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
    and (p_hall_type is null or bl.hall_type = p_hall_type)
    and (
      p_check_in is null or p_check_out is null or (
        not exists (
          select 1 from public.reservations r
          where r.booking_listing_id = bl.id
            and r.status in ('pending', 'confirmed')
            and daterange(r.check_in, r.check_out, '[)') && daterange(p_check_in, p_check_out, '[)')
        )
        and not exists (
          select 1 from public.booking_listing_blackout_dates b
          where b.booking_listing_id = bl.id
            and b.blocked_date >= p_check_in and b.blocked_date < p_check_out
        )
      )
    )
  order by bl.created_at desc;
$$;

grant execute on function public.search_bookable_listings(date, date, text, text, integer, integer, integer, integer, integer, text) to anon, authenticated;
