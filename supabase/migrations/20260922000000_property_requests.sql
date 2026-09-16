-- طلب عقار — Services section, step 1. A real, standalone table: a
-- customer's request describing what they're looking for (rent or sale),
-- not a listing, not tied to any single property. Purely additive — no
-- existing table, column, policy, or data is touched.
--
-- Reuses the app's real, existing taxonomy rather than inventing a
-- second one: request_type mirrors listings.deal_type ('rent'/'sale'),
-- property_type mirrors listings.category's real category values, and
-- requested_features are keys from the real, existing amenity_types
-- table (the real-estate one, not the separate booking_amenity_types
-- table — this feature is about buying/renting property, never a
-- short-stay booking). Prices are USD, matching every other price
-- column in the schema (no real SYP rate exists anywhere yet).
--
-- Deliberately no owner-matching/notification logic yet (explicitly out
-- of scope for this step) — just clean structured columns and real FKs
-- so that can be layered on later without a schema change.

create table if not exists public.property_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  request_type text not null check (request_type in ('rent', 'sale')),
  property_type text not null check (property_type in (
    'apartment', 'villa', 'house', 'land', 'office', 'shop', 'building', 'warehouse',
    'farm', 'chalet', 'room', 'camp', 'kiosk', 'cinema', 'parking_lot', 'bank',
    'factory', 'health_center', 'power_station', 'telecom_tower', 'complex', 'tower',
    'hotel', 'workshop', 'school', 'station'
  )),

  governorate_id text references public.governorates (id),
  city text,
  neighborhood text,

  min_price_usd integer check (min_price_usd is null or min_price_usd >= 0),
  max_price_usd integer check (max_price_usd is null or max_price_usd >= 0),
  min_rooms smallint check (min_rooms is null or min_rooms >= 0),
  min_bathrooms smallint check (min_bathrooms is null or min_bathrooms >= 0),

  requested_features text[] not null default '{}',
  notes text check (notes is null or char_length(notes) <= 1000),

  status text not null default 'active' check (status in ('active', 'closed', 'cancelled')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint property_requests_valid_price_range
    check (min_price_usd is null or max_price_usd is null or min_price_usd <= max_price_usd)
);

create index if not exists property_requests_user_id_idx on public.property_requests (user_id, created_at desc);

drop trigger if exists property_requests_set_updated_at on public.property_requests;
create trigger property_requests_set_updated_at
before update on public.property_requests
for each row execute procedure public.set_updated_at();

alter table public.property_requests enable row level security;

create policy "Users can view their own property requests"
  on public.property_requests for select
  using (auth.uid() = user_id);

create policy "Users can create their own property requests"
  on public.property_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Real, restricted cancellation: only the request's own owner, only while
-- it's still active, and only ever into 'cancelled' — every other status
-- transition (and every other user's row) is invisible to this policy.
create policy "Users can cancel their own active property requests"
  on public.property_requests for update
  using (auth.uid() = user_id and status = 'active')
  with check (auth.uid() = user_id and status = 'cancelled');
