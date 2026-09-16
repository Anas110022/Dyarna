-- المشاريع (Projects) — Stage 3, part 2: the real project/unit data model,
-- deliberately separate from public.listings (a project is a parent
-- entity with many units, not a single ad — see docs/dyarna-app-specs.md
-- §"Developer / off-plan project listings"). Follows the exact same
-- conventions already established by public.listings/listing_photos:
-- same moderation status shape, same Syria lat/lng bounding box, same
-- "photos as a child table with sort_order" pattern, same public-bucket-
-- with-owner-folder-scoped-writes storage shape.
--
-- developer_id references profiles directly — no separate
-- project_developers table. A project's developer is just a profile
-- whose verification_requests.advertiser_type = 'developer' has been
-- admin-approved (profiles.is_verified = true), reusing 100% of the
-- existing advertiser trust-gate rather than a second account system.
--
-- Purely additive — no existing table, column, policy, or trigger is
-- altered. Run after 20260929000000_developer_advertiser_type.sql.

-- ---------------------------------------------------------------------------
-- 1. projects
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.profiles (id) on delete cascade,

  title text not null check (char_length(title) > 0),
  description text not null check (char_length(description) >= 40),
  project_type text not null check (project_type in (
    'apartment_building', 'villa_project', 'townhouse', 'multi_floor',
    'residential_complex', 'commercial', 'land', 'mixed_use'
  )),

  governorate_id text not null references public.governorates (id),
  city text not null check (char_length(city) > 0),
  district text,
  address text,

  -- Same real Syria bounding box already enforced on public.listings
  -- (supabase/migrations/20260902000000_listings.sql) — kept identical so
  -- a valid project coordinate and a valid listing coordinate never drift
  -- apart.
  lat double precision not null check (lat between 32.0 and 37.5),
  lng double precision not null check (lng between 35.5 and 42.5),

  min_price_usd integer check (min_price_usd is null or min_price_usd >= 0),
  max_price_usd integer check (max_price_usd is null or max_price_usd >= 0),
  total_units integer check (total_units is null or total_units >= 0),

  -- Informational delivery state (شقق جاهزة/تحت الإنشاء/...) — distinct
  -- from `status` below, which is the real public/private moderation gate.
  delivery_status text not null default 'under_construction' check (delivery_status in (
    'available', 'coming_soon', 'under_construction', 'ready', 'completed', 'unavailable'
  )),

  -- The one real ملف المشروع document — a single file per project, so a
  -- nullable pair of columns here rather than an unjustified child table.
  document_storage_path text,
  document_name text,

  -- Identical moderation shape to public.listings.status: a project is
  -- never public just because a row exists — only an admin flipping this
  -- to 'published' (via the admin-projects Edge Function, service-role
  -- side, never a client RLS bypass) makes it visible to the public.
  status text not null default 'pending_review' check (status in ('pending_review', 'published', 'rejected', 'archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint projects_valid_price_range
    check (min_price_usd is null or max_price_usd is null or min_price_usd <= max_price_usd)
);

create index if not exists projects_developer_id_idx on public.projects (developer_id, created_at desc);
create index if not exists projects_status_idx on public.projects (status);
create index if not exists projects_governorate_id_idx on public.projects (governorate_id) where status = 'published';

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute procedure public.set_updated_at();

alter table public.projects enable row level security;

create policy "Published projects are viewable by everyone"
  on public.projects for select
  using (status = 'published' or auth.uid() = developer_id);

create policy "Developers can create their own projects"
  on public.projects for insert
  to authenticated
  with check (auth.uid() = developer_id);

-- Real, restricted update: a developer can edit their own project's real
-- content, but can never touch `status` themselves (moderation is
-- admin-only, enforced by the with check re-asserting status stays
-- whatever it already was for any row the developer updates — the admin
-- Edge Function bypasses RLS via service-role, same as admin-listings).
create policy "Developers can update their own projects"
  on public.projects for update
  using (auth.uid() = developer_id)
  with check (auth.uid() = developer_id);

-- ---------------------------------------------------------------------------
-- 2. project_units
-- ---------------------------------------------------------------------------

create table if not exists public.project_units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,

  unit_type text not null check (char_length(unit_type) > 0),
  unit_reference text,
  status text not null default 'available' check (status in ('available', 'reserved', 'sold')),

  price_usd integer not null check (price_usd > 0),
  area_sqm numeric not null check (area_sqm > 0),
  bedrooms smallint check (bedrooms >= 0),
  living_rooms smallint check (living_rooms >= 0),
  bathrooms smallint check (bathrooms >= 0),
  floor text,
  description text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_units_project_id_idx on public.project_units (project_id);
create index if not exists project_units_project_id_price_idx on public.project_units (project_id, price_usd);

drop trigger if exists project_units_set_updated_at on public.project_units;
create trigger project_units_set_updated_at
before update on public.project_units
for each row execute procedure public.set_updated_at();

alter table public.project_units enable row level security;

-- Units are visible whenever their parent project is (public once
-- published, always visible to the project's own developer) — the unit's
-- own status (available/reserved/sold) is informational, never a
-- visibility gate.
create policy "Units are viewable if their project is"
  on public.project_units for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and (p.status = 'published' or p.developer_id = auth.uid())
    )
  );

create policy "Developers can manage units of their own project"
  on public.project_units for all
  to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.developer_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.developer_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. project_images / project_unit_images — identical shape to the
-- existing public.listing_photos.
-- ---------------------------------------------------------------------------

create table if not exists public.project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_path text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists project_images_project_id_idx on public.project_images (project_id);

alter table public.project_images enable row level security;

create policy "Project images are viewable if their project is"
  on public.project_images for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and (p.status = 'published' or p.developer_id = auth.uid())
    )
  );

create policy "Developers can manage images of their own project"
  on public.project_images for all
  to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.developer_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.developer_id = auth.uid()));

create table if not exists public.project_unit_images (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.project_units (id) on delete cascade,
  storage_path text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists project_unit_images_unit_id_idx on public.project_unit_images (unit_id);

alter table public.project_unit_images enable row level security;

create policy "Unit images are viewable if their project is"
  on public.project_unit_images for select
  using (
    exists (
      select 1 from public.project_units u
      join public.projects p on p.id = u.project_id
      where u.id = unit_id and (p.status = 'published' or p.developer_id = auth.uid())
    )
  );

create policy "Developers can manage images of their own units"
  on public.project_unit_images for all
  to authenticated
  using (
    exists (
      select 1 from public.project_units u
      join public.projects p on p.id = u.project_id
      where u.id = unit_id and p.developer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.project_units u
      join public.projects p on p.id = u.project_id
      where u.id = unit_id and p.developer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Storage — same public-bucket-with-owner-folder-scoped-writes shape
-- already used for listing-photos.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('project-photos', 'project-photos', true)
on conflict (id) do nothing;

create policy "Project photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'project-photos');

create policy "Developers can upload to their own project-photos folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Developers can update files in their own project-photos folder"
  on storage.objects for update
  using (
    bucket_id = 'project-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Developers can delete files in their own project-photos folder"
  on storage.objects for delete
  using (
    bucket_id = 'project-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Project document (ملف المشروع) — public read (any visitor can download
-- the brochure of a published project), same owner-folder-scoped writes.
insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', true)
on conflict (id) do nothing;

create policy "Project documents are publicly readable"
  on storage.objects for select
  using (bucket_id = 'project-documents');

create policy "Developers can upload to their own project-documents folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Developers can update files in their own project-documents folder"
  on storage.objects for update
  using (
    bucket_id = 'project-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Developers can delete files in their own project-documents folder"
  on storage.objects for delete
  using (
    bucket_id = 'project-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
