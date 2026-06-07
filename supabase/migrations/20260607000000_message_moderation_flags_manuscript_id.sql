alter table public.message_moderation_flags
  add column if not exists manuscript_id uuid references public.manuscripts(id) on delete set null;
