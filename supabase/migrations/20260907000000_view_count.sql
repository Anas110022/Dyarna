-- Dyarna: real view-count increments on the Listing Details screen.
--
-- A SECURITY DEFINER RPC — never a raw client-side UPDATE — so the client
-- can only ever say "a real view of this listing just happened," never
-- write an arbitrary view_count value. Only published listings count, and
-- an owner viewing their own listing never inflates their own count.
--
-- Purely additive: no existing table, RLS policy, or trigger is removed.
-- Run this after 20260906000000_message_notifications.sql.

-- set_updated_at() is shared with verification_requests (which has no
-- view_count column, so this change is a no-op there) — generalized so a
-- view-count-only change never bumps `updated_at` (that column means "this
-- listing's real content last changed", not "someone looked at it"), while
-- any actual content edit still bumps it exactly as before.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'updated_at' - 'view_count') = (to_jsonb(old) - 'updated_at' - 'view_count') then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create or replace function public.increment_listing_view_count(p_listing_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.listings
  set view_count = view_count + 1
  where id = p_listing_id
    and status = 'published'
    and owner_id is distinct from auth.uid();
end;
$$;

grant execute on function public.increment_listing_view_count(uuid) to authenticated, anon;
