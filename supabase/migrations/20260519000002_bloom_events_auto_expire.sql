-- Auto-expire Bloom Events when end_date passes.
--
-- Two mechanisms (belt-and-suspenders):
--   1. deactivate_expired_bloom_events() — a dedicated cleanup function.
--   2. award_chapter_coins calls it on every invocation (lazy cleanup).
--   3. pg_cron daily job at 02:00 UTC (silently skipped if extension is absent).

CREATE OR REPLACE FUNCTION public.deactivate_expired_bloom_events()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE bloom_events
  SET    status = 'inactive'
  WHERE  status = 'active'
    AND  end_date < CURRENT_DATE;
$$;

-- Rebuild award_chapter_coins to call the cleanup before checking for an active event.
-- All other behaviour (idempotency, grant check, wallet update, event bonus) is unchanged.
CREATE OR REPLACE FUNCTION public.award_chapter_coins(
  p_chapter_id    uuid,
  p_manuscript_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reader_id   uuid := auth.uid();
  v_coins       int  := 5;
  v_new_balance bigint;
  v_event_id    uuid := null;
  v_event_cats  text[];
  v_ms_cats     text[];
BEGIN
  IF v_reader_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lazy cleanup: mark any past-end-date events inactive before checking for a bonus
  PERFORM public.deactivate_expired_bloom_events();

  -- Already completed this chapter — return gracefully (idempotency guard unchanged)
  IF EXISTS (
    SELECT 1 FROM chapter_read_completions
    WHERE chapter_id = p_chapter_id AND reader_id = v_reader_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_completed');
  END IF;

  -- Must hold an access grant (beta reader) — owners do not earn coins
  IF NOT EXISTS (
    SELECT 1 FROM manuscript_access_grants
    WHERE manuscript_id = p_manuscript_id AND reader_id = v_reader_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_grant');
  END IF;

  -- Check for an active Bloom Event that is currently within its date window
  SELECT id, categories
  INTO v_event_id, v_event_cats
  FROM bloom_events
  WHERE status = 'active'
    AND start_date <= CURRENT_DATE
    AND end_date   >= CURRENT_DATE
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_event_id IS NOT NULL THEN
    SELECT categories INTO v_ms_cats
    FROM manuscripts
    WHERE id = p_manuscript_id;

    IF v_ms_cats IS NOT NULL AND v_ms_cats && v_event_cats THEN
      v_coins := 10;
    ELSE
      v_event_id := null;
    END IF;
  END IF;

  INSERT INTO chapter_read_completions(chapter_id, manuscript_id, reader_id, coins_awarded)
  VALUES (p_chapter_id, p_manuscript_id, v_reader_id, v_coins);

  UPDATE public.accounts
  SET bloom_coins = bloom_coins + v_coins,
      updated_at  = now()
  WHERE user_id = v_reader_id
  RETURNING bloom_coins INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  INSERT INTO public.bloom_coin_ledger(user_id, delta, reason, metadata, event_id)
  VALUES (
    v_reader_id,
    v_coins,
    'chapter_feedback_reward',
    jsonb_build_object(
      'chapter_id',    p_chapter_id,
      'manuscript_id', p_manuscript_id,
      'coins',         v_coins
    ),
    v_event_id
  );

  RETURN jsonb_build_object(
    'success',       true,
    'coins_awarded', v_coins,
    'new_balance',   v_new_balance
  );
END;
$$;

-- Schedule a daily cleanup at 02:00 UTC via pg_cron.
-- Silently skipped if the pg_cron extension is not enabled on this project.
DO $$
BEGIN
  PERFORM cron.schedule(
    'deactivate-expired-bloom-events',
    '0 2 * * *',
    'SELECT public.deactivate_expired_bloom_events()'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
