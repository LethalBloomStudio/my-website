-- Backfill grants for any approved request that has no grant yet
INSERT INTO public.manuscript_access_grants (manuscript_id, reader_id, granted_by)
SELECT r.manuscript_id, r.requester_id, m.owner_id
FROM public.manuscript_access_requests r
JOIN public.manuscripts m ON m.id = r.manuscript_id
WHERE r.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM public.manuscript_access_grants g
    WHERE g.manuscript_id = r.manuscript_id AND g.reader_id = r.requester_id
  );

-- Trigger: auto-create/remove grant whenever a request is inserted or updated
CREATE OR REPLACE FUNCTION public.sync_access_grant_on_request_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Approved (insert or update) → ensure grant exists
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.manuscript_access_grants (manuscript_id, reader_id, granted_by)
    SELECT NEW.manuscript_id, NEW.requester_id, m.owner_id
    FROM public.manuscripts m WHERE m.id = NEW.manuscript_id
    ON CONFLICT DO NOTHING;
  END IF;

  -- Denied, disabled, or left (update only) → remove grant
  IF TG_OP = 'UPDATE' AND NEW.status IN ('denied', 'disabled', 'left') AND OLD.status = 'approved' THEN
    DELETE FROM public.manuscript_access_grants
    WHERE manuscript_id = NEW.manuscript_id AND reader_id = NEW.requester_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS manuscript_access_requests_sync_grant ON public.manuscript_access_requests;
CREATE TRIGGER manuscript_access_requests_sync_grant
AFTER INSERT OR UPDATE ON public.manuscript_access_requests
FOR EACH ROW EXECUTE FUNCTION public.sync_access_grant_on_request_change();
