-- Allow a reader to update their own access request (e.g. set status = 'left')
DROP POLICY IF EXISTS "mar_update_requester" ON public.manuscript_access_requests;
CREATE POLICY "mar_update_requester"
ON public.manuscript_access_requests FOR UPDATE
USING (auth.uid() = requester_id)
WITH CHECK (auth.uid() = requester_id);

-- Allow a reader to delete their own access grant (i.e. leave a project)
DROP POLICY IF EXISTS "mag_delete_reader" ON public.manuscript_access_grants;
CREATE POLICY "mag_delete_reader"
ON public.manuscript_access_grants FOR DELETE
USING (auth.uid() = reader_id);
