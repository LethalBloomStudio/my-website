-- Update tie-breaking for reader_badges: when two reward types share the
-- highest count, the one most recently received wins.
--
-- Changes:
--   1. Add last_received_at to reader_reward_counts (set on every insert).
--   2. Backfill last_received_at from the existing ledger.
--   3. Replace update_reader_badge() with recency-aware ORDER BY.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add last_received_at
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.reader_reward_counts
  ADD COLUMN last_received_at timestamptz NOT NULL DEFAULT now();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Backfill last_received_at from bloom_coin_ledger
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.reader_reward_counts rc
SET last_received_at = sub.last_at
FROM (
  SELECT
    user_id,
    (metadata->>'reward_reason')::public.reader_reward_type AS reward_type,
    MAX(created_at) AS last_at
  FROM public.bloom_coin_ledger
  WHERE reason = 'author_reward'
    AND (metadata->>'reward_reason') IN (
      'Amazing feedback',
      'Very detailed feedback',
      'Incredibly helpful notes',
      'Caught critical errors',
      'Exceptional line edits',
      'Above and beyond effort'
    )
  GROUP BY user_id, (metadata->>'reward_reason')::public.reader_reward_type
) sub
WHERE rc.reader_id   = sub.user_id
  AND rc.reward_type = sub.reward_type;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Replace trigger function with recency-aware tie-breaking
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_reader_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward_type public.reader_reward_type;
  v_best_type   public.reader_reward_type;
  v_best_count  integer;
BEGIN
  IF NEW.reason <> 'author_reward' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_reward_type := (NEW.metadata->>'reward_reason')::public.reader_reward_type;
  EXCEPTION WHEN invalid_text_representation OR case_not_found THEN
    RETURN NEW;
  END;

  IF v_reward_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Increment count and stamp last_received_at
  INSERT INTO public.reader_reward_counts (reader_id, reward_type, count, last_received_at)
  VALUES (NEW.user_id, v_reward_type, 1, now())
  ON CONFLICT (reader_id, reward_type)
  DO UPDATE SET
    count            = public.reader_reward_counts.count + 1,
    last_received_at = now();

  -- Highest count wins; ties go to the most recently received type
  SELECT reward_type, count
  INTO   v_best_type, v_best_count
  FROM   public.reader_reward_counts
  WHERE  reader_id = NEW.user_id
  ORDER  BY count DESC, last_received_at DESC
  LIMIT  1;

  INSERT INTO public.reader_badges (reader_id, active_badge, badge_count, updated_at)
  VALUES (NEW.user_id, v_best_type, v_best_count, now())
  ON CONFLICT (reader_id)
  DO UPDATE SET
    active_badge = EXCLUDED.active_badge,
    badge_count  = EXCLUDED.badge_count,
    updated_at   = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;
