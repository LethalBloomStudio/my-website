alter table public_profiles
  add column if not exists social_threads text,
  add column if not exists social_lemon8 text;
