-- المشاريع — Stage 9 fix: public.project_interest's original insert policy
-- (supabase/migrations/20260929020000_project_interest.sql) only checked
-- auth.uid() = user_id — it never verified the target project was
-- actually published. Confirmed live and rolled back before this fix: an
-- authenticated user could insert a real project_interest row against a
-- pending_review project's id even though they can never see that
-- project through any real screen (projects' own RLS already hides it).
-- Tightened to require the same real "published" gate every other public
-- read already uses — a user can only ever register interest in a
-- project they can actually see.

drop policy "Users can register their own interest" on public.project_interest;

create policy "Users can register their own interest"
  on public.project_interest for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.status = 'published')
  );
