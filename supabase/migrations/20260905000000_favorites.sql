-- Dyarna: real "المفضلة" (favorites) — a user saving a real published
-- listing for later. Two UI entry points already exist in the app (the
-- Home screen's floating favorites button, and the heart icon on a
-- listing's photo gallery) but neither was ever wired to anything real
-- until this migration + the accompanying app code.
--
-- Purely additive: no existing table, RLS policy, or trigger is removed.
-- Run this after 20260904010000_chat.sql.

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint favorites_unique_per_user_listing unique (user_id, listing_id)
);

create index if not exists favorites_user_id_idx on public.favorites (user_id, created_at desc);

alter table public.favorites enable row level security;

create policy "Users can view their own favorites"
  on public.favorites for select
  using (auth.uid() = user_id);

create policy "Users can add their own favorites"
  on public.favorites for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can remove their own favorites"
  on public.favorites for delete
  using (auth.uid() = user_id);
