-- Dyarna: extend the real property category enum.
--
-- Adds 16 real property types the app didn't have yet — room, camp, kiosk,
-- cinema, parking_lot, bank, factory, health_center, power_station,
-- telecom_tower, complex, tower, hotel, workshop, school, station.
-- Deliberately does NOT touch the 10 categories already in the constraint
-- (apartment, villa, house, land, office, shop, building, warehouse, farm,
-- chalet) — this is purely additive, same pattern as
-- 20260903010000_categories_amenities.sql. No existing column, RLS policy,
-- or trigger is removed or changed.

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
  check (category in (
    'apartment', 'villa', 'house', 'land', 'office', 'shop', 'building', 'warehouse', 'farm', 'chalet',
    'room', 'camp', 'kiosk', 'cinema', 'parking_lot', 'bank', 'factory', 'health_center',
    'power_station', 'telecom_tower', 'complex', 'tower', 'hotel', 'workshop', 'school', 'station'
  ));
