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
do $$ begin
  alter publication supabase_realtime add table public.wedding_state;
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Guest photos + videos for the weekend (/photos/). The gallery groups uploads by
-- the day they were taken (taken_at): Oct 15 BBQ, Oct 16 party, Oct 17 wedding. Run this block once as well (safe to re-run).
-- Files live in the public `guest-photos` bucket; one row per upload in
-- guest_photos drives the gallery. Guests can only add. Deleting goes through
-- delete_guest_photo(): the uploader's own device token, or the admin code.
--
-- AFTER running, set the admin code in the SQL editor (never commit it — this
-- repo is public):   update public.guest_photo_admin set code = 'your-secret';

-- 50 MB per file: the Supabase free-plan ceiling. On Pro, raise this (and
-- MAX_BYTES in photos/photos.js) for longer videos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('guest-photos', 'guest-photos', true, 52428800,
    array['image/jpeg', 'image/png', 'image/webp',
          'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.guest_photos (
  id          bigint generated always as identity primary key,
  path        text not null,
  thumb_path  text not null default '',
  kind        text not null default 'photo',
  taken_at    timestamptz,
  uploader    text not null default '',
  width       int,
  height      int,
  owner_hash  text not null default '',
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.guest_photos add column if not exists kind        text not null default 'photo';
alter table public.guest_photos add column if not exists taken_at    timestamptz;
alter table public.guest_photos add column if not exists owner_hash  text not null default '';
alter table public.guest_photos add column if not exists deleted_at  timestamptz;
alter table public.guest_photos alter column thumb_path set default '';
create unique index if not exists guest_photos_path_key on public.guest_photos (path);

alter table public.guest_photos enable row level security;

drop policy if exists "read photos" on public.guest_photos;
drop policy if exists "add photos"  on public.guest_photos;

create policy "read photos" on public.guest_photos for select using (true);
create policy "add photos"  on public.guest_photos for insert
  with check (deleted_at is null and kind in ('photo', 'video')
    and length(path) < 200 and length(thumb_path) < 200 and length(uploader) <= 60 and length(owner_hash) <= 64);

-- owner_hash is sha256(device token): safe to be readable, useless without the token.
revoke update, delete on public.guest_photos from anon, authenticated;
grant select, insert on public.guest_photos to anon, authenticated;

-- Admin code lives in a table anon can't read.
create table if not exists public.guest_photo_admin (code text);
insert into public.guest_photo_admin (code) select null where not exists (select 1 from public.guest_photo_admin);
alter table public.guest_photo_admin enable row level security;
revoke all on public.guest_photo_admin from anon, authenticated;

-- Marks an upload deleted (hides it from the gallery) if the caller holds its
-- owner token or the admin code. Returns true on success.
create or replace function public.delete_guest_photo(photo_id bigint, secret text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if secret is null or length(secret) < 4 then return false; end if;
  update guest_photos set deleted_at = now()
   where id = photo_id and deleted_at is null
     and (owner_hash = encode(sha256(convert_to(secret, 'UTF8')), 'hex') or exists (select 1 from guest_photo_admin a where a.code is not null and a.code = secret));
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.delete_guest_photo(bigint, text) from public;
grant execute on function public.delete_guest_photo(bigint, text) to anon, authenticated;

-- Admin-code check for the gallery's admin mode.
create or replace function public.check_photo_admin(secret text)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from guest_photo_admin where code is not null and length(secret) >= 4 and code = secret);
$$;
revoke all on function public.check_photo_admin(text) from public;
grant execute on function public.check_photo_admin(text) to anon, authenticated;

-- Storage: anyone can upload into the bucket; a file can only be removed once
-- its row has been marked deleted by delete_guest_photo() and no live row
-- still points at it.
drop policy if exists "guest photo upload" on storage.objects;
drop policy if exists "guest photo read"   on storage.objects;
drop policy if exists "guest photo remove" on storage.objects;
create policy "guest photo upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'guest-photos');
create policy "guest photo read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'guest-photos');
create policy "guest photo remove" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'guest-photos' and exists (
    select 1 from public.guest_photos g
     where g.deleted_at is not null and (g.path = storage.objects.name or g.thumb_path = storage.objects.name))
    and not exists (
    select 1 from public.guest_photos g
     where g.deleted_at is null and (g.path = storage.objects.name or g.thumb_path = storage.objects.name)));

do $$ begin
  alter publication supabase_realtime add table public.guest_photos;
exception when duplicate_object then null; end $$;
