-- Dyarna: real property categories + a scalable amenities system.
--
-- Adds three real property types (warehouse, farm, chalet) to the category
-- enum, two structured numeric fields for category-specific detail
-- (living_rooms, ceiling_height_m), and a real, extensible amenities
-- mechanism: a reference table (amenity_types) — same pattern as the
-- existing `governorates` table — plus one `amenities text[]` column on
-- listings. Adding a new amenity later is a single INSERT into
-- amenity_types; it never needs another migration.
--
-- Purely additive: no existing column, RLS policy, or trigger is removed or
-- changed. Run this after 20260903000000_auto_publish.sql.

-- ---------------------------------------------------------------------------
-- 1. Category enum: add warehouse, farm, chalet.
-- ---------------------------------------------------------------------------

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public' and rel.relname = 'listings' and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%category%';

  if constraint_name is not null then
    execute format('alter table public.listings drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.listings
  add constraint listings_category_check
  check (category in ('apartment', 'villa', 'house', 'land', 'office', 'shop', 'building', 'warehouse', 'farm', 'chalet'));

-- ---------------------------------------------------------------------------
-- 2. Structured numeric fields — genuinely comparable/range-filterable
-- values, same treatment as the existing bedrooms/area_sqm/frontage_m
-- columns, not amenities.
-- ---------------------------------------------------------------------------

alter table public.listings
  add column if not exists living_rooms smallint check (living_rooms >= 0),
  add column if not exists ceiling_height_m numeric check (ceiling_height_m > 0);

-- ---------------------------------------------------------------------------
-- 3. Amenities: a real reference table + one array column, not one column
-- per amenity.
-- ---------------------------------------------------------------------------

create table if not exists public.amenity_types (
  key text primary key,
  name_ar text not null,
  name_en text not null,
  applicable_categories text[] not null
);

alter table public.amenity_types enable row level security;

create policy "Amenity types are viewable by everyone"
  on public.amenity_types for select
  using (true);

insert into public.amenity_types (key, name_ar, name_en, applicable_categories) values
  ('elevator', 'مصعد', 'Elevator', array['apartment']),
  ('parking', 'موقف سيارات', 'Parking', array['apartment', 'villa', 'office', 'shop', 'building']),
  ('pool', 'مسبح', 'Pool', array['villa', 'chalet']),
  ('garden', 'حديقة', 'Garden', array['villa', 'chalet', 'farm']),
  ('basement', 'قبو', 'Basement', array['villa', 'house']),
  ('maid_room', 'غرفة خادمة', 'Maid room', array['villa']),
  ('driver_room', 'غرفة سائق', 'Driver room', array['villa']),
  ('commercial_use_permit', 'تصريح استخدام تجاري', 'Commercial-use permit', array['shop', 'office', 'warehouse', 'building'])
on conflict (key) do nothing;

alter table public.listings
  add column if not exists amenities text[] not null default '{}'::text[];

create index if not exists listings_amenities_gin_idx on public.listings using gin (amenities);

-- Real data-integrity check: an amenities array can only ever contain keys
-- that actually exist in amenity_types — same spirit as the trust-rule
-- trigger already protecting status/is_verified_listing.
create or replace function public.validate_listing_amenities()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.amenities is not null and array_length(new.amenities, 1) > 0 then
    if exists (
      select 1 from unnest(new.amenities) as a(key)
      where not exists (select 1 from public.amenity_types t where t.key = a.key)
    ) then
      raise exception 'Unknown amenity key in amenities array';
    end if;
  end if;
  return new;
end;
$$;

create trigger listings_validate_amenities
before insert or update of amenities on public.listings
for each row execute procedure public.validate_listing_amenities();
