-- Persist notification read keys in DB so mark-as-read survives across devices/browsers
alter table public.accounts
  add column if not exists notification_read_keys jsonb not null default '[]'::jsonb;
