-- طلب عقار — Step 2: real owner → customer contact for a genuinely
-- matched request. Purely additive: two new SECURITY DEFINER RPCs, no
-- existing table, column, RLS policy, or trigger is touched or weakened.
--
-- Why RPCs instead of relaxing RLS: `profiles` already has "Profiles are
-- viewable by everyone" (pre-existing, unrelated to this feature — powers
-- public profile pages). Reading a customer's phone straight off that
-- policy would work today, but would NOT actually scope access to "the
-- real matched owner" the way the spec requires — it would just ride the
-- already-broad policy. Every other place in this codebase that reads
-- ANOTHER user's phone (admin-listings, admin-verification) does it
-- through a server-side, explicitly-authorized path, never a raw client
-- select on someone else's profile. These two functions follow that same
-- established convention: authorization is checked server-side, against
-- the real property_request_matches relationship, and returns only the
-- one scalar needed — never a full profile row, and no service-role key
-- anywhere (SECURITY DEFINER achieves elevated access without one).

-- 1) Customer's phone number, gated strictly by a real match row linking
-- this exact request to this exact caller as owner. Returns null (never
-- an error a client could probe with) if the caller isn't a real matched
-- owner for this request — same fail-closed shape as an RLS-scoped SELECT
-- returning zero rows.
create or replace function public.get_matched_customer_phone(p_request_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_phone text;
begin
  if v_owner_id is null then
    return null;
  end if;

  if not exists (
    select 1 from public.property_request_matches m
    where m.property_request_id = p_request_id and m.owner_id = v_owner_id
  ) then
    return null;
  end if;

  select p.phone into v_phone
  from public.property_requests r
  join public.profiles p on p.id = r.user_id
  where r.id = p_request_id;

  return v_phone;
end;
$$;

grant execute on function public.get_matched_customer_phone(uuid) to authenticated;

-- 2) Real conversation for the owner to message the matched customer
-- about the specific matched listing. The existing conversations INSERT
-- policy only allows the buyer side to start one ("Users can start a
-- conversation as the buyer") — correct for Step 1 (customer messaging an
-- owner from a listing), but it structurally can't cover an owner
-- initiating contact, since the owner is never the buyer. This function
-- is the minimal, narrowly-scoped addition needed for that direction: it
-- verifies a real (request, listing, owner) match server-side, then
-- finds-or-creates the same real conversations row Step 1 would have
-- created had the customer messaged first — same table, same trigger
-- (conversations_set_owner), same no-self-chat constraint, just reachable
-- from the owner's side under a verified condition instead of only the
-- buyer's.
create or replace function public.get_or_create_conversation_for_match(p_request_id uuid, p_listing_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_customer_id uuid;
  v_conversation_id uuid;
begin
  if v_owner_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1 from public.property_request_matches m
    where m.property_request_id = p_request_id
      and m.listing_id = p_listing_id
      and m.owner_id = v_owner_id
  ) then
    raise exception 'not_authorized';
  end if;

  select user_id into v_customer_id from public.property_requests where id = p_request_id;
  if v_customer_id is null then
    raise exception 'request_not_found';
  end if;

  select id into v_conversation_id
  from public.conversations
  where listing_id = p_listing_id and buyer_id = v_customer_id;

  if v_conversation_id is null then
    insert into public.conversations (listing_id, buyer_id)
    values (p_listing_id, v_customer_id)
    returning id into v_conversation_id;
  end if;

  return v_conversation_id;
end;
$$;

grant execute on function public.get_or_create_conversation_for_match(uuid, uuid) to authenticated;
