-- Add denormalized tip_count and view_count to manuscripts for discover-page sorting.
--
-- tip_count  = total chapter_tips rows across all chapters of this manuscript
-- view_count = total chapter_read_completions rows for this manuscript
--
-- Both are maintained by triggers so sorting in discover is a simple ORDER BY.

-- ─── 1. Columns ───────────────────────────────────────────────────────────────

ALTER TABLE public.manuscripts
  ADD COLUMN IF NOT EXISTS tip_count  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;

-- ─── 2. Backfill ──────────────────────────────────────────────────────────────

UPDATE public.manuscripts m
SET tip_count = (
  SELECT COUNT(*)
  FROM public.chapter_tips ct
  JOIN public.manuscript_chapters mc ON mc.id = ct.chapter_id
  WHERE mc.manuscript_id = m.id
);

UPDATE public.manuscripts m
SET view_count = (
  SELECT COUNT(*)
  FROM public.chapter_read_completions crc
  WHERE crc.manuscript_id = m.id
);

-- ─── 3. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS manuscripts_tip_count_idx  ON public.manuscripts (tip_count);
CREATE INDEX IF NOT EXISTS manuscripts_view_count_idx ON public.manuscripts (view_count);

-- ─── 4. Trigger: maintain tip_count via chapter_tips ─────────────────────────

CREATE OR REPLACE FUNCTION public.update_manuscript_tip_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manuscript_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT mc.manuscript_id INTO v_manuscript_id
    FROM manuscript_chapters mc WHERE mc.id = NEW.chapter_id;

    IF v_manuscript_id IS NOT NULL THEN
      UPDATE manuscripts SET tip_count = tip_count + 1 WHERE id = v_manuscript_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT mc.manuscript_id INTO v_manuscript_id
    FROM manuscript_chapters mc WHERE mc.id = OLD.chapter_id;

    IF v_manuscript_id IS NOT NULL THEN
      UPDATE manuscripts SET tip_count = GREATEST(0, tip_count - 1) WHERE id = v_manuscript_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_chapter_tips_update_manuscript_tip_count ON public.chapter_tips;
CREATE TRIGGER trg_chapter_tips_update_manuscript_tip_count
  AFTER INSERT OR DELETE ON public.chapter_tips
  FOR EACH ROW EXECUTE FUNCTION public.update_manuscript_tip_count();

-- ─── 5. Trigger: maintain view_count via chapter_read_completions ─────────────
-- No DELETE trigger needed: chapter_read_completions has no delete RLS policy
-- and completions are permanent.

CREATE OR REPLACE FUNCTION public.update_manuscript_view_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE manuscripts SET view_count = view_count + 1 WHERE id = NEW.manuscript_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crc_update_manuscript_view_count ON public.chapter_read_completions;
CREATE TRIGGER trg_crc_update_manuscript_view_count
  AFTER INSERT ON public.chapter_read_completions
  FOR EACH ROW EXECUTE FUNCTION public.update_manuscript_view_count();
