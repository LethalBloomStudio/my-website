alter table public.public_profiles
  add column if not exists social_x        text,
  add column if not exists social_snapchat text;
