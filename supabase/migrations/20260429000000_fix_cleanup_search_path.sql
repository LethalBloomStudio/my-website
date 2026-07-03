-- cleanup_read_notifications was created before the April 11 search_path cleanup
-- and was missed by that migration.
alter function public.cleanup_read_notifications()
  set search_path = public;
