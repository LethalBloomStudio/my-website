-- ─── send_chapter_tip RPC ────────────────────────────────────────────────────
--
-- Single atomic transaction that completes the full tip flow:
--
--   1.  Auth + argument guard (amount must be 5 or 10)
--   2.  Resolve chapter → manuscript → author; block self-tips
--   3.  Pre-flight: reject if reader already used this reason on this chapter
--   4.  Deduct coins from reader (balance check in WHERE — no TOCTOU race)
--   5.  Credit coins to author
--   6.  INSERT into chapter_tips
--         → fires trg_update_author_tip_badges which updates:
--             author_tip_reason_counts  (increments count + stamps last_received_at)
--             author_tip_badges         (rebuilds top-3 rankings)
--   7.  Ledger entry for reader  (reason: 'chapter_tip_sent',     delta: -N)
--   8.  Ledger entry for author  (reason: 'chapter_tip_received', delta: +N)
--   9.  System notification to author
--
-- Return shape:
--   success  → { success: true,  coins_sent, reader_balance, author_id, tip_reason }
--   soft err → { success: false, reason: 'already_used_reason' | 'insufficient_balance' }
--   hard err → EXCEPTION (unauthenticated / bad amount / chapter not found / self-tip)
--
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.send_chapter_tip(
  p_chapter_id  UUID,
  p_reason      public.tip_reason,
  p_coin_amount INT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reader_id        uuid   := auth.uid();
  v_author_id        uuid;
  v_manuscript_id    uuid;
  v_chapter_title    text;
  v_manuscript_title text;
  v_reader_name      text;
  v_reader_balance   bigint;
  v_author_balance   bigint;
BEGIN

  -- ── 1. Auth ──────────────────────────────────────────────────────────────────
  IF v_reader_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ── 2. Validate coin amount ───────────────────────────────────────────────────
  IF p_coin_amount NOT IN (5, 10) THEN
    RAISE EXCEPTION 'coin_amount must be 5 or 10';
  END IF;

  -- ── 3. Resolve chapter → manuscript → author ─────────────────────────────────
  SELECT mc.manuscript_id, mc.title, m.title, m.owner_id
  INTO   v_manuscript_id, v_chapter_title, v_manuscript_title, v_author_id
  FROM   public.manuscript_chapters mc
  JOIN   public.manuscripts          m ON m.id = mc.manuscript_id
  WHERE  mc.id = p_chapter_id;

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Chapter not found';
  END IF;

  IF v_author_id = v_reader_id THEN
    RAISE EXCEPTION 'Cannot tip your own chapter';
  END IF;

  -- ── 4. Pre-flight duplicate check ────────────────────────────────────────────
  --   Catches the case before any coins move so the caller gets a clean soft error.
  --   The UNIQUE constraint on chapter_tips is still the hard guarantee; this is
  --   just a friendlier early-exit that avoids a mid-transaction exception.
  IF EXISTS (
    SELECT 1
    FROM   public.chapter_tips
    WHERE  reader_id  = v_reader_id
      AND  chapter_id = p_chapter_id
      AND  reason     = p_reason
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_used_reason');
  END IF;

  -- ── 5. Deduct from reader (balance check in WHERE — atomic, no separate read) ─
  UPDATE public.accounts
  SET    bloom_coins = bloom_coins - p_coin_amount,
         updated_at  = now()
  WHERE  user_id     = v_reader_id
    AND  bloom_coins >= p_coin_amount
  RETURNING bloom_coins INTO v_reader_balance;

  IF v_reader_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_balance');
  END IF;

  -- ── 6. Credit author ─────────────────────────────────────────────────────────
  UPDATE public.accounts
  SET    bloom_coins = bloom_coins + p_coin_amount,
         updated_at  = now()
  WHERE  user_id = v_author_id
  RETURNING bloom_coins INTO v_author_balance;

  IF v_author_balance IS NULL THEN
    -- Should never happen; raise aborts the transaction so coins are not lost.
    RAISE EXCEPTION 'Author account not found';
  END IF;

  -- ── 7. Record the tip ─────────────────────────────────────────────────────────
  --   This fires trg_update_author_tip_badges, which atomically:
  --     • upserts author_tip_reason_counts (count + last_received_at)
  --     • rewrites author_tip_badges (top-3 by count DESC, last_received_at DESC)
  --
  --   The UNIQUE constraint (reader_id, chapter_id, reason) is the backstop for
  --   any concurrent race that slipped past the pre-flight check above.  If it
  --   fires, the exception propagates and aborts the whole transaction cleanly —
  --   no partial coin movement is ever committed.
  INSERT INTO public.chapter_tips (chapter_id, reader_id, author_id, reason, coin_amount)
  VALUES (p_chapter_id, v_reader_id, v_author_id, p_reason, p_coin_amount);

  -- ── 8. Ledger: reader spent coins ────────────────────────────────────────────
  INSERT INTO public.bloom_coin_ledger (user_id, delta, reason, metadata)
  VALUES (
    v_reader_id,
    -p_coin_amount,
    'chapter_tip_sent',
    jsonb_build_object(
      'chapter_id',       p_chapter_id,
      'chapter_title',    v_chapter_title,
      'manuscript_id',    v_manuscript_id,
      'manuscript_title', v_manuscript_title,
      'author_id',        v_author_id,
      'tip_reason',       p_reason::text,
      'coins',            p_coin_amount
    )
  );

  -- ── 9. Ledger: author received coins ─────────────────────────────────────────
  INSERT INTO public.bloom_coin_ledger (user_id, delta, reason, metadata)
  VALUES (
    v_author_id,
    p_coin_amount,
    'chapter_tip_received',
    jsonb_build_object(
      'chapter_id',       p_chapter_id,
      'chapter_title',    v_chapter_title,
      'manuscript_id',    v_manuscript_id,
      'manuscript_title', v_manuscript_title,
      'reader_id',        v_reader_id,
      'tip_reason',       p_reason::text,
      'coins',            p_coin_amount
    )
  );

  -- ── 10. Resolve reader display name for notification ──────────────────────────
  --   Prefer pen_name → username → fallback
  SELECT COALESCE(NULLIF(TRIM(pen_name), ''), NULLIF(TRIM(username), ''), 'A reader')
  INTO   v_reader_name
  FROM   public.public_profiles
  WHERE  user_id = v_reader_id;

  v_reader_name := COALESCE(v_reader_name, 'A reader');

  -- ── 11. Notify author ─────────────────────────────────────────────────────────
  --   dedupe_key is scoped to (chapter, reader, reason) — the same combination
  --   that the unique constraint blocks — so duplicate notifications are impossible.
  INSERT INTO public.system_notifications (
    user_id,
    category,
    title,
    body,
    severity,
    metadata,
    dedupe_key
  )
  VALUES (
    v_author_id,
    'tip',
    v_reader_name || ' tipped you ' || p_coin_amount || ' Bloom Coins',
    '"' || p_reason::text || '" — '
      || COALESCE(v_chapter_title,    'a chapter')        || ' · '
      || COALESCE(v_manuscript_title, 'your manuscript'),
    'info',
    jsonb_build_object(
      'chapter_id',       p_chapter_id,
      'chapter_title',    v_chapter_title,
      'manuscript_id',    v_manuscript_id,
      'manuscript_title', v_manuscript_title,
      'reader_id',        v_reader_id,
      'reader_name',      v_reader_name,
      'tip_reason',       p_reason::text,
      'coins',            p_coin_amount
    ),
    'chapter-tip-' || p_chapter_id::text
      || '-' || v_reader_id::text
      || '-' || p_reason::text
  );

  -- ── 12. Return success ────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',        true,
    'coins_sent',     p_coin_amount,
    'reader_balance', v_reader_balance,
    'author_id',      v_author_id,
    'tip_reason',     p_reason::text
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.send_chapter_tip(UUID, public.tip_reason, INT) TO authenticated;
