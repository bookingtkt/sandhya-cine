-- Per-show online sales control (online | counter | noshow)
-- Run this in Supabase Dashboard → SQL Editor (existing projects already ran schema.sql).
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
alter table show_overrides enable row level security;
-- No public policies: reads/writes go through service-role API routes only.
