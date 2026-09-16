-- Dyarna: automatic publishing for real, valid listings.
--
-- Previously every new listing needed a manual service_role/SQL-Editor
-- action to move pending_review -> published (see 20260902000000_listings.sql).
-- This migration replaces that manual gate with a narrow, server-validated
-- RPC that the app calls right after a listing's real photos are attached,
-- while keeping every other trust rule from the original migration intact:
--   - a listing can still never self-publish on INSERT (still forced to
--     pending_review there).
--   - normal clients still cannot UPDATE status/is_verified_listing directly
--     (the trigger below still blocks that for anyone who isn't service_role
--     AND isn't going through this specific function).
--   - the >=3-photos requirement is still enforced, and now enforced twice:
--     once by this function before it even attempts the update, and again
--     by the trigger itself (belt and suspenders — the trigger is the real
--     security boundary, the function is just the one legitimate caller).
--   - admins (service_role) can still set any status at any time — publish,
--     reject, archive, or send a published listing back to pending_review
--     for review after a report. Nothing here removes that.

-- A local (transaction-scoped) flag that only this function ever sets, so
-- the trigger can tell "the trusted auto-publish path did this" apart from
-- "a client UPDATE tried to do this directly". Clients have no way to set
-- this themselves — set_config's `is_local = true` scopes it to the current
-- transaction, and PostgREST/the client can only reach it by calling the
-- function below, never by issuing raw SQL.
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

  if auth.role() <> 'service_role' and coalesce(current_setting('app.auto_publish', true), '') <> 'on' then
    if new.status is distinct from old.status and new.status = 'published' then
      raise exception 'Only an admin (or the automatic publish check) can publish a listing';
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

-- Called by the app immediately after a listing's real photos have been
-- uploaded and attached. Re-validates everything server-side rather than
-- trusting the client's claim that the listing is ready:
--   - the caller must actually own the listing (auth.uid() = owner_id).
--   - the listing must actually have >=3 real photo rows already attached.
--   - only publishes from pending_review — a listing an admin has since
--     rejected or archived (e.g. after a report) is never touched by this,
--     so pending_review/rejected/archived stay meaningful moderation states.
-- All of the listing's real required fields (title, description length,
-- price, real lat/lng bounds, area, contact phone, city) are already
-- enforced by the table's own NOT NULL/CHECK constraints from the previous
-- migration, so if the row exists at all those are already satisfied.
create or replace function public.publish_listing_if_eligible(p_listing_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
  v_photo_count int;
begin
  select owner_id, status into v_owner, v_status
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

  perform set_config('app.auto_publish', 'on', true);

  update public.listings
  set status = 'published'
  where id = p_listing_id
    and status = 'pending_review';

  return true;
end;
$$;

grant execute on function public.publish_listing_if_eligible(uuid) to authenticated;
