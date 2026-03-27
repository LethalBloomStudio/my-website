create table if not exists featured_manuscripts (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references manuscripts(id) on delete cascade,
  owner_id uuid not null,
  audience text not null check (audience in ('adult', 'youth')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists featured_manuscripts_audience_expires_idx
  on featured_manuscripts (audience, expires_at);

create index if not exists featured_manuscripts_owner_idx
  on featured_manuscripts (owner_id, audience, expires_at);

alter table featured_manuscripts enable row level security;

create policy "Public read active featured slots"
  on featured_manuscripts for select
  using (expires_at > now());

create policy "Authenticated users can insert featured slots"
  on featured_manuscripts for insert
  to authenticated
  with check (auth.uid() = owner_id);
