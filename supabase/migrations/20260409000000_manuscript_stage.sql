alter table public.manuscripts
  add column if not exists stage text check (stage in ('alpha', 'beta')) default 'beta';
