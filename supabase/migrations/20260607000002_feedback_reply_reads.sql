-- Enable realtime for feedback tables so postgres_changes subscriptions fire.
alter publication supabase_realtime add table public.line_feedback;
alter publication supabase_realtime add table public.line_feedback_replies;

-- Persistent per-user read tracking for feedback replies.
-- One row per (user_id, reply_id) pair; upsert-safe via the unique constraint.
create table if not exists public.feedback_reply_reads (
  id       uuid        primary key default gen_random_uuid(),
  user_id  uuid        not null references auth.users(id) on delete cascade,
  reply_id uuid        not null references public.line_feedback_replies(id) on delete cascade,
  read_at  timestamptz not null default now(),
  unique (user_id, reply_id)
);

alter table public.feedback_reply_reads enable row level security;

create policy "feedback_reply_reads_select_own"
on public.feedback_reply_reads for select
using (auth.uid() = user_id);

create policy "feedback_reply_reads_insert_own"
on public.feedback_reply_reads for insert
with check (auth.uid() = user_id);

create policy "feedback_reply_reads_delete_own"
on public.feedback_reply_reads for delete
using (auth.uid() = user_id);

-- Add to realtime so the author workspace receives a live signal when the reader
-- marks replies read (clears the unread indicator without a page reload).
alter publication supabase_realtime add table public.feedback_reply_reads;
