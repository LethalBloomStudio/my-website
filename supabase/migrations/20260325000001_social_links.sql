alter table public.public_profiles
  add column if not exists social_tiktok   text,
  add column if not exists social_facebook text,
  add column if not exists social_instagram text;
