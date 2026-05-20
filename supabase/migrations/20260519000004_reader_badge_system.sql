-- Badge system: tracks how many times each reader has received each of the
-- 6 author reward types, and maintains a single "active badge" row per reader
-- pointing to whichever type they've received the most.
--
-- Tables
--   reader_reward_counts  — (reader_id, reward_type) → count
--   reader_badges         — (reader_id) → active_badge, badge_count, updated_at
--
-- Data flow
--   AFTER INSERT on bloom_coin_ledger (reason = 'author_reward')
--   → update_reader_badge() increments the count row, then recalculates
--     which type is highest and upserts reader_badges.
--
-- Tie-breaking: when two types share the highest count the enum order wins
-- (first-defined type takes precedence), giving a stable, deterministic result.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Enum — values must match REWARD_REASONS in
--    app/manuscripts/[id]/details/page.tsx exactly (sentence-case).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TYPE public.reader_reward_type AS ENUM (
  'Amazing feedback',
  'Very detailed feedback',
  'Incredibly helpful notes',
  'Caught critical errors',
  'Exceptional line edits',
  'Above and beyond effort'
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. reader_reward_counts
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.reader_reward_counts (
  reader_id   uuid                     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_type public.reader_reward_type NOT NULL,
  count       integer                  NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (reader_id, reward_type)
);

ALTER TABLE public.reader_reward_counts ENABLE ROW LEVEL SECURITY;

-- Publicly readable — badges appear on profiles.
-- All writes are handled by the trigger (SECURITY DEFINER); no user-facing policies needed.
CREATE POLICY "reader_reward_counts_select"
  ON public.reader_reward_counts
  FOR SELECT
  USING (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. reader_badges
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.reader_badges (
  reader_id    uuid                     NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_badge public.reader_reward_type NOT NULL,
  badge_count  integer                  NOT NULL DEFAULT 0,
  updated_at   timestamptz              NOT NULL DEFAULT now()
);

ALTER TABLE public.reader_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reader_badges_select"
  ON public.reader_badges
  FOR SELECT
  USING (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Trigger function
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
  -- Only act on author_reward ledger entries
  IF NEW.reason <> 'author_reward' THEN
    RETURN NEW;
  END IF;

  -- Cast the stored text to the enum; bail silently for unknown/missing values
  BEGIN
    v_reward_type := (NEW.metadata->>'reward_reason')::public.reader_reward_type;
  EXCEPTION WHEN invalid_text_representation OR case_not_found THEN
    RETURN NEW;
  END;

  IF v_reward_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Increment (or create) the count row for this reader + reward type
  INSERT INTO public.reader_reward_counts (reader_id, reward_type, count)
  VALUES (NEW.user_id, v_reward_type, 1)
  ON CONFLICT (reader_id, reward_type)
  DO UPDATE SET count = public.reader_reward_counts.count + 1;

  -- Find the reward type with the highest count for this reader.
  -- Ties broken by enum order (ORDER BY reward_type ASC uses enum sort order).
  SELECT reward_type, count
  INTO   v_best_type, v_best_count
  FROM   public.reader_reward_counts
  WHERE  reader_id = NEW.user_id
  ORDER  BY count DESC, reward_type ASC
  LIMIT  1;

  -- Upsert the active badge row
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

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Attach trigger to bloom_coin_ledger
-- ────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_update_reader_badge
  AFTER INSERT ON public.bloom_coin_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reader_badge();

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Backfill: aggregate all existing author_reward ledger rows
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.reader_reward_counts (reader_id, reward_type, count)
SELECT
  user_id,
  (metadata->>'reward_reason')::public.reader_reward_type AS reward_type,
  COUNT(*)::integer AS count
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
ON CONFLICT (reader_id, reward_type)
DO UPDATE SET count = EXCLUDED.count;

-- Backfill reader_badges from the counts just populated.
-- DISTINCT ON (reader_id) with ORDER BY count DESC picks the winning type per reader.
INSERT INTO public.reader_badges (reader_id, active_badge, badge_count, updated_at)
SELECT DISTINCT ON (reader_id)
  reader_id,
  reward_type  AS active_badge,
  count        AS badge_count,
  now()        AS updated_at
FROM public.reader_reward_counts
ORDER BY reader_id, count DESC, reward_type ASC
ON CONFLICT (reader_id)
DO UPDATE SET
  active_badge = EXCLUDED.active_badge,
  badge_count  = EXCLUDED.badge_count,
  updated_at   = EXCLUDED.updated_at;
