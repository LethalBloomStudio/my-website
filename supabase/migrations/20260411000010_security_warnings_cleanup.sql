-- Forward-only cleanup for reviewed Supabase security warnings.
-- This migration intentionally changes only:
-- 1) function search_path settings we already reviewed
-- 2) the permissive posts insert policy
-- 3) the user_feedback insert policy to prevent spoofed user_id values

alter function public.set_manuscripts_updated_at()
  set search_path = public;

alter function public.sync_grant_on_invitation_accept()
  set search_path = public;

alter function public.sync_manuscript_chapter_stats()
  set search_path = public;

alter function public.increment_bloom_coins(uuid, integer)
  set search_path = public;

alter function public.send_inactivity_reminders()
  set search_path = public;

alter function public.delete_inactive_accounts()
  set search_path = public;

alter function public.process_inactivity_lifecycle()
  set search_path = public;

alter function public.reset_inactivity_warning_state()
  set search_path = public;

alter function public.get_conversation_partners(uuid)
  set search_path = public;

alter function public.sync_access_grant_on_request_change()
  set search_path = public;

alter function public.queue_flagged_manuscript()
  set search_path = public;

alter function public.handle_new_user_profiles()
  set search_path = public;

alter function public.enforce_youth_manuscript_rules()
  set search_path = public;

drop policy if exists "Enable insert for authenticated users only" on public.posts;

drop policy if exists "user_feedback_insert" on public.user_feedback;

create policy "user_feedback_insert"
  on public.user_feedback for insert
  with check (
    user_id is null
    or user_id = auth.uid()
  );
