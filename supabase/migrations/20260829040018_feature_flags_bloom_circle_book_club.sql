-- Feature flags for Bloom Circle / Book Club, wired into the admin
-- dashboard's existing "Feature Flags" tab (app/admin/page.tsx already has
-- the full toggle UI/loader/API wiring for a `feature_flags` table -- it
-- was just never actually connected to a real table or any flag rows).
--
-- `create table if not exists` / `on conflict do nothing` throughout so
-- this is safe to run whether or not the table already exists out-of-band
-- (the admin dashboard's own code implies it might, since other admin
-- support tables in this codebase were created directly via the SQL editor
-- rather than a tracked migration -- this migration is what actually
-- starts tracking it, going forward).
create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  is_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.feature_flags enable row level security;

-- Enabled/disabled state isn't sensitive -- any signed-in or anonymous
-- visitor can read it (the page components need this to decide whether to
-- show the feature at all, including to signed-out visitors hitting the
-- URL directly). Writes only ever go through the admin API route's
-- service-role client, which bypasses RLS entirely -- no client write
-- policy needed or wanted here.
drop policy if exists feature_flags_select_all on public.feature_flags;
create policy feature_flags_select_all
on public.feature_flags
for select
using (true);

-- Both start disabled, matching the current hidden-by-env-var state --
-- this migration doesn't change what's visible to anyone, it just moves
-- the on/off switch from a build-time env var to a database row the admin
-- dashboard can flip live.
insert into public.feature_flags (name, description, is_enabled) values
  ('bloom_circle', 'Adult-only Bloom Circle forum (6 discussion boards)', false),
  ('book_club', 'Monthly member-hosted Book Club (host signup, voting, discussion, weekly checkmarks)', false)
on conflict (name) do nothing;
