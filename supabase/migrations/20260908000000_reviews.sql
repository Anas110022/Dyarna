-- Dyarna: real user-to-user ratings & reviews.
--
-- Legitimacy gate: Dyarna has no completed-transaction/booking system yet
-- (the Bookings tab is a permanent placeholder per the product spec), so
-- the only real, existing signal that two users actually interacted is a
-- real conversation between them (public.conversations, from the in-app
-- chat feature). A review is only ever allowed when a real conversation
-- exists between reviewer and reviewee (in either direction — either party
-- can review the other), which prevents "anyone reviews anyone" while
-- using infrastructure that already exists and is already trustworthy
-- (conversations are themselves only ever created by a real buyer against
-- a real listing's real owner).
--
-- No stored/mutable rating total exists anywhere: the average rating and
-- review count are always computed live from the real reviews rows (via
-- the review_stats view below), so there is nothing for a client to
-- manipulate — the only way to change a user's average is to submit a
-- real, individually-constrained review row.
--
-- Purely additive: no existing table, RLS policy, or trigger is removed.
-- Run this after 20260907000000_view_count.sql.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  reviewee_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_no_self_review check (reviewer_id <> reviewee_id),
  -- One review per (reviewer, reviewee) pair, ever — resubmitting is an
  -- edit (upsert on this constraint), never a second, duplicate row.
  constraint reviews_unique_reviewer_reviewee unique (reviewer_id, reviewee_id)
);

create index if not exists reviews_reviewee_id_idx on public.reviews (reviewee_id);
create index if not exists reviews_reviewer_id_idx on public.reviews (reviewer_id);

-- Reuses the same generic trigger already used by listings/verification_requests
-- (20260902000000_listings.sql / 20260904000000_identity_verification.sql) —
-- reviews has no view_count column, so that special-case is a harmless no-op
-- here; every real edit still bumps updated_at normally.
create trigger reviews_set_updated_at
before update on public.reviews
for each row execute procedure public.set_updated_at();

-- Same "you can't retarget your own row" guard already used for listings'
-- owner_id (guard_listing_trust_rules) — a reviewer can edit their own
-- rating/text, but can never repoint an existing review at a different
-- reviewer or reviewee after the fact.
create or replace function public.guard_review_trust_rules()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.reviewer_id is distinct from old.reviewer_id then
    raise exception 'reviewer_id cannot be changed';
  end if;
  if new.reviewee_id is distinct from old.reviewee_id then
    raise exception 'reviewee_id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger reviews_guard_trust_rules
before update on public.reviews
for each row execute procedure public.guard_review_trust_rules();

alter table public.reviews enable row level security;

-- Public, like profiles/listings — a review is meaningless if only the
-- reviewer can see it.
create policy "Reviews are viewable by everyone"
  on public.reviews for select
  using (true);

-- The one real trust rule: you may only review someone you've actually
-- had a real conversation with (as either the buyer or the owner side).
create policy "Users can review someone they've actually messaged"
  on public.reviews for insert
  to authenticated
  with check (
    auth.uid() = reviewer_id
    and reviewer_id <> reviewee_id
    and exists (
      select 1 from public.conversations c
      where (c.buyer_id = reviewer_id and c.owner_id = reviewee_id)
         or (c.buyer_id = reviewee_id and c.owner_id = reviewer_id)
    )
  );

create policy "Users can edit their own review"
  on public.reviews for update
  using (auth.uid() = reviewer_id)
  with check (auth.uid() = reviewer_id);

create policy "Users can delete their own review"
  on public.reviews for delete
  using (auth.uid() = reviewer_id);

-- Live-computed aggregate — never a stored column, so there is no total
-- for a client to write to. security_invoker means the view runs under
-- the querying user's own RLS, not the view owner's.
create or replace view public.review_stats
with (security_invoker = true) as
select
  reviewee_id,
  count(*)::int as review_count,
  avg(rating)::numeric(3, 2) as average_rating
from public.reviews
group by reviewee_id;

grant select on public.review_stats to anon, authenticated;
