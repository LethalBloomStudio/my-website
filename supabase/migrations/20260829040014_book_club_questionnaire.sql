-- Book Club Phase 4: host questionnaire (custom or preset-library
-- questions, released progressively one per week).
--
-- book_club_question_presets is a small, admin/migration-seeded starter
-- library, expected to grow over time (same "admin-managed only" shape as
-- bloom_circle_topics -- no write policy for regular users at all).
create table public.book_club_question_presets (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  category text,
  created_at timestamptz not null default now()
);

alter table public.book_club_question_presets enable row level security;

create policy book_club_question_presets_select_adult
on public.book_club_question_presets
for select
using (public.bloom_circle_is_adult());

insert into public.book_club_question_presets (prompt, category) values
  ('What surprised you most in this section?', 'general'),
  ('Which character''s decisions did you agree or disagree with, and why?', 'character'),
  ('Did this section change how you feel about any character?', 'character'),
  ('What theme or idea from this section has stuck with you?', 'theme'),
  ('Is there a line or passage you want to talk about? Share it and why it stood out.', 'craft'),
  ('What do you think will happen next?', 'general'),
  ('Did anything in this section remind you of your own life or another book?', 'general'),
  ('What would you have done differently in the main character''s position?', 'character'),
  ('How is the setting shaping the story so far?', 'craft'),
  ('What questions do you still have after reading this section?', 'general')
on conflict do nothing;

-- No visible/published column -- progressive weekly unlock is computed at
-- query time from the cycle's cycle_starts_at (RLS below), not stored, so
-- there's nothing to keep in sync if the cycle's timing ever shifts.
create table public.book_club_questionnaire_questions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  week_number integer not null check (week_number between 1 and 5),
  prompt text not null,
  source text not null check (source in ('custom', 'preset')),
  preset_id uuid references public.book_club_question_presets(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (cycle_id, week_number)
);

alter table public.book_club_questionnaire_questions enable row level security;

-- Participants see a week's question once that week has started; the
-- "or created_by = auth.uid()" clause lets the host author/preview future
-- weeks early without exposing them to everyone else. Both sides are
-- vacuously false (not visible) while cycle_starts_at is still null, i.e.
-- before the cycle goes active -- exactly the intended behavior.
create policy book_club_questionnaire_questions_select
on public.book_club_questionnaire_questions
for select
using (
  public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and (
    created_by = auth.uid()
    or exists (
      select 1 from public.book_club_cycles c
      where c.id = cycle_id
        and c.cycle_starts_at is not null
        and now() >= c.cycle_starts_at + ((week_number - 1) * interval '7 days')
    )
  )
);

-- Only the cycle's host can author/edit its questions. This queries a
-- *different* table (book_club_cycles), so no self-reference recursion risk
-- -- no SECURITY DEFINER wrapper needed, same reasoning as
-- book_club_is_participant().
create policy book_club_questionnaire_questions_insert_host
on public.book_club_questionnaire_questions
for insert
with check (
  created_by = auth.uid()
  and public.bloom_circle_is_adult()
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.host_user_id = auth.uid()
  )
);

-- No lock, ever -- host can revise a week's question until it's unlocked
-- (and after, if they choose; nothing in the spec requires freezing it).
create policy book_club_questionnaire_questions_update_host
on public.book_club_questionnaire_questions
for update
using (
  created_by = auth.uid()
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.host_user_id = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.host_user_id = auth.uid()
  )
);
