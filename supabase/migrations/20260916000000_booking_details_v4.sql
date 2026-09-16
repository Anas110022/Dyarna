-- Dyarna: الحجوزات v4 — booking details page enrichment.
--
-- Purely additive this time: a real published booking_listings row now
-- exists in production (confirmed live before writing this migration —
-- one furnished_apartment listing with 6 real photos), so this migration
-- only ever ADDs columns/tables, never drops booking_listings or
-- reservations.
--
-- 1. Real type-specific specs the details page needs beyond what v3 has:
--    area (م²), living rooms count, and floor number/floor count — all
--    nullable, shown only when the owner actually provided them.
-- 2. Re-introduces real owner-selected amenities (booking_amenity_types +
--    booking_listings.amenities), per updated product direction — a
--    booking place's "مميزات المكان" should reflect real features the
--    owner picked, not be invented on the details page.

alter table public.booking_listings
  add column if not exists area_sqm smallint check (area_sqm is null or area_sqm > 0);

alter table public.booking_listings
  add column if not exists living_rooms smallint check (living_rooms is null or living_rooms >= 0);

alter table public.booking_listings
  add column if not exists floor_number smallint check (floor_number is null or floor_number >= 0);

alter table public.booking_listings
  add column if not exists amenities text[] not null default '{}'::text[];

create table if not exists public.booking_amenity_types (
  key text primary key,
  name_ar text not null,
  name_en text not null,
  applicable_booking_types text[] not null
);

alter table public.booking_amenity_types enable row level security;

drop policy if exists "Booking amenity types are viewable by everyone" on public.booking_amenity_types;
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

drop trigger if exists booking_listings_validate_amenities on public.booking_listings;
create trigger booking_listings_validate_amenities
before insert or update of amenities on public.booking_listings
for each row execute procedure public.validate_booking_listing_amenities();
