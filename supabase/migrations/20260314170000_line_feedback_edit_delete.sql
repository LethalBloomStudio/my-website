-- Allow readers to update their own line feedback
DROP POLICY IF EXISTS "line_feedback_update_reader" ON public.line_feedback;
CREATE POLICY "line_feedback_update_reader"
ON public.line_feedback FOR UPDATE
USING (auth.uid() = reader_id)
WITH CHECK (auth.uid() = reader_id);

-- Allow readers to delete their own line feedback
DROP POLICY IF EXISTS "line_feedback_delete_reader" ON public.line_feedback;
CREATE POLICY "line_feedback_delete_reader"
ON public.line_feedback FOR DELETE
USING (auth.uid() = reader_id);
