-- طلب عقار — closes a real RLS gap found by live role-simulated testing:
-- an owner with a real, trigger-created property_request_matches row could
-- not actually read the matched property_requests row (only the match
-- record itself), which also broke fetchOwnerPropertyRequestMatches()'s
-- nested embed (property_requests came back null for a real distinct
-- owner). Purely additive — one new SELECT policy, nothing else touched.
--
-- Access is gated strictly through a real property_request_matches row,
-- which only ever exists as a real, trigger-created row
-- (match_property_request_owners() in 20260923000000_property_request_matching.sql)
-- — there is still no INSERT policy on property_request_matches for any
-- client role, so this can never be satisfied by a fabricated match.

create policy "Owners can view requests they have a real match for"
  on public.property_requests for select
  using (exists (
    select 1 from public.property_request_matches m
    where m.property_request_id = property_requests.id
      and m.owner_id = auth.uid()
  ));
