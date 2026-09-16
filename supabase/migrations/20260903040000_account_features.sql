-- Dyarna: real backing schema for the Account ("حسابي") screen —
-- avatar uploads, real user notifications, and real support tickets.
--
-- Purely additive: no existing table, RLS policy, or trigger is removed.
-- Run this after 20260903030000_email_otp_codes.sql.

-- ---------------------------------------------------------------------------
-- 1. Avatar uploads — same public-bucket-with-owner-folder pattern already
-- used for listing-photos.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload to their own avatars folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update files in their own avatars folder"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete files in their own avatars folder"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 2. Notifications — real, user-owned. Only ever inserted by a
-- SECURITY DEFINER function reacting to a real event (e.g. a listing
-- actually getting published below) — never by the client directly, and
-- never pre-seeded with fake rows.
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  related_listing_id uuid references public.listings (id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users can view their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can mark their own notifications read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No insert policy for anon/authenticated: rows are only ever created by
-- SECURITY DEFINER functions (which bypass RLS), reacting to a real event.

-- ---------------------------------------------------------------------------
-- 3. Support tickets — real, user-owned. Users can create and view their
-- own; nothing is auto-filled or fabricated.
-- ---------------------------------------------------------------------------

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(message) > 0),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_user_id_created_at_idx
  on public.support_tickets (user_id, created_at desc);

alter table public.support_tickets enable row level security;

create policy "Users can view their own support tickets"
  on public.support_tickets for select
  using (auth.uid() = user_id);

create policy "Users can create their own support tickets"
  on public.support_tickets for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Real notification on real publish — extends the existing
-- publish_listing_if_eligible RPC (20260903000000_auto_publish.sql) so a
-- genuine "your listing was published" notification is created exactly
-- when that real event actually happens. Same signature, same trust rules;
-- purely additive.
-- ---------------------------------------------------------------------------

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

  perform set_config('app.auto_publish', 'on', true);

  update public.listings
  set status = 'published'
  where id = p_listing_id
    and status = 'pending_review';

  insert into public.notifications (user_id, type, title, body, related_listing_id)
  values (
    v_owner,
    'listing_published',
    'تم نشر إعلانك',
    format('إعلانك "%s" أصبح ظاهرًا الآن لجميع الزوار.', v_title),
    p_listing_id
  );

  return true;
end;
$$;

grant execute on function public.publish_listing_if_eligible(uuid) to authenticated;
