-- Add column to track whether the user has an unacknowledged message policy violation.
-- When true, the messaging page shows a blocking modal until the user explicitly acknowledges it.
alter table public.accounts
  add column if not exists has_unacknowledged_violation boolean not null default false;
