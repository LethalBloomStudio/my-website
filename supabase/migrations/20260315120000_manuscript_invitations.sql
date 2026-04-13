-- Table for author-initiated invitations to beta readers
CREATE TABLE IF NOT EXISTS public.manuscript_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manuscript_id uuid NOT NULL REFERENCES public.manuscripts(id) ON DELETE CASCADE,
  reader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(manuscript_id, reader_id)
);

ALTER TABLE public.manuscript_invitations ENABLE ROW LEVEL SECURITY;

-- Author can insert invitations for their own manuscripts
CREATE POLICY "inv_insert_author" ON public.manuscript_invitations
  FOR INSERT WITH CHECK (invited_by = auth.uid());

-- Both the invited reader and the inviting author can view
CREATE POLICY "inv_select" ON public.manuscript_invitations
  FOR SELECT USING (reader_id = auth.uid() OR invited_by = auth.uid());

-- Only the reader can update (accept / decline)
CREATE POLICY "inv_update_reader" ON public.manuscript_invitations
  FOR UPDATE USING (reader_id = auth.uid());

-- Trigger: auto-create access grant when a reader accepts
CREATE OR REPLACE FUNCTION public.sync_grant_on_invitation_accept()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    INSERT INTO public.manuscript_access_grants (manuscript_id, reader_id, granted_by)
    VALUES (NEW.manuscript_id, NEW.reader_id, NEW.invited_by)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS manuscript_invitations_sync_grant ON public.manuscript_invitations;
CREATE TRIGGER manuscript_invitations_sync_grant
AFTER INSERT OR UPDATE ON public.manuscript_invitations
FOR EACH ROW EXECUTE FUNCTION public.sync_grant_on_invitation_accept();
