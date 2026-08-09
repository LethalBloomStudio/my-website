-- ─── reorder_manuscript_chapters RPC ────────────────────────────────────────
--
-- Atomically applies a batch of chapter_order/title updates for one
-- manuscript's chapter list (used by the sidebar drag-and-drop reorder UI).
--
-- Replaces the previous client-side approach of firing N independent
-- `.update()` calls in parallel via Promise.all: if one of those N requests
-- failed while the others succeeded, the manuscript was left with a
-- partially-renumbered chapter order and no way to roll back the writes that
-- had already landed. Doing all N updates inside one plpgsql function makes
-- them a single transaction — if any row fails to match, the whole batch is
-- rolled back and nothing is written.
--
-- p_updates shape: [{ "id": uuid, "chapter_order": int, "title": text }, ...]
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reorder_manuscript_chapters(
  p_manuscript_id UUID,
  p_updates       JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_owner_id  uuid;
  v_expected  int;
  v_matched   int;
  v_row       jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT owner_id INTO v_owner_id
  FROM public.manuscripts
  WHERE id = p_manuscript_id;

  IF v_owner_id IS NULL OR v_owner_id <> v_uid THEN
    RAISE EXCEPTION 'Not authorized to reorder chapters for this manuscript';
  END IF;

  v_expected := jsonb_array_length(p_updates);
  IF v_expected IS NULL OR v_expected = 0 THEN
    RETURN jsonb_build_object('success', true, 'updated', 0);
  END IF;

  -- Every id in the batch must already belong to this manuscript - guards
  -- against a stale client payload touching the wrong manuscript, or a
  -- chapter that was deleted elsewhere in the middle of a drag.
  SELECT count(*) INTO v_matched
  FROM public.manuscript_chapters c
  WHERE c.manuscript_id = p_manuscript_id
    AND c.id IN (
      SELECT (u->>'id')::uuid FROM jsonb_array_elements(p_updates) u
    );

  IF v_matched <> v_expected THEN
    RAISE EXCEPTION 'Chapter set does not match manuscript %', p_manuscript_id;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE public.manuscript_chapters
    SET chapter_order = (v_row->>'chapter_order')::int,
        title         = COALESCE(v_row->>'title', title)
    WHERE id = (v_row->>'id')::uuid
      AND manuscript_id = p_manuscript_id;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated', v_expected);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_manuscript_chapters(UUID, JSONB) TO authenticated;
