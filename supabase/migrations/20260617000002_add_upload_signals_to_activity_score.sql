-- Add two new author signals to compute_reader_activity_scores():
--
--   manuscripts_uploaded × 8   (COUNT of manuscripts where owner_id = user)
--   chapters_uploaded    × 2   (COUNT of manuscript_chapters joined through manuscripts.owner_id)
--
-- Chapters lack a direct owner column so author identity is resolved via JOIN.
-- The cron schedule from 20260617000001 already calls this function by name —
-- no re-scheduling needed.

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
          coalesce(f.feedback_count,       0) * 10  +
          coalesce(f.avg_word_count,       0) * 0.5 +
          coalesce(r.chapters_read,        0) * 5   +
          coalesce(rw.total_rewards,       0) * 15  +
          coalesce(mu.manuscripts_uploaded,0) * 8   +
          coalesce(cu.chapters_uploaded,   0) * 2
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
    left join (
      select
        owner_id,
        count(*)::numeric as manuscripts_uploaded
      from public.manuscripts
      group by owner_id
    ) mu on mu.owner_id  = a2.user_id
    left join (
      select
        m.owner_id,
        count(*)::numeric as chapters_uploaded
      from public.manuscript_chapters mc
      join public.manuscripts m on m.id = mc.manuscript_id
      group by m.owner_id
    ) cu on cu.owner_id  = a2.user_id
  ) scores
  where a.user_id = scores.user_id;
end;
$$;

-- Recompute immediately so scores reflect the new signals without waiting for cron
select public.compute_reader_activity_scores();
