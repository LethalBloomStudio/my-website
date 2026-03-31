-- Enable realtime for system_notifications so the notification badge
-- and notifications page update instantly without a page refresh.
alter publication supabase_realtime add table public.system_notifications;
