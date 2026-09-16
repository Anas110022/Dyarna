-- طلب عقار — the one missing notification: tell the CUSTOMER the moment a
-- real match is found, not just the owner. Purely additive: extends the
-- existing match_property_request_owners() trigger function (same trigger,
-- same event, same real property_request_matches rows it already computed
-- a few lines above) rather than adding a second trigger — there is
-- nothing new to race or duplicate-fire against.
--
-- Reuses the existing notifications.related_listing_id column (already on
-- the table, already used by the owner-response notification) so the
-- customer notification carries the exact matched listing, not just the
-- request. Dedup key is the full (customer, request, listing) triple —
-- deliberately finer-grained than the owner notification's (owner,
-- request) dedup, because each matched listing is its own "exact matching
-- property" the customer should be able to open, matching the existing
-- system's own 30-match-per-request cap already applied when
-- property_request_matches was populated above in this same function.

create or replace function public.match_property_request_owners()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status <> 'active' then
    return new;
  end if;

  insert into public.property_request_matches (property_request_id, listing_id, owner_id)
  select new.id, l.id, l.owner_id
  from public.listings l
  where l.status = 'published'
    and l.listing_type = new.request_type
    and l.category = new.property_type
    and (new.governorate_id is null or l.governorate_id = new.governorate_id)
    and (new.min_price_usd is null or l.price_usd >= new.min_price_usd)
    and (new.max_price_usd is null or l.price_usd <= new.max_price_usd)
    and (new.min_rooms is null or l.bedrooms is null or l.bedrooms >= new.min_rooms)
    and (new.min_bathrooms is null or l.bathrooms is null or l.bathrooms >= new.min_bathrooms)
    and (array_length(new.requested_features, 1) is null or l.amenities @> new.requested_features)
  order by
    (new.neighborhood is not null and l.area is not null and l.area ilike new.neighborhood) desc,
    l.created_at desc
  limit 30
  on conflict (property_request_id, listing_id) do nothing;

  insert into public.notifications (user_id, type, title, body, related_property_request_id)
  select matched_owners.owner_id, 'property_request_match', 'طلب عقار جديد', 'يوجد عميل يبحث عن عقار يطابق أحد إعلاناتك', new.id
  from (
    select distinct owner_id
    from public.property_request_matches
    where property_request_id = new.id
    limit 10
  ) matched_owners
  where not exists (
    select 1 from public.notifications n
    where n.user_id = matched_owners.owner_id
      and n.related_property_request_id = new.id
      and n.type = 'property_request_match'
  );

  -- The new part: one real notification per real matched listing, straight
  -- to the customer who owns this request (new.user_id — no lookup
  -- needed, this trigger already runs on property_requests itself).
  insert into public.notifications (user_id, type, title, body, related_listing_id, related_property_request_id)
  select new.user_id, 'property_request_match', 'وجدنا عقارًا مطابقًا لطلبك', 'تم العثور على عقار يناسب المواصفات التي طلبتها.', m.listing_id, new.id
  from public.property_request_matches m
  where m.property_request_id = new.id
    and not exists (
      select 1 from public.notifications n
      where n.user_id = new.user_id
        and n.related_property_request_id = new.id
        and n.related_listing_id = m.listing_id
        and n.type = 'property_request_match'
    );

  return new;
end;
$$;
