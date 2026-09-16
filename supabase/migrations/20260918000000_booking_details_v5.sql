-- Dyarna: الحجوزات v6 — additional real type-specific specs for step 4
-- (تفاصيل المكان), per the reference-image information structure: عرض
-- الشارع، عمر العقار، الفئة، غرف نوم ماستر، غرف استقبال / مجلس.
--
-- Purely additive — a real published listing already exists in
-- production (confirmed live: 1 row, "دمشق"), so nothing is dropped.

alter table public.booking_listings
  add column if not exists street_width_m smallint check (street_width_m is null or street_width_m > 0);

alter table public.booking_listings
  add column if not exists property_age_years smallint check (property_age_years is null or property_age_years >= 0);

alter table public.booking_listings
  add column if not exists category text;

alter table public.booking_listings
  add column if not exists master_bedrooms smallint check (master_bedrooms is null or master_bedrooms >= 0);

alter table public.booking_listings
  add column if not exists reception_rooms smallint check (reception_rooms is null or reception_rooms >= 0);
