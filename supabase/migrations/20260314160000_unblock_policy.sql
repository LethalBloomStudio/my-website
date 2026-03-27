-- Allow the blocker to delete their own block (unblock)
DROP POLICY IF EXISTS "blocks_delete_own" ON public.profile_blocks;
CREATE POLICY "blocks_delete_own"
ON public.profile_blocks FOR DELETE
USING (auth.uid() = blocker_id);
