-- Store the Bloom Event title in the ledger metadata at write-time so the
-- transaction log can display the actual event name rather than a generic label.
-- Also declares v_event_title and nulls it alongside v_event_id when categories
-- do not match, so non-bonus entries never carry a stale title.

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
  v_reader_id    uuid := auth.uid();
  v_coins        int  := 5;
  v_new_balance  bigint;
  v_event_id     uuid := null;
  v_event_title  text := null;
  v_event_cats   text[];
  v_ms_cats      text[];
BEGIN
  IF v_reader_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.deactivate_expired_bloom_events();

  IF EXISTS (
    SELECT 1 FROM chapter_read_completions
    WHERE chapter_id = p_chapter_id AND reader_id = v_reader_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_completed');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM manuscript_access_grants
    WHERE manuscript_id = p_manuscript_id AND reader_id = v_reader_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_grant');
  END IF;

  SELECT id, title, categories
  INTO v_event_id, v_event_title, v_event_cats
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
      v_event_id    := null;
      v_event_title := null;
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
      'coins',         v_coins,
      'event_title',   v_event_title
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
