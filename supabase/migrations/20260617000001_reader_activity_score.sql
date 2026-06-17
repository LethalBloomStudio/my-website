-- Add activity_score column to accounts
alter table public.accounts
  add column if not exists activity_score numeric not null default 0;

-- ── compute_reader_activity_scores ────────────────────────────────────────────
-- Recalculates the activity_score for every user who has a beta_reader_level
-- set on their public profile. Scores are composed of four signals:
--
--   feedback_count  × 10   (number of line_feedback rows authored)
--   avg_word_count  × 0.5  (average word count of those feedback items)
--   chapters_read   × 5    (chapter_read_completions rows)
--   total_rewards   × 15   (sum of all reader_reward_counts)
--
-- The raw sum is multiplied by a recency multiplier (1.0 / 0.6 / 0.2 based on
-- last_active_at age) and a conduct penalty (−20 % per strike, floored at 0).
-- Result is rounded to 2 decimal places.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.compute_reader_activity_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.accounts a
  set activity_score = scores.final_score
  from (
    select
      a2.user_id,
      round(
        (
          coalesce(f.feedback_count, 0) * 10   +
          coalesce(f.avg_word_count,  0) * 0.5 +
          coalesce(r.chapters_read,   0) * 5   +
          coalesce(rw.total_rewards,  0) * 15
        )::numeric
        *
        case
          when a2.last_active_at >= now() - interval '30 days' then 1.0
          when a2.last_active_at >= now() - interval '60 days' then 0.6
          else 0.2
        end
        *
        greatest(0.0, 1.0 - a2.conduct_strikes * 0.2)
      , 2) as final_score
    from public.accounts a2
    inner join public.public_profiles pp
      on  pp.user_id = a2.user_id
      and pp.beta_reader_level is not null
    left join (
      select
        reader_id,
        count(*)::numeric            as feedback_count,
        coalesce(avg(word_count), 0) as avg_word_count
      from public.line_feedback
      group by reader_id
    ) f  on f.reader_id  = a2.user_id
    left join (
      select
        reader_id,
        count(*)::numeric as chapters_read
      from public.chapter_read_completions
      group by reader_id
    ) r  on r.reader_id  = a2.user_id
    left join (
      select
        reader_id,
        sum(count)::numeric as total_rewards
      from public.reader_reward_counts
      group by reader_id
    ) rw on rw.reader_id = a2.user_id
  ) scores
  where a.user_id = scores.user_id;
end;
$$;

-- Populate scores immediately on deploy
select public.compute_reader_activity_scores();

-- Schedule daily at 03:00 UTC (skip silently if pg_cron is not installed)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'compute-reader-activity-scores',
      '0 3 * * *',
      $$select public.compute_reader_activity_scores();$$
    );
  end if;
end $$;
