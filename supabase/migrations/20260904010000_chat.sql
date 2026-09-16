-- Dyarna: real in-app chat between a buyer and a listing's real owner.
--
-- One conversation per (listing, buyer) pair. owner_id is never trusted
-- from the client — a BEFORE INSERT trigger derives it from the listing's
-- real owner_id, the same pattern already used to force listings.status on
-- insert. A user cannot open a conversation with themselves: enforced by a
-- real CHECK constraint (buyer_id <> owner_id), not just a UI decision to
-- hide the button.
--
-- Purely additive: no existing table, RLS policy, or trigger is removed.
-- Run this after 20260904000000_identity_verification.sql.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_no_self_chat check (buyer_id <> owner_id),
  constraint conversations_unique_per_listing_buyer unique (listing_id, buyer_id)
);

create index if not exists conversations_buyer_id_idx on public.conversations (buyer_id);
create index if not exists conversations_owner_id_idx on public.conversations (owner_id);

alter table public.conversations enable row level security;

create policy "Participants can view their own conversations"
  on public.conversations for select
  using (auth.uid() = buyer_id or auth.uid() = owner_id);

-- Only the buyer side can start a conversation — with check ensures a user
-- can only ever create one as themselves, never on someone else's behalf.
create policy "Users can start a conversation as the buyer"
  on public.conversations for insert
  to authenticated
  with check (auth.uid() = buyer_id);

-- Real, server-derived owner — the client never supplies owner_id, and
-- couldn't spoof it even if it tried; this always overwrites whatever (if
-- anything) was sent.
create or replace function public.set_conversation_owner()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.listings where id = new.listing_id;
  if v_owner is null then
    raise exception 'Listing not found';
  end if;
  new.owner_id := v_owner;
  return new;
end;
$$;

create trigger conversations_set_owner
before insert on public.conversations
for each row execute procedure public.set_conversation_owner();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) > 0),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_created_at_idx on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

create policy "Participants can view messages in their own conversations"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.buyer_id = auth.uid() or c.owner_id = auth.uid())
    )
  );

create policy "Participants can send messages in their own conversations"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.buyer_id = auth.uid() or c.owner_id = auth.uid())
    )
  );
