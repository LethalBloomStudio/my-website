-- Add resolved flag so authors can dismiss feedback from the chapter view
ALTER TABLE public.line_feedback ADD COLUMN IF NOT EXISTS resolved boolean DEFAULT false;

-- Allow the manuscript owner to mark feedback as resolved
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
