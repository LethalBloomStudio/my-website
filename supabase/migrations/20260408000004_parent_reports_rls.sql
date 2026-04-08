-- Enable RLS on public.parent_reports.
-- All reads and writes go through the service-role admin client (API routes),
-- which bypasses RLS. No user-facing policies are needed.
alter table public.parent_reports enable row level security;
