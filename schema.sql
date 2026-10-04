-- Wedding Day — shared run-of-show state.
-- One row, id = 'main', shared by everyone who has the day-of code.
-- Run this in the Supabase dashboard → SQL Editor.

create table if not exists public.wedding_state (
  id         text primary key default 'main',
  offsets    jsonb not null default '{}'::jsonb,
  checks     jsonb not null default '{}'::jsonb,
  notes      jsonb not null default '{}'::jsonb,
  hidden     jsonb not null default '{}'::jsonb,
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

-- Base privileges: the publishable/anon key connects as the `anon` role, which
-- needs table-level GRANTs before RLS is even evaluated (otherwise: 42501).
grant usage on schema public to anon, authenticated;
grant select, update on public.wedding_state to anon, authenticated;

-- Realtime: broadcast row changes so every open device stays in sync.
alter publication supabase_realtime add table public.wedding_state;

-- ─────────────────────────────────────────────────────────────────────────────
-- Guest photos (/photos/). Run this block once as well.
-- Files live in the public `guest-photos` bucket (full + thumb); one row per
-- photo in guest_photos drives the gallery. Guests can add, never edit/delete —
-- remove anything from the Supabase dashboard (Storage + Table editor).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('guest-photos', 'guest-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "guest photo upload" on storage.objects;
create policy "guest photo upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'guest-photos');

create table if not exists public.guest_photos (
  id         bigint generated always as identity primary key,
  path       text not null,
  thumb_path text not null,
  uploader   text not null default '',
  width      int,
  height     int,
  created_at timestamptz not null default now()
);

alter table public.guest_photos enable row level security;

drop policy if exists "read photos" on public.guest_photos;
drop policy if exists "add photos"  on public.guest_photos;

create policy "read photos" on public.guest_photos for select using (true);
create policy "add photos"  on public.guest_photos for insert
  with check (length(path) < 200 and length(thumb_path) < 200 and length(uploader) <= 60);

grant select, insert on public.guest_photos to anon, authenticated;

alter publication supabase_realtime add table public.guest_photos;
