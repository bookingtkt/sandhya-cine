-- Ambadi 2k Cinemas — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor → New query → Paste → Run.

-- 1) Settings (single row, id=1)
create table if not exists settings (
  id int primary key,
  theatre_name text not null default 'Ambadi 2k Cinemas',
  address text default '',
  phone text default '',
  email text default '',
  ticket_price numeric not null default 85,
  gst_percent numeric not null default 0,
  convenience_fee numeric not null default 0
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- 2) Movies (replaces Shows sheet; timings stored as array)
create table if not exists movies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  poster_url text default '',
  description text default '',
  start_date date not null,
  end_date date not null,
  timings text[] not null default '{}',
  status text not null default 'Active',
  quality text not null default '4K',
  created_at timestamptz default now()
);

-- 3) Bookings (replaces Bookings sheet)
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text unique not null,
  show_date date not null,
  movie_id uuid references movies(id) on delete set null,
  show_time text not null,
  customer_name text not null,
  phone text not null,
  email text not null,
  seats text[] not null default '{}',
  ticket_amount numeric not null default 0,
  gst_amount numeric not null default 0,
  convenience_amount numeric not null default 0,
  total_amount numeric not null default 0,
  status text not null default 'Confirmed',
  ticket_status text not null default 'Unused',
  verified_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists bookings_lookup_idx on bookings (show_date, movie_id, show_time, status);

-- 3b) Show overrides (per-show online sales control: online | counter | noshow)
create table if not exists show_overrides (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid references movies(id) on delete cascade,
  show_date date not null,
  show_time text not null,
  mode text not null default 'online' check (mode in ('online', 'counter', 'noshow')),
  note text default '',
  updated_at timestamptz default now(),
  unique (movie_id, show_date, show_time)
);
create index if not exists show_overrides_lookup_idx on show_overrides (show_date, movie_id);

-- 4) Storage bucket for posters (create via Dashboard → Storage → New bucket "posters", public ON)
-- SQL fallback:
insert into storage.buckets (id, name, public) values ('posters','posters', true)
on conflict (id) do nothing;

-- 5) Row Level Security
alter table settings enable row level security;
alter table movies enable row level security;
alter table bookings enable row level security;
alter table show_overrides enable row level security;

-- Public read for customer booking flow
drop policy if exists "public read settings" on settings;
create policy "public read settings" on settings for select using (true);
drop policy if exists "public read movies" on movies;
create policy "public read movies" on movies for select using (true);

-- Writes go through service-role API routes, so no public insert/update policies.
-- Admin dashboard reads bookings via service-role API too (see /api routes), so keep RLS locked:

-- 6) Storage policies for posters bucket
drop policy if exists "public read posters" on storage.objects;
create policy "public read posters" on storage.objects for select using (bucket_id = 'posters');
-- Uploads happen from admin UI via anon client, so allow authenticated inserts:
drop policy if exists "auth upload posters" on storage.objects;
create policy "auth upload posters" on storage.objects for insert to authenticated with check (bucket_id = 'posters');
drop policy if exists "auth update posters" on storage.objects;
create policy "auth update posters" on storage.objects for update to authenticated using (bucket_id = 'posters');
