-- Doable cloud sync schema.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.

create table if not exists public.doable_records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,                 -- e.g. "task:abc123", "list:xyz", "settings", "stats"
  kind       text        not null,
  data       jsonb,                                -- the record itself (null when deleted)
  deleted    boolean     not null default false,   -- tombstone so deletes sync too
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists doable_records_user_updated on public.doable_records (user_id, updated_at);

-- Allowed record types (re-created so re-running this file picks up new types)
alter table public.doable_records drop constraint if exists doable_records_kind_check;
alter table public.doable_records add constraint doable_records_kind_check
  check (kind in ('task', 'list', 'settings', 'stats', 'practice', 'sadhana', 'person'));

-- The server owns the clock: every insert/update gets a fresh timestamp, so devices with
-- wrong clocks can't break ordering.
create or replace function public.doable_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists doable_records_touch on public.doable_records;
create trigger doable_records_touch
  before insert or update on public.doable_records
  for each row execute function public.doable_touch();

-- Row level security: each signed-in user can only see and change their own rows.
alter table public.doable_records enable row level security;

drop policy if exists "doable: own rows" on public.doable_records;
create policy "doable: own rows" on public.doable_records
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Live updates: devices get changes pushed over websockets within about a second.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'doable_records'
  ) then
    alter publication supabase_realtime add table public.doable_records;
  end if;
end $$;
