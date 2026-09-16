-- Additive only: two more real amenity types for the owner feature-picker,
-- requested for the الحجوزات posting flow. Existing amenity_types rows and
-- any real listing's already-selected `amenities` values are untouched.
insert into public.booking_amenity_types (key, name_ar, name_en, applicable_booking_types) values
  ('family_section', 'قسم العوائل', 'Family section', array['wedding_hall']),
  ('near_bus_station', 'قريب من محطة باص', 'Near a bus station', array['furnished_apartment', 'furnished_studio', 'furnished_villa', 'chalet'])
on conflict (key) do nothing;
