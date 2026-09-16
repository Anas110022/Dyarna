-- إحصائيات إعلاني — real, per-owner listing analytics. Covers BOTH real
-- property domains an owner can actually have: public.listings (sale/rent)
-- and public.booking_listings (short-stay), confirmed via live schema
-- inspection to be fully independent tables (booking_listings has its own
-- owner_id/title/status — no listing_id FK to listings).
--
-- Reused, not duplicated:
--   - Booking stats come straight from the real public.reservations table
--     and its real status enum ('pending','confirmed','cancelled','rejected','completed').
--   - Match stats come straight from the real public.property_request_matches
--     table (only ever populated for public.listings — booking_listings are
--     structurally never matched, so a booking listing's match count is a
--     real, correct 0, not a missing feature).
--   - General view counting already exists (listings.view_count +
--     increment_listing_view_count()), but it's a blunt running counter:
--     no per-event timestamp (so no real trend is possible) and no dedup
--     window (repeat views from the same viewer are all counted). This
--     feature explicitly needs both, so a real event table is added here —
--     purely additive, the old counter/RPC are untouched and keep working
--     exactly as before for the listing details screen's own display.
--
-- Purely additive: no existing table, column, RLS policy, or trigger is
-- dropped or altered.

-- ---------------------------------------------------------------------------
-- 1. listing_views — one real row per real, deduplicated view. Polymorphic
-- over the two real listing domains via two nullable FKs with a check that
-- exactly one is set, rather than inventing a shared parent table.
-- ---------------------------------------------------------------------------

create table if not exists public.listing_views (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings (id) on delete cascade,
  booking_listing_id uuid references public.booking_listings (id) on delete cascade,
  viewer_id uuid references public.profiles (id) on delete set null,
  viewer_session text,
  created_at timestamptz not null default now(),
  constraint listing_views_exactly_one_target check (
    (listing_id is not null and booking_listing_id is null)
    or (listing_id is null and booking_listing_id is not null)
  )
);

create index if not exists listing_views_listing_id_created_at_idx on public.listing_views (listing_id, created_at);
create index if not exists listing_views_booking_listing_id_created_at_idx on public.listing_views (booking_listing_id, created_at);

alter table public.listing_views enable row level security;

-- Read access strictly to the real owner of the viewed listing — never the
-- viewer themselves, never another owner. No INSERT policy at all: rows are
-- only ever created by record_listing_view() below (SECURITY DEFINER),
-- exactly the same trust boundary already used for notifications and
-- property_request_matches in this codebase.
create policy "Owners can view their own listing view events"
  on public.listing_views for select
  using (
    (listing_id is not null and exists (
      select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()
    ))
    or (booking_listing_id is not null and exists (
      select 1 from public.booking_listings bl where bl.id = booking_listing_id and bl.owner_id = auth.uid()
    ))
  );

-- ---------------------------------------------------------------------------
-- 2. record_listing_view — the only way a view row can ever be created.
-- Real, server-verified rules: exactly one target, target must actually be
-- published, the owner viewing their own listing is never counted, and a
-- real dedup window (30 minutes) prevents the same authenticated viewer or
-- the same anonymous session from inflating the count via re-renders,
-- re-navigation, or refreshing the screen.
-- ---------------------------------------------------------------------------

create or replace function public.record_listing_view(
  p_listing_id uuid default null,
  p_booking_listing_id uuid default null,
  p_session_id text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_owner uuid;
  v_status text;
  v_exists boolean;
begin
  if (p_listing_id is null) = (p_booking_listing_id is null) then
    return;
  end if;

  if p_listing_id is not null then
    select owner_id, status into v_owner, v_status from public.listings where id = p_listing_id;
  else
    select owner_id, status into v_owner, v_status from public.booking_listings where id = p_booking_listing_id;
  end if;

  if v_owner is null or v_status <> 'published' then
    return;
  end if;
  if v_viewer is not null and v_viewer = v_owner then
    return;
  end if;
  if v_viewer is null and (p_session_id is null or char_length(p_session_id) = 0) then
    return;
  end if;

  select exists (
    select 1 from public.listing_views v
    where (
      (p_listing_id is not null and v.listing_id = p_listing_id)
      or (p_booking_listing_id is not null and v.booking_listing_id = p_booking_listing_id)
    )
    and (
      (v_viewer is not null and v.viewer_id = v_viewer)
      or (v_viewer is null and v.viewer_session = p_session_id)
    )
    and v.created_at > now() - interval '30 minutes'
  ) into v_exists;

  if v_exists then
    return;
  end if;

  insert into public.listing_views (listing_id, booking_listing_id, viewer_id, viewer_session)
  values (p_listing_id, p_booking_listing_id, v_viewer, case when v_viewer is null then p_session_id else null end);
end;
$$;

grant execute on function public.record_listing_view(uuid, uuid, text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. get_owner_listing_stats — the only way stats are ever read. Verifies
-- the caller is the real owner of the target listing server-side (never
-- trusts the client), then returns pre-aggregated counts only — no raw
-- event rows are ever sent to the client.
-- ---------------------------------------------------------------------------

create or replace function public.get_owner_listing_stats(
  p_listing_id uuid default null,
  p_booking_listing_id uuid default null,
  p_period_days integer default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_since timestamptz;
  v_views_total int := 0;
  v_views_trend json := '[]'::json;
  v_booking_requests int := 0;
  v_bookings_accepted int := 0;
  v_bookings_rejected int := 0;
  v_matched_requests int := 0;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;
  if (p_listing_id is null) = (p_booking_listing_id is null) then
    raise exception 'invalid_arguments';
  end if;

  if p_listing_id is not null then
    select owner_id into v_owner from public.listings where id = p_listing_id;
  else
    select owner_id into v_owner from public.booking_listings where id = p_booking_listing_id;
  end if;

  if v_owner is null or v_owner <> v_caller then
    raise exception 'not_authorized';
  end if;

  if p_period_days is not null then
    v_since := now() - (p_period_days || ' days')::interval;
  end if;

  select count(*) into v_views_total
  from public.listing_views
  where (
    (p_listing_id is not null and listing_id = p_listing_id)
    or (p_booking_listing_id is not null and booking_listing_id = p_booking_listing_id)
  )
  and (v_since is null or created_at >= v_since);

  if p_period_days is not null then
    select coalesce(json_agg(json_build_object('day', d.day, 'count', d.cnt) order by d.day), '[]'::json)
    into v_views_trend
    from (
      select date_trunc('day', created_at)::date as day, count(*) as cnt
      from public.listing_views
      where (
        (p_listing_id is not null and listing_id = p_listing_id)
        or (p_booking_listing_id is not null and booking_listing_id = p_booking_listing_id)
      )
      and created_at >= v_since
      group by 1
    ) d;
  end if;

  if p_booking_listing_id is not null then
    select
      count(*),
      count(*) filter (where status = 'confirmed'),
      count(*) filter (where status = 'rejected')
    into v_booking_requests, v_bookings_accepted, v_bookings_rejected
    from public.reservations
    where booking_listing_id = p_booking_listing_id
      and (v_since is null or created_at >= v_since);
  end if;

  if p_listing_id is not null then
    select count(*) into v_matched_requests
    from public.property_request_matches
    where listing_id = p_listing_id
      and (v_since is null or created_at >= v_since);
  end if;

  return json_build_object(
    'viewsTotal', v_views_total,
    'viewsTrend', v_views_trend,
    'bookingRequests', v_booking_requests,
    'bookingsAccepted', v_bookings_accepted,
    'bookingsRejected', v_bookings_rejected,
    'matchedRequests', v_matched_requests
  );
end;
$$;

grant execute on function public.get_owner_listing_stats(uuid, uuid, integer) to authenticated;
