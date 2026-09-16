-- Dyarna: listings schema (spec §3 "Listing" model, §5 field matrix, §6 trust rules).
--
-- Everything here is REAL schema for REAL user-submitted data — no seed rows
-- for listings themselves. The only seed data in this file is the
-- `governorates` reference table, which holds Syria's actual 14 governorates
-- (real administrative divisions, not app content) so the future location
-- picker can only ever select a real Syrian governorate. No fake listings,
-- prices, or coordinates are inserted by this migration.
--
-- Run this once in your Supabase project's SQL Editor (or `supabase db
-- push`), after 20260826000000_profiles.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Governorates (Syria's real 14 muhafazat) — reference data for the future
-- map/location picker. City and neighborhood stay free text (§3 "city,
-- area/neighborhood") since a full, reliably-accurate gazetteer of every
-- Syrian town isn't something to fabricate here; the governorate is the one
-- level of location we can enumerate with confidence.
-- ---------------------------------------------------------------------------

create table if not exists public.governorates (
  id text primary key,
  name_ar text not null,
  name_en text not null
);

alter table public.governorates enable row level security;

create policy "Governorates are viewable by everyone"
  on public.governorates for select
  using (true);

insert into public.governorates (id, name_ar, name_en) values
  ('damascus',      'دمشق',       'Damascus'),
  ('rif_dimashq',   'ريف دمشق',   'Rif Dimashq'),
  ('aleppo',        'حلب',        'Aleppo'),
  ('homs',          'حمص',        'Homs'),
  ('hama',          'حماة',       'Hama'),
  ('latakia',       'اللاذقية',   'Latakia'),
  ('tartus',        'طرطوس',      'Tartus'),
  ('idlib',         'إدلب',       'Idlib'),
  ('raqqa',         'الرقة',      'Raqqa'),
  ('deir_ezzor',    'دير الزور',  'Deir ez-Zor'),
  ('hasakah',       'الحسكة',     'Al-Hasakah'),
  ('daraa',         'درعا',       'Daraa'),
  ('suwayda',       'السويداء',   'As-Suwayda'),
  ('quneitra',      'القنيطرة',   'Quneitra')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Listings
--
-- listing_type is the rent/sale toggle actually built into the Home screen
-- (§4 screen 01 / §2's "للإيجار / للبيع" segmented control). category is the
-- 7-value chip list from that same screen (شقة/فيلا/بيت/أرض/مكتب/محل
-- تجاري/عمارة) — §3's own shorthand model text ("sale|rent|land" as
-- listing_type, "house|apartment|land|commercial" as category) is
-- inconsistent with the more detailed §2/§4 screen spec and with itself, so
-- the enums below follow the screen spec + the field matrix (§5) instead,
-- matching what's already built in src/data/mockListings.ts.
--
-- All rows are created directly as complete inserts by the post-listing
-- wizard (§4 screen 04 submits once, at the end of its 4 steps) — there is
-- no partial/draft row state, so the fields §3 marks required are NOT NULL
-- here rather than gated later. The one requirement that genuinely can't be
-- a plain column constraint is "≥3 photos" (photos are a child table), so
-- that's enforced by the trigger below at the point a listing is published.
-- ---------------------------------------------------------------------------

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,

  listing_type text not null check (listing_type in ('sale', 'rent')),
  category text not null check (category in ('apartment', 'villa', 'house', 'land', 'office', 'shop', 'building')),

  title text not null check (char_length(title) > 0),
  description text not null check (char_length(description) >= 40),
  price_usd integer not null check (price_usd > 0),

  governorate_id text not null references public.governorates (id),
  city text not null check (char_length(city) > 0),
  area text,
  -- Syria's real bounding box (~32.0-37.5N, ~35.5-42.5E) — a sanity check
  -- against garbage input, not a source of location data itself. The pin
  -- must still come from a real interactive map (later phase); this only
  -- rejects coordinates that couldn't possibly be inside Syria.
  lat double precision not null check (lat between 32.0 and 37.5),
  lng double precision not null check (lng between 35.5 and 42.5),

  -- Universal (§5: area applies to every category).
  area_sqm numeric not null check (area_sqm > 0),

  -- House / apartment / villa.
  bedrooms smallint check (bedrooms >= 0),
  bathrooms smallint check (bathrooms >= 0),
  floor smallint,
  year_built smallint check (year_built between 1900 and 2100),
  condition text check (condition in ('good', 'needs_renovation')),

  -- Land.
  land_type text check (land_type in ('residential', 'agricultural', 'commercial')),
  frontage_m numeric check (frontage_m > 0),
  road_access_description text,
  has_building_permit boolean,

  -- Rent only.
  furnished text check (furnished in ('unfurnished', 'partial', 'full')),
  lease_term text,
  down_payment_usd integer check (down_payment_usd >= 0),

  -- House / apartment / land ownership document (§5's "نوع السند").
  ownership_doc_type text,
  ownership_doc_url text,

  contact_phone text not null check (char_length(contact_phone) > 0),

  status text not null default 'pending_review' check (status in ('pending_review', 'published', 'rejected', 'archived')),
  is_verified_listing boolean not null default false,
  view_count integer not null default 0,
  saved_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listings_status_idx on public.listings (status);
create index if not exists listings_owner_id_idx on public.listings (owner_id);
create index if not exists listings_governorate_id_idx on public.listings (governorate_id);
create index if not exists listings_type_category_idx on public.listings (listing_type, category);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger listings_set_updated_at
before update on public.listings
for each row execute procedure public.set_updated_at();

-- Enforce §6's trust rules at the database boundary, not just client-side:
--   rule 3 — every new listing starts pending_review, never published on
--            creation, regardless of what a client sends.
--   rule 2 — a listing can't become `published` without >=3 photos.
--   only a service-role (i.e. a future admin tool, not the end-user app)
--   may set status = 'published' or is_verified_listing = true.
create or replace function public.guard_listing_trust_rules()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'pending_review';
    new.is_verified_listing := false;
    return new;
  end if;

  -- tg_op = 'UPDATE'
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id cannot be changed';
  end if;

  if auth.role() <> 'service_role' then
    if new.status is distinct from old.status and new.status = 'published' then
      raise exception 'Only an admin can publish a listing';
    end if;
    if new.is_verified_listing and not old.is_verified_listing then
      raise exception 'Only an admin can verify a listing';
    end if;
  end if;

  if new.status = 'published' and old.status is distinct from 'published' then
    if (select count(*) from public.listing_photos where listing_id = new.id) < 3 then
      raise exception 'A listing needs at least 3 photos before it can be published';
    end if;
  end if;

  return new;
end;
$$;

create trigger listings_guard_trust_rules
before insert or update on public.listings
for each row execute procedure public.guard_listing_trust_rules();

alter table public.listings enable row level security;

-- Published listings are public; an owner can always see their own
-- (including pending_review/rejected) for the "عقاراتي" account screen.
create policy "Published listings are viewable by everyone"
  on public.listings for select
  using (status = 'published' or auth.uid() = owner_id);

create policy "Users can create their own listings"
  on public.listings for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Owners can update their own listings"
  on public.listings for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- No delete policy: per spec §10 the account screen only lets owners
-- edit/archive their own listings, not hard-delete them (archive = update
-- status to 'archived'). Admin/service-role cleanup can still bypass RLS.

-- ---------------------------------------------------------------------------
-- Listing photos — spec §3 "photos: array of image URLs (min 3, no max)".
-- A child table (not a plain array column) so ordering, per-photo metadata,
-- and per-row RLS all work cleanly, and so "no max" doesn't need a fixed-size
-- column. Stores the Storage object path, not a full URL — the client
-- resolves the public URL from the path at render time.
-- ---------------------------------------------------------------------------

create table if not exists public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists listing_photos_listing_id_idx on public.listing_photos (listing_id);

alter table public.listing_photos enable row level security;

create policy "Photos are viewable if their listing is"
  on public.listing_photos for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and (l.status = 'published' or l.owner_id = auth.uid())
    )
  );

create policy "Owners can add photos to their own listings"
  on public.listing_photos for insert
  to authenticated
  with check (
    exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid())
  );

create policy "Owners can reorder their own listing photos"
  on public.listing_photos for update
  using (
    exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid())
  );

create policy "Owners can remove their own listing photos"
  on public.listing_photos for delete
  using (
    exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Storage bucket for listing photos. Public bucket (read is unauthenticated)
-- since published listing photos are meant to be publicly browsable and this
-- avoids signed-URL plumbing for a simple marketplace photo; write access is
-- still locked down below to the owning user's own folder.
-- Expected upload path convention: {owner_id}/{listing_id}/{filename}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

create policy "Listing photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'listing-photos');

create policy "Users can upload to their own listing-photos folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update files in their own listing-photos folder"
  on storage.objects for update
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete files in their own listing-photos folder"
  on storage.objects for delete
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
