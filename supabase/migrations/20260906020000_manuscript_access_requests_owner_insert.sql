-- Allow a manuscript owner to insert a manuscript_access_requests row for a
-- reader who joined via direct invite (manuscript_invitations) and therefore
-- never got a request row. Needed so the owner's "Disable" action can upsert
-- a status instead of silently no-op'ing on the update and then deleting the
-- reader's access grant with no trace.
drop policy if exists "mar_insert_owner" on public.manuscript_access_requests;
create policy "mar_insert_owner"
on public.manuscript_access_requests for insert
with check (
  exists (
    select 1 from public.manuscripts m
    where m.id = manuscript_access_requests.manuscript_id
      and m.owner_id = auth.uid()
  )
);
