-- Dyarna: real report + block system (spec §4 screen 02's
-- "🚩 الإبلاغ عن هذا الإعلان" link, plus user-level report/block flagged
-- during the Account audit).
--
-- Purely additive: no existing table or RLS policy is removed. The one
-- exception is the listings SELECT policy, which is altered (not dropped)
-- to also hide listings between two users with a real block between them —
-- everything else about that policy is unchanged.
-- Run this after 20260908000000_reviews.sql.

-- ---------------------------------------------------------------------------
-- 1. Blocks — a real, one-directional relationship a user can toggle on
-- their own. Only the blocker can ever see their own blocklist (RLS);
-- enforcement of its effects (below) runs server-side regardless of who
-- can see what, so it can't be bypassed by simply not checking first.
-- ---------------------------------------------------------------------------

create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id),
  constraint user_blocks_unique unique (blocker_id, blocked_id)
);

create index if not exists user_blocks_blocker_id_idx on public.user_blocks (blocker_id);
create index if not exists user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

create policy "Users can view their own blocklist"
  on public.user_blocks for select
  using (auth.uid() = blocker_id);

create policy "Users can block someone as themselves"
  on public.user_blocks for insert
  to authenticated
  with check (auth.uid() = blocker_id and blocker_id <> blocked_id);

create policy "Users can unblock someone as themselves"
  on public.user_blocks for delete
  using (auth.uid() = blocker_id);

-- A block (in either direction) stops new conversations from starting —
-- resolved from the listing's real owner, independent of trigger firing
-- order against conversations_set_owner.
create or replace function public.guard_no_block_conversations()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.listings where id = new.listing_id;
  if v_owner is null then
    return new;
  end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = new.buyer_id and b.blocked_id = v_owner)
       or (b.blocker_id = v_owner and b.blocked_id = new.buyer_id)
  ) then
    raise exception 'blocked_user';
  end if;
  return new;
end;
$$;

create trigger conversations_guard_no_block
before insert on public.conversations
for each row execute procedure public.guard_no_block_conversations();

-- A block (in either direction) also stops new messages in an *existing*
-- conversation — covers the case where the block happens after the
-- conversation already exists.
create or replace function public.guard_no_block_messages()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_buyer uuid;
  v_owner uuid;
begin
  select buyer_id, owner_id into v_buyer, v_owner
  from public.conversations
  where id = new.conversation_id;

  if v_buyer is null then
    return new;
  end if;

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_buyer and b.blocked_id = v_owner)
       or (b.blocker_id = v_owner and b.blocked_id = v_buyer)
  ) then
    raise exception 'blocked_user';
  end if;

  return new;
end;
$$;

create trigger messages_guard_no_block
before insert on public.messages
for each row execute procedure public.guard_no_block_messages();

-- A block (in either direction) also hides that owner's listings from the
-- blocking/blocked party — enforced at the RLS layer itself, so it applies
-- everywhere listings are ever queried (Home map, list, search, favorites,
-- profile) with zero client-side query changes. Owners always still see
-- their own listings (the self-block case never matches).
alter policy "Published listings are viewable by everyone"
  on public.listings
  using (
    (status = 'published' or auth.uid() = owner_id)
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = owner_id)
         or (b.blocker_id = owner_id and b.blocked_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Reports — a single moderation-queue table covering listings, user
-- profiles, and reviews. target_id is intentionally not a foreign key
-- (it points at whichever table target_type names) — this is a reporting
-- queue, not a referential-integrity-critical table, and the app never
-- trusts target_id for anything beyond showing/reviewing the report.
-- No select/update policy for regular users beyond their own submitted
-- reports — reviewing reports is a future admin-tool concern (service
-- role bypasses RLS), not built here.
-- ---------------------------------------------------------------------------

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('listing', 'profile', 'review')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'fraud', 'inappropriate', 'fake_listing', 'harassment', 'other')),
  details text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  -- One report per (reporter, target) — stops a single user from spamming
  -- the same report repeatedly; they can still report different targets.
  constraint reports_unique_reporter_target unique (reporter_id, target_type, target_id)
);

create index if not exists reports_target_idx on public.reports (target_type, target_id);

alter table public.reports enable row level security;

create policy "Users can create their own reports"
  on public.reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

create policy "Users can view their own reports"
  on public.reports for select
  using (auth.uid() = reporter_id);
