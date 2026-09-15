-- Fixes a real bug in the previous migration (20260930010000), caught
-- before this session ended by re-verifying against the real, live
-- public.booking_listings schema instead of trusting the older
-- 20260913-era migration file. booking_listings evolved in
-- 20260916000000_booking_details_v4.sql / 20260918000000_booking_details_v5.sql
-- into its own standalone table with a real `title` column directly on
-- it (confirmed live via information_schema) — it is NOT a 1:1 extension
-- of public.listings the way it originally was. The previous migration's
-- notification bodies looked up the title via
-- `select title from public.listings where id = p_booking_listing_id`,
-- which — since booking_listings.id and listings.id are different id
-- spaces now — would have silently produced an empty title in every real
-- notification body. Fixed by reading booking_listings.title directly,
-- which the function already has the row for. No other logic changes.

create or replace function public.create_reservation(
  p_booking_listing_id uuid,
  p_check_in date,
  p_check_out date
)
returns table (id uuid, reference_code text, nights integer, nightly_price_usd integer, total_price_usd integer)
language plpgsql
security definer set search_path = public
as $$
declare
  v_listing record;
  v_nights integer;
  v_total integer;
  v_reference text;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to book';
  end if;

  if p_check_in < current_date then
    raise exception 'Check-in date cannot be in the past';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in';
  end if;

  select bl.price_usd, bl.minimum_nights, bl.maximum_nights, bl.status, bl.owner_id, bl.title
    into v_listing
  from public.booking_listings bl
  where bl.id = p_booking_listing_id
  for update of bl;

  if v_listing is null or v_listing.status <> 'published' then
    raise exception 'This booking listing is not available for booking';
  end if;

  v_nights := p_check_out - p_check_in;

  if v_nights < v_listing.minimum_nights then
    raise exception 'Minimum stay is % night(s)', v_listing.minimum_nights;
  end if;
  if v_listing.maximum_nights is not null and v_nights > v_listing.maximum_nights then
    raise exception 'Maximum stay is % night(s)', v_listing.maximum_nights;
  end if;

  if exists (
    select 1 from public.booking_listing_blackout_dates b
    where b.booking_listing_id = p_booking_listing_id
      and b.blocked_date >= p_check_in and b.blocked_date < p_check_out
  ) then
    raise exception 'These dates are no longer available for this listing';
  end if;

  v_total := v_nights * v_listing.price_usd;
  v_reference := 'DYR-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  begin
    insert into public.reservations
      (booking_listing_id, guest_id, check_in, check_out, nightly_price_usd_snapshot, total_price_usd, reference_code, status)
    values
      (p_booking_listing_id, auth.uid(), p_check_in, p_check_out, v_listing.price_usd, v_total, v_reference, 'pending')
    returning reservations.id into v_new_id;
  exception
    when exclusion_violation then
      raise exception 'These dates are no longer available for this listing';
  end;

  insert into public.notifications (user_id, type, title, body, related_booking_listing_id)
  values (
    v_listing.owner_id,
    'booking_request',
    'طلب حجز جديد',
    format('لديك طلب حجز جديد على "%s" (%s ليالٍ).', coalesce(v_listing.title, ''), v_nights),
    p_booking_listing_id
  );

  return query select v_new_id, v_reference, v_nights, v_listing.price_usd, v_total;
end;
$$;

grant execute on function public.create_reservation(uuid, date, date) to authenticated;

create or replace function public.update_reservation_status(
  p_reservation_id uuid,
  p_new_status text
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_res record;
  v_is_guest boolean;
  v_is_owner boolean;
  v_title text;
  v_notify_type text;
  v_notify_title text;
  v_notify_body text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_new_status not in ('confirmed', 'cancelled', 'rejected', 'completed') then
    raise exception 'Invalid status';
  end if;

  select r.id, r.status, r.guest_id, r.check_out, bl.owner_id, r.booking_listing_id, bl.title
    into v_res
  from public.reservations r
  join public.booking_listings bl on bl.id = r.booking_listing_id
  where r.id = p_reservation_id
  for update of r;

  if v_res is null then
    raise exception 'Reservation not found';
  end if;

  v_is_guest := v_res.guest_id = auth.uid();
  v_is_owner := v_res.owner_id = auth.uid();

  if not v_is_guest and not v_is_owner then
    raise exception 'Not authorized to change this reservation';
  end if;

  if v_is_guest and not v_is_owner then
    if p_new_status <> 'cancelled' or v_res.status not in ('pending', 'confirmed') then
      raise exception 'Guests may only cancel a pending or confirmed reservation';
    end if;
  elsif v_is_owner then
    if p_new_status = 'confirmed' and v_res.status <> 'pending' then
      raise exception 'Only a pending reservation can be confirmed';
    elsif p_new_status = 'rejected' and v_res.status <> 'pending' then
      raise exception 'Only a pending reservation can be rejected';
    elsif p_new_status = 'cancelled' and v_res.status not in ('pending', 'confirmed') then
      raise exception 'Only a pending or confirmed reservation can be cancelled';
    elsif p_new_status = 'completed' and (v_res.status <> 'confirmed' or v_res.check_out > current_date) then
      raise exception 'Only a confirmed reservation past its real check-out date can be marked completed';
    end if;
  end if;

  update public.reservations set status = p_new_status where id = p_reservation_id;

  if v_is_owner then
    v_title := v_res.title;
    if p_new_status = 'confirmed' then
      v_notify_type := 'booking_confirmed';
      v_notify_title := 'تم تأكيد حجزك';
      v_notify_body := format('تم تأكيد حجزك في "%s".', coalesce(v_title, ''));
    elsif p_new_status = 'rejected' then
      v_notify_type := 'booking_rejected';
      v_notify_title := 'تم رفض طلب الحجز';
      v_notify_body := format('تم رفض طلب حجزك في "%s".', coalesce(v_title, ''));
    elsif p_new_status = 'cancelled' then
      v_notify_type := 'booking_cancelled';
      v_notify_title := 'تم إلغاء حجزك';
      v_notify_body := format('قام المالك بإلغاء حجزك في "%s".', coalesce(v_title, ''));
    end if;

    if v_notify_type is not null then
      insert into public.notifications (user_id, type, title, body, related_booking_listing_id)
      values (v_res.guest_id, v_notify_type, v_notify_title, v_notify_body, v_res.booking_listing_id);
    end if;
  end if;

  return true;
end;
$$;

grant execute on function public.update_reservation_status(uuid, text) to authenticated;
