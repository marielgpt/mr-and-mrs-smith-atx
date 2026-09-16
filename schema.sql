-- Wedding Day — shared run-of-show state.
-- One row, id = 'main', shared by everyone who has the day-of code.
-- Run this in the Supabase dashboard → SQL Editor.

create table if not exists public.wedding_state (
  id         text primary key default 'main',
  offsets    jsonb not null default '{}'::jsonb,
  checks     jsonb not null default '{}'::jsonb,
  notes      jsonb not null default '{}'::jsonb,
  hidden     jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Seed the single shared row (no-op if it already exists).
insert into public.wedding_state (id) values ('main')
  on conflict (id) do nothing;

-- Row Level Security: the link is the credential. Anyone with the anon key can
-- read and update the one 'main' row, but cannot touch anything else.
alter table public.wedding_state enable row level security;

drop policy if exists "read main"  on public.wedding_state;
drop policy if exists "write main" on public.wedding_state;

create policy "read main"  on public.wedding_state
  for select using (id = 'main');

create policy "write main" on public.wedding_state
  for update using (id = 'main') with check (id = 'main');

-- Realtime: broadcast row changes so every open device stays in sync.
alter publication supabase_realtime add table public.wedding_state;
