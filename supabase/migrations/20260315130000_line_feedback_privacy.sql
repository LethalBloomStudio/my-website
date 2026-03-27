-- Enforce line_feedback privacy:
--   • Readers see only their own feedback rows.
--   • The manuscript owner sees all feedback rows for their manuscript.
--   • No one else can read, insert, update, or delete feedback rows.
--
-- This migration is idempotent (DROP IF EXISTS before every CREATE).

-- ─── SELECT ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "line_feedback_select_participants" ON public.line_feedback;
CREATE POLICY "line_feedback_select_participants"
ON public.line_feedback FOR SELECT
USING (
  -- The reader who left the feedback can always see their own row
  auth.uid() = reader_id
  OR
  -- The manuscript owner can see all feedback on their manuscript
  EXISTS (
    SELECT 1 FROM public.manuscripts m
    WHERE m.id = line_feedback.manuscript_id
      AND m.owner_id = auth.uid()
  )
);

-- ─── INSERT ──────────────────────────────────────────────────────────────────
-- Allowed for: manuscript owner (annotation/testing) or a granted reader.
DROP POLICY IF EXISTS "line_feedback_insert_reader" ON public.line_feedback;
CREATE POLICY "line_feedback_insert_reader"
ON public.line_feedback FOR INSERT
WITH CHECK (
  auth.uid() = reader_id
  AND (
    -- Owner submitting their own annotation
    EXISTS (
      SELECT 1 FROM public.manuscripts m
      WHERE m.id = line_feedback.manuscript_id
        AND m.owner_id = auth.uid()
    )
    OR
    -- Granted beta reader
    EXISTS (
      SELECT 1 FROM public.manuscript_access_grants g
      WHERE g.manuscript_id = line_feedback.manuscript_id
        AND g.reader_id = auth.uid()
    )
  )
);

-- ─── UPDATE (reader edits their own comment text) ────────────────────────────
DROP POLICY IF EXISTS "line_feedback_update_reader" ON public.line_feedback;
CREATE POLICY "line_feedback_update_reader"
ON public.line_feedback FOR UPDATE
USING (auth.uid() = reader_id)
WITH CHECK (auth.uid() = reader_id);

-- ─── UPDATE (owner marks agree / disagree / resolved) ────────────────────────
DROP POLICY IF EXISTS "line_feedback_resolve_author" ON public.line_feedback;
CREATE POLICY "line_feedback_resolve_author"
ON public.line_feedback FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.manuscripts m
    WHERE m.id = line_feedback.manuscript_id
      AND m.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.manuscripts m
    WHERE m.id = line_feedback.manuscript_id
      AND m.owner_id = auth.uid()
  )
);

-- ─── DELETE (reader deletes their own feedback) ──────────────────────────────
DROP POLICY IF EXISTS "line_feedback_delete_reader" ON public.line_feedback;
CREATE POLICY "line_feedback_delete_reader"
ON public.line_feedback FOR DELETE
USING (auth.uid() = reader_id);

-- ─── REPLIES SELECT ──────────────────────────────────────────────────────────
-- Visible to: the reader who left the original feedback, and the manuscript owner.
DROP POLICY IF EXISTS "line_feedback_replies_select_participants" ON public.line_feedback_replies;
CREATE POLICY "line_feedback_replies_select_participants"
ON public.line_feedback_replies FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.line_feedback lf
    JOIN public.manuscripts m ON m.id = lf.manuscript_id
    WHERE lf.id = line_feedback_replies.feedback_id
      AND (lf.reader_id = auth.uid() OR m.owner_id = auth.uid())
  )
);

-- ─── REPLIES INSERT ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "line_feedback_replies_insert_participants" ON public.line_feedback_replies;
CREATE POLICY "line_feedback_replies_insert_participants"
ON public.line_feedback_replies FOR INSERT
WITH CHECK (
  auth.uid() = replier_id
  AND EXISTS (
    SELECT 1
    FROM public.line_feedback lf
    JOIN public.manuscripts m ON m.id = lf.manuscript_id
    WHERE lf.id = line_feedback_replies.feedback_id
      AND (lf.reader_id = auth.uid() OR m.owner_id = auth.uid())
  )
);
