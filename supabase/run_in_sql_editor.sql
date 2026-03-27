-- Run this entire block in your Supabase SQL editor.
-- These two columns are required for the feedback system to work.
-- Using IF NOT EXISTS so it's safe to run even if partially applied.

ALTER TABLE public.line_feedback ADD COLUMN IF NOT EXISTS resolved boolean DEFAULT false;
ALTER TABLE public.line_feedback ADD COLUMN IF NOT EXISTS author_response text CHECK (author_response IN ('agree', 'disagree'));

-- Allow the manuscript owner to mark feedback as resolved / agree / disagree
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
