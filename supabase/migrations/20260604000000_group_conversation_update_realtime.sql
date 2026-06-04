-- Enable REPLICA IDENTITY FULL on group_message_conversations so that UPDATE
-- events (e.g. group name renames) deliver the complete new row in the
-- Supabase realtime postgres_changes payload. Without this, only the primary
-- key is guaranteed to appear in the UPDATE diff.
alter table public.group_message_conversations replica identity full;
