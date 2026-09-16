-- Dyarna: the real, server-side enforcement that a listing can never go
-- live for an owner whose advertiser verification (مالك العقار / وسيط
-- ومسوق / مضيف) hasn't been approved by an admin — the missing piece from
-- 20260910000000_advertiser_verification.sql, which only built the
-- submission side. This is the actual trust gate: not a UI hint, a real
-- condition inside the same SECURITY DEFINER function that flips a
-- listing's status to 'published'.
--
-- profiles.is_verified is the one real "an admin approved this person"
-- flag — set only by the existing admin-verification Edge Function's
-- `decide` action (never by this app, never automatically on upload).
-- Reusing it here means a broker/owner/host's listing simply behaves
-- exactly like "not enough photos yet" until they're actually verified —
-- same real pending_review state, no new status value needed.
--
-- Also extends verification_requests with the two remaining real broker
-- fields (company description, license/registration number — the latter
-- genuinely optional, "إذا applicable") not yet covered by the prior
-- migration.
--
-- Purely additive/behavioral: no existing column, table, or notification
-- logic is removed — the function's real publish + notify behavior for an
-- already-verified owner is byte-for-byte unchanged.
-- Run this after 20260910000000_advertiser_verification.sql.

alter table public.verification_requests
  add column if not exists company_description text,
  add column if not exists company_license_number text;

create or replace function public.publish_listing_if_eligible(p_listing_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
  v_title text;
  v_photo_count int;
  v_notify boolean;
  v_owner_verified boolean;
begin
  select owner_id, status, title into v_owner, v_status, v_title
  from public.listings
  where id = p_listing_id;

  if v_owner is null then
    return false;
  end if;

  if v_owner <> auth.uid() then
    raise exception 'Not authorized to publish this listing';
  end if;

  if v_status <> 'pending_review' then
    return false;
  end if;

  select count(*) into v_photo_count
  from public.listing_photos
  where listing_id = p_listing_id;

  if v_photo_count < 3 then
    return false;
  end if;

  -- The real trust gate: an unverified advertiser's listing stays in
  -- pending_review indefinitely — same real state as "not enough photos",
  -- not a distinct/fake status, and not bypassable by the client (this
  -- function is the only place status can ever become 'published').
  select is_verified into v_owner_verified
  from public.profiles
  where id = v_owner;

  if not coalesce(v_owner_verified, false) then
    return false;
  end if;

  perform set_config('app.auto_publish', 'on', true);

  update public.listings
  set status = 'published'
  where id = p_listing_id
    and status = 'pending_review';

  select notify_on_listing_published into v_notify
  from public.profiles
  where id = v_owner;

  if coalesce(v_notify, true) then
    insert into public.notifications (user_id, type, title, body, related_listing_id)
    values (
      v_owner,
      'listing_published',
      'تم نشر إعلانك',
      format('إعلانك "%s" أصبح ظاهرًا الآن لجميع الزوار.', v_title),
      p_listing_id
    );
  end if;

  return true;
end;
$$;

grant execute on function public.publish_listing_if_eligible(uuid) to authenticated;
