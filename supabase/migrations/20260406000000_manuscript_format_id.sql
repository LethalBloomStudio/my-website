-- Add format_id column to manuscripts so readers see the author's chosen format
alter table manuscripts
  add column if not exists format_id text default 'minimal';
