-- Dyarna: "معلومات الإعلان" (ad info) fields on listings.
--
-- Adds:
--   - ad_number: a real, server-generated sequential ad number (never
--     client-supplied, never fake) — one Postgres sequence backing a unique
--     bigint column, same approach a paper filing number would use.
--   - license_number / license_expiry_date / ad_source / deed_area_sqm: all
--     optional, advertiser-supplied fields. Stored as NULL (never an
--     invented placeholder) when the advertiser doesn't provide them; the
--     app is responsible for rendering NULL as "غير متوفر", not this schema.
--
-- created_at, updated_at, and view_count already exist on public.listings
-- (20260902000000_listings.sql) and are untouched here — this migration
-- only adds what's genuinely missing.
--
-- Purely additive: no existing column, RLS policy, or trigger is removed.
-- Run this after 20260903010000_categories_amenities.sql.

-- ---------------------------------------------------------------------------
-- 1. Ad number — real, auto-generated, unique, never editable by a client.
-- ---------------------------------------------------------------------------

create sequence if not exists public.listings_ad_number_seq;

alter table public.listings
  add column if not exists ad_number bigint;

alter table public.listings
  alter column ad_number set default nextval('public.listings_ad_number_seq');

alter sequence public.listings_ad_number_seq owned by public.listings.ad_number;

-- Backfill any real listings that already exist (created before this
-- migration ran) with a real sequential number — never a fake/shared one.
update public.listings
set ad_number = nextval('public.listings_ad_number_seq')
where ad_number is null;

alter table public.listings
  alter column ad_number set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'listings_ad_number_key'
  ) then
    alter table public.listings add constraint listings_ad_number_key unique (ad_number);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Optional advertiser-supplied ad-info fields.
-- ---------------------------------------------------------------------------

alter table public.listings
  add column if not exists license_number text,
  add column if not exists license_expiry_date date,
  add column if not exists ad_source text,
  add column if not exists deed_area_sqm numeric check (deed_area_sqm > 0);

-- ---------------------------------------------------------------------------
-- 3. Protect ad_number the same way owner_id is already protected: only a
-- service-role (admin tooling) may ever change it after creation.
-- ---------------------------------------------------------------------------

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

  if new.ad_number is distinct from old.ad_number and auth.role() <> 'service_role' then
    raise exception 'ad_number cannot be changed';
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
