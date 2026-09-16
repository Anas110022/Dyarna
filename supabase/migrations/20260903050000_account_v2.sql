-- Dyarna: real backing schema for four new Account features — account
-- verification, notification preferences, and (via the paired
-- delete-account Edge Function) real account deletion. Password change
-- needs no schema change at all (it's a direct Supabase Auth call).
--
-- Purely additive: no existing table, RLS policy, or trigger is removed.
-- Run this after 20260903040000_account_features.sql.

-- ---------------------------------------------------------------------------
-- 1. Lock down profiles.is_verified the same way listings already protect
-- is_verified_listing: only a service-role (real admin review, done via SQL
-- today until an admin tool exists) may ever set it — never the user
-- themselves via a client update.
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_trust_rules()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.is_verified is distinct from old.is_verified and auth.role() <> 'service_role' then
    raise exception 'Only an admin can verify a profile';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_trust_rules on public.profiles;
create trigger profiles_guard_trust_rules
before update on public.profiles
for each row execute procedure public.guard_profile_trust_rules();

-- ---------------------------------------------------------------------------
-- 2. Real account-verification requests — a real document upload + review
-- queue (same spirit as the existing listing ownership-document field),
-- not an instant fake "verified" toggle.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('verification-docs', 'verification-docs', false)
on conflict (id) do nothing;

create policy "Users can upload to their own verification-docs folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read their own verification-docs folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  doc_storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists verification_requests_user_id_idx
  on public.verification_requests (user_id, created_at desc);

alter table public.verification_requests enable row level security;

create policy "Users can view their own verification requests"
  on public.verification_requests for select
  using (auth.uid() = user_id);

create policy "Users can create their own verification requests"
  on public.verification_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

-- No update policy for users: only a service-role reviewer can move a
-- request to approved/rejected (and, on approval, set profiles.is_verified —
-- both still manual via SQL today, same stage the listing-review flow is
-- already at).

-- ---------------------------------------------------------------------------
-- 3. Real, persisted notification preference — one real toggle for the one
-- real notification type that exists today. Extends (doesn't replace) the
-- publish_listing_if_eligible RPC so the preference actually gates real
-- behavior, not just a UI switch that does nothing server-side.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists notify_on_listing_published boolean not null default true;

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
