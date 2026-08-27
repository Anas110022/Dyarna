-- Dyarna: profiles table (spec §3 "User" model).
--
-- auth.users (phone/email/password) is fully managed by Supabase Auth and
-- already works without this file. This adds the app-facing profile row
-- that every listing's "poster" card (spec §6 rule 1: no anonymous
-- listings) will read from once listings ship in a later phase.
--
-- Run this once in your Supabase project's SQL Editor (or `supabase db
-- push` if you use the CLI) after creating the project.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  email text,
  auth_method text check (auth_method in ('phone', 'email')),
  is_verified boolean not null default false,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Every listing must always show the poster's real name + avatar (spec §6),
-- so profiles are world-readable; only the owner can edit their own row.
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create the profile row the moment Supabase Auth creates the user
-- (phone OTP signup, email signup, etc.) so the app never has to do it
-- client-side.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, email, auth_method)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.phone,
    new.email,
    case when new.phone is not null then 'phone' else 'email' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
