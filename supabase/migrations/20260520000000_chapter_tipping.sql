-- ─── Chapter Tipping System ───────────────────────────────────────────────────
-- Three tables:
--
--   chapter_tips              — one row per tip transaction
--   author_tip_reason_counts  — running tally (author × reason) for the badge engine
--   author_tip_badges         — author's current top-3 badges, trigger-maintained
--
-- Coin deduction + tip insertion will be atomic inside a SECURITY DEFINER RPC
-- (send_chapter_tip) added when the UI layer is built.  Only SELECT policies
-- are wired here; no direct INSERT policy is granted to avoid partial writes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  Enum
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.tip_reason AS ENUM (
    'Beautifully Written',
    'Couldn''t Put It Down',
    'Masterful Storytelling',
    'Emotionally Devastating',
    'Left Me Speechless',
    'Obsessed With This Story',
    'Obsessed With FMC',
    'Obsessed With the MMC',
    'This Chapter Broke Me',
    'I Need More Immediately'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  chapter_tips
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chapter_tips (
  id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id  UUID              NOT NULL REFERENCES public.manuscript_chapters(id) ON DELETE CASCADE,
  reader_id   UUID              NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id   UUID              NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      public.tip_reason NOT NULL,
  coin_amount INT               NOT NULL CHECK (coin_amount IN (5, 10)),
  created_at  TIMESTAMPTZ       NOT NULL DEFAULT now(),

  -- A reader cannot tip the same chapter with the same reason twice.
  CONSTRAINT chapter_tips_reader_chapter_reason_uniq
    UNIQUE (reader_id, chapter_id, reason)
);

-- Support "load all tips on chapter X" and "load all tips author Y received"
CREATE INDEX IF NOT EXISTS chapter_tips_chapter_id_idx
  ON public.chapter_tips (chapter_id);

CREATE INDEX IF NOT EXISTS chapter_tips_author_id_idx
  ON public.chapter_tips (author_id);

ALTER TABLE public.chapter_tips ENABLE ROW LEVEL SECURITY;

-- Readers see their own sent tips
DROP POLICY IF EXISTS "chapter_tips_select_reader" ON public.chapter_tips;
CREATE POLICY "chapter_tips_select_reader"
  ON public.chapter_tips FOR SELECT
  USING ((SELECT auth.uid()) = reader_id);

-- Authors see tips they received
DROP POLICY IF EXISTS "chapter_tips_select_author" ON public.chapter_tips;
CREATE POLICY "chapter_tips_select_author"
  ON public.chapter_tips FOR SELECT
  USING ((SELECT auth.uid()) = author_id);

-- Admins see everything
DROP POLICY IF EXISTS "chapter_tips_admin_select" ON public.chapter_tips;
CREATE POLICY "chapter_tips_admin_select"
  ON public.chapter_tips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE user_id = (SELECT auth.uid()) AND is_admin = true
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  author_tip_reason_counts
--     One row per (author, reason).  count never decrements.
--     last_received_at is used as the tie-breaker when two reasons share the
--     highest count.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.author_tip_reason_counts (
  author_id        UUID              NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason           public.tip_reason NOT NULL,
  count            INT               NOT NULL DEFAULT 0 CHECK (count >= 0),
  last_received_at TIMESTAMPTZ       NOT NULL DEFAULT now(),
  PRIMARY KEY (author_id, reason)
);

ALTER TABLE public.author_tip_reason_counts ENABLE ROW LEVEL SECURITY;

-- Publicly readable — counts will appear on author profile pages
DROP POLICY IF EXISTS "author_tip_reason_counts_select" ON public.author_tip_reason_counts;
CREATE POLICY "author_tip_reason_counts_select"
  ON public.author_tip_reason_counts FOR SELECT
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  author_tip_badges
--     Denormalised top-3 rows per author.  rank 1 = most-tipped reason.
--     Rebuilt atomically by the trigger on every chapter_tips INSERT.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.author_tip_badges (
  author_id  UUID              NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rank       INT               NOT NULL CHECK (rank BETWEEN 1 AND 3),
  reason     public.tip_reason NOT NULL,
  count      INT               NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ       NOT NULL DEFAULT now(),
  PRIMARY KEY (author_id, rank)
);

ALTER TABLE public.author_tip_badges ENABLE ROW LEVEL SECURITY;

-- Publicly readable — top-3 badges appear on author profiles
DROP POLICY IF EXISTS "author_tip_badges_select" ON public.author_tip_badges;
CREATE POLICY "author_tip_badges_select"
  ON public.author_tip_badges FOR SELECT
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.  Trigger: keep counts and badges in sync after every tip insert
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_author_tip_badges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Step 1: increment (or seed) the reason count for this author.
  INSERT INTO public.author_tip_reason_counts (author_id, reason, count, last_received_at)
  VALUES (NEW.author_id, NEW.reason, 1, now())
  ON CONFLICT (author_id, reason)
  DO UPDATE SET
    count            = public.author_tip_reason_counts.count + 1,
    last_received_at = now();

  -- Step 2: rewrite the author's top-3 badge rows atomically.
  --   DELETE + INSERT runs in the same transaction as the originating INSERT,
  --   so no other session sees a gap between the two statements.
  DELETE FROM public.author_tip_badges
  WHERE  author_id = NEW.author_id;

  INSERT INTO public.author_tip_badges (author_id, rank, reason, count, updated_at)
  SELECT
    NEW.author_id,
    ROW_NUMBER() OVER (
      ORDER BY atrc.count DESC, atrc.last_received_at DESC
    )::INT            AS rank,
    atrc.reason,
    atrc.count,
    now()
  FROM   public.author_tip_reason_counts atrc
  WHERE  atrc.author_id = NEW.author_id
  ORDER  BY atrc.count DESC, atrc.last_received_at DESC
  LIMIT  3;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_author_tip_badges ON public.chapter_tips;
CREATE TRIGGER trg_update_author_tip_badges
  AFTER INSERT ON public.chapter_tips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_author_tip_badges();
