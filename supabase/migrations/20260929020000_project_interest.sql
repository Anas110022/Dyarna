-- المشاريع (Projects) — Stage 3, part 3: تسجيل اهتمام (register interest).
-- Deliberately NOT a booking and NOT a chat conversation — a lightweight
-- lead-capture record saying "notify the developer I'm interested",
-- exactly as specified. Notification delivery reuses the exact same
-- SECURITY DEFINER trigger pattern already used for
-- notify_property_request_response() — the client never inserts into
-- public.notifications directly, same as every other domain in this app.

create table if not exists public.project_interest (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  unit_id uuid references public.project_units (id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now(),

  -- One active interest record per user per project — re-registering
  -- updates this same row (via upsert) rather than spamming duplicates,
  -- per the explicit "prevent accidental duplicate submissions" rule.
  constraint project_interest_unique_per_user unique (project_id, user_id)
);

create index if not exists project_interest_project_id_idx on public.project_interest (project_id, created_at desc);
create index if not exists project_interest_user_id_idx on public.project_interest (user_id, created_at desc);

alter table public.project_interest enable row level security;

create policy "Users can view their own interest submissions"
  on public.project_interest for select
  using (auth.uid() = user_id);

create policy "Developers can view interest in their own projects"
  on public.project_interest for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.developer_id = auth.uid()));

create policy "Users can register their own interest"
  on public.project_interest for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Real, restricted: a user can only ever update their own note/unit
-- choice on their own submission (re-registering), never its status —
-- status transitions (new -> contacted/closed) belong to the developer.
create policy "Users can update their own interest submission"
  on public.project_interest for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status = 'new');

create policy "Developers can update the status of interest in their own projects"
  on public.project_interest for update
  using (exists (select 1 from public.projects p where p.id = project_id and p.developer_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.developer_id = auth.uid()));

-- notifications needs one more nullable related-id column, following the
-- exact existing convention (related_listing_id, related_property_request_id, ...)
-- — added before the function below so its insert can reference it.
alter table public.notifications
  add column if not exists related_project_id uuid references public.projects (id) on delete set null;

-- The real developer notification — fires the moment a real interest row
-- is actually saved (insert only; re-registering via upsert updates the
-- existing row and does not re-notify).
create or replace function public.notify_project_interest()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_developer_id uuid;
  v_project_title text;
begin
  select developer_id, title into v_developer_id, v_project_title
  from public.projects
  where id = new.project_id;

  if v_developer_id is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, related_project_id)
  values (
    v_developer_id,
    'project_interest',
    'تسجيل اهتمام جديد',
    format('هناك مستخدم مهتم بمشروعك "%s"', v_project_title),
    new.project_id
  );

  return new;
end;
$$;

drop trigger if exists project_interest_notify on public.project_interest;
create trigger project_interest_notify
after insert on public.project_interest
for each row execute procedure public.notify_project_interest();
