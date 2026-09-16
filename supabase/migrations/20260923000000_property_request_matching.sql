-- طلب عقار — Step 2: real matching against real published listings, real
-- owner notifications, and real owner responses. Purely additive — no
-- existing table, column, or policy is altered destructively; the client
-- never computes a match or writes a notification itself (there is still
-- no client insert policy on notifications, same as every other domain in
-- this app) — matching and notification creation happen exclusively
-- inside SECURITY DEFINER trigger functions, the same pattern already
-- used by notify_new_message() for chat.

-- ---------------------------------------------------------------------------
-- 1. notifications gets one more nullable related-id column, following the
-- exact existing convention (related_listing_id, related_booking_listing_id,
-- related_conversation_id already exist) rather than a new generic table.
-- ---------------------------------------------------------------------------

alter table public.notifications
  add column if not exists related_property_request_id uuid references public.property_requests (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. property_request_matches — the real, structured record of which real
-- published listing (and therefore which real owner) matched which real
-- request. Owner-readable only; nothing else ever selects from it
-- directly (customers see owner *responses*, not raw matches).
-- ---------------------------------------------------------------------------

create table if not exists public.property_request_matches (
  id uuid primary key default gen_random_uuid(),
  property_request_id uuid not null references public.property_requests (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint property_request_matches_unique unique (property_request_id, listing_id)
);

create index if not exists property_request_matches_owner_idx on public.property_request_matches (owner_id, created_at desc);
create index if not exists property_request_matches_request_idx on public.property_request_matches (property_request_id);

alter table public.property_request_matches enable row level security;

create policy "Owners can view their own property request matches"
  on public.property_request_matches for select
  using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- 3. property_request_responses — a real offer: one specific real listing,
-- belonging to the real owner responding, against one real request.
-- ---------------------------------------------------------------------------

create table if not exists public.property_request_responses (
  id uuid primary key default gen_random_uuid(),
  property_request_id uuid not null references public.property_requests (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  message text check (message is null or char_length(message) <= 500),
  created_at timestamptz not null default now(),
  constraint property_request_responses_unique unique (property_request_id, listing_id)
);

create index if not exists property_request_responses_owner_idx on public.property_request_responses (owner_id, created_at desc);
create index if not exists property_request_responses_request_idx on public.property_request_responses (property_request_id);

alter table public.property_request_responses enable row level security;

create policy "Owners can view their own responses"
  on public.property_request_responses for select
  using (auth.uid() = owner_id);

create policy "Customers can view responses to their own requests"
  on public.property_request_responses for select
  using (exists (select 1 from public.property_requests pr where pr.id = property_request_id and pr.user_id = auth.uid()));

-- Real, restricted insert: the caller must own the listing they're
-- offering, AND that exact (request, listing) pair must already be a real
-- computed match — an owner can never attach a property that wasn't
-- theirs, and never one that never actually matched.
create policy "Owners can respond with their own matching listing"
  on public.property_request_responses for insert
  to authenticated
  with check (
    auth.uid() = owner_id
    and exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid())
    and exists (
      select 1 from public.property_request_matches m
      where m.property_request_id = property_request_responses.property_request_id
        and m.listing_id = property_request_responses.listing_id
        and m.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Real matching index on listings for this exact query shape (status +
-- rent/sale + category + governorate is the hard-filter hot path).
-- ---------------------------------------------------------------------------

create index if not exists listings_matching_idx on public.listings (status, listing_type, category, governorate_id);

-- ---------------------------------------------------------------------------
-- 5. The real matching function — runs automatically the moment a request
-- is actually saved, never dependent on the client calling anything else.
-- Hard requirements: published only, same rent/sale type, same category,
-- same governorate (when the request has one), within budget (when the
-- customer actually gave one), contains every requested feature (when any
-- were selected). Soft: rooms/bathrooms use >=, never exact. Neighborhood,
-- when given, is a priority ordering, not a filter — never silently drops
-- otherwise-valid matches over free-text spelling differences. Capped to
-- at most 10 distinct owners notified, at most 30 matches recorded.
-- ---------------------------------------------------------------------------

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

  return new;
end;
$$;

drop trigger if exists property_requests_match_owners on public.property_requests;
create trigger property_requests_match_owners
after insert on public.property_requests
for each row execute procedure public.match_property_request_owners();

-- ---------------------------------------------------------------------------
-- 6. The real customer notification — fires the moment a real owner
-- response is actually saved.
-- ---------------------------------------------------------------------------

create or replace function public.notify_property_request_response()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  select user_id into v_customer_id from public.property_requests where id = new.property_request_id;
  if v_customer_id is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, related_listing_id, related_property_request_id)
  values (v_customer_id, 'property_request_response', 'لديك رد على طلب عقار', 'أحد المعلنين أرسل لك عقاراً يطابق طلبك', new.listing_id, new.property_request_id);

  return new;
end;
$$;

drop trigger if exists property_request_responses_notify on public.property_request_responses;
create trigger property_request_responses_notify
after insert on public.property_request_responses
for each row execute procedure public.notify_property_request_response();
