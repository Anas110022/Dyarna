-- Additive/data-only: brings the amenity picker for شقة مفروشة / استديو
-- مفروش / فيلا مفروشة up to the same 13-feature list across all 3 types
-- (مؤثثة intentionally excluded — see prior explicit decision this
-- session). No row is deleted, no key is removed, no existing real
-- listing's `amenities` values are touched — only which types each
-- existing/new amenity type applies to.

update public.booking_amenity_types
  set applicable_booking_types = array['furnished_apartment', 'furnished_studio', 'furnished_villa', 'chalet']
  where key = 'pool';

update public.booking_amenity_types
  set applicable_booking_types = array['furnished_apartment', 'furnished_studio', 'furnished_villa', 'chalet']
  where key = 'garden';

update public.booking_amenity_types
  set applicable_booking_types = array['furnished_apartment', 'furnished_studio', 'furnished_villa']
  where key = 'elevator';

update public.booking_amenity_types
  set applicable_booking_types = array['furnished_apartment', 'furnished_studio', 'furnished_villa', 'wedding_hall']
  where key = 'family_section';

insert into public.booking_amenity_types (key, name_ar, name_en, applicable_booking_types) values
  ('sewage', 'توفر صرف صحي', 'Sewage available', array['furnished_apartment', 'furnished_studio', 'furnished_villa']),
  ('car_entrance', 'مدخل سيارة', 'Car entrance', array['furnished_apartment', 'furnished_studio', 'furnished_villa']),
  ('water_supply', 'توفر الماء', 'Water available', array['furnished_apartment', 'furnished_studio', 'furnished_villa']),
  ('electricity_supply', 'توفر الكهرباء', 'Electricity available', array['furnished_apartment', 'furnished_studio', 'furnished_villa'])
on conflict (key) do nothing;
