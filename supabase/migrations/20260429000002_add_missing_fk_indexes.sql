-- Adds indexes on FK columns that were missing, causing Performance Advisor warnings.
-- All statements use IF NOT EXISTS so this is safe to run more than once.

-- bloom_coin_ledger
create index if not exists bloom_coin_ledger_user_id_idx
  on public.bloom_coin_ledger (user_id);

-- system_notifications — existing dedupe index is partial; add a plain one for full scans
create index if not exists system_notifications_user_id_idx
  on public.system_notifications (user_id);

-- manuscript_moderation_flags
create index if not exists manuscript_moderation_flags_owner_id_idx
  on public.manuscript_moderation_flags (owner_id);

-- direct_messages — queried heavily on every message page load
create index if not exists direct_messages_sender_id_idx
  on public.direct_messages (sender_id);
create index if not exists direct_messages_receiver_id_idx
  on public.direct_messages (receiver_id);

-- message_moderation_flags
create index if not exists message_moderation_flags_sender_id_idx
  on public.message_moderation_flags (sender_id);
create index if not exists message_moderation_flags_receiver_id_idx
  on public.message_moderation_flags (receiver_id);
create index if not exists message_moderation_flags_conversation_id_idx
  on public.message_moderation_flags (conversation_id);

-- manuscript_chapters — queried on every manuscript open
create index if not exists manuscript_chapters_manuscript_id_idx
  on public.manuscript_chapters (manuscript_id);

-- line_feedback
create index if not exists line_feedback_manuscript_id_idx
  on public.line_feedback (manuscript_id);
create index if not exists line_feedback_reader_id_idx
  on public.line_feedback (reader_id);
create index if not exists line_feedback_chapter_id_idx
  on public.line_feedback (chapter_id);

-- line_feedback_replies
create index if not exists line_feedback_replies_feedback_id_idx
  on public.line_feedback_replies (feedback_id);
create index if not exists line_feedback_replies_replier_id_idx
  on public.line_feedback_replies (replier_id);

-- chapter_read_completions
create index if not exists chapter_read_completions_chapter_id_idx
  on public.chapter_read_completions (chapter_id);
create index if not exists chapter_read_completions_manuscript_id_idx
  on public.chapter_read_completions (manuscript_id);
create index if not exists chapter_read_completions_reader_id_idx
  on public.chapter_read_completions (reader_id);

-- manuscript_access_requests — unique(manuscript_id, requester_id) indexes manuscript_id
-- but requester_id alone is not independently indexed
create index if not exists manuscript_access_requests_requester_id_idx
  on public.manuscript_access_requests (requester_id);

-- manuscript_access_grants — unique(manuscript_id, reader_id) covers those two;
-- granted_by has no index
create index if not exists manuscript_access_grants_granted_by_idx
  on public.manuscript_access_grants (granted_by);

-- profile_friend_requests — unique(sender_id, receiver_id) covers sender_id as leading;
-- receiver_id alone is not independently indexed
create index if not exists profile_friend_requests_receiver_id_idx
  on public.profile_friend_requests (receiver_id);

-- profile_blocks — unique(blocker_id, blocked_id) covers blocker_id as leading;
-- blocked_id alone is not independently indexed
create index if not exists profile_blocks_blocked_id_idx
  on public.profile_blocks (blocked_id);

-- profile_reports
create index if not exists profile_reports_reporter_id_idx
  on public.profile_reports (reporter_id);
create index if not exists profile_reports_reported_id_idx
  on public.profile_reports (reported_id);

-- profile_contact_requests
create index if not exists profile_contact_requests_sender_id_idx
  on public.profile_contact_requests (sender_id);
create index if not exists profile_contact_requests_receiver_id_idx
  on public.profile_contact_requests (receiver_id);

-- profile_content_reports
create index if not exists profile_content_reports_reporter_id_idx
  on public.profile_content_reports (reporter_id);
create index if not exists profile_content_reports_content_owner_id_idx
  on public.profile_content_reports (content_owner_id);

-- conduct_appeals
create index if not exists conduct_appeals_user_id_idx
  on public.conduct_appeals (user_id);

-- profile_follows — PK(follower_id, following_id) indexes follower_id as leading;
-- following_id alone is not indexed (needed for "who follows this user" queries)
create index if not exists profile_follows_following_id_idx
  on public.profile_follows (following_id);

-- friend_favorites — PK(user_id, friend_user_id) indexes user_id as leading;
-- friend_user_id alone is not independently indexed
create index if not exists friend_favorites_friend_user_id_idx
  on public.friend_favorites (friend_user_id);

-- profile_announcements
create index if not exists profile_announcements_user_id_idx
  on public.profile_announcements (user_id);

-- profile_announcement_comments
create index if not exists profile_announcement_comments_announcement_id_idx
  on public.profile_announcement_comments (announcement_id);
create index if not exists profile_announcement_comments_user_id_idx
  on public.profile_announcement_comments (user_id);

-- profile_announcement_likes — PK(announcement_id, user_id); user_id alone not indexed
create index if not exists profile_announcement_likes_user_id_idx
  on public.profile_announcement_likes (user_id);

-- profile_announcement_comment_likes — user_id not indexed
create index if not exists profile_announcement_comment_likes_user_id_idx
  on public.profile_announcement_comment_likes (user_id);

-- profile_announcement_poll_votes — user_id not indexed
create index if not exists profile_announcement_poll_votes_user_id_idx
  on public.profile_announcement_poll_votes (user_id);

-- community_announcements
create index if not exists community_announcements_created_by_idx
  on public.community_announcements (created_by);

-- stripe_billing_events
create index if not exists stripe_billing_events_user_id_idx
  on public.stripe_billing_events (user_id);

-- group_message_conversations
create index if not exists group_message_conversations_created_by_idx
  on public.group_message_conversations (created_by);

-- group_messages — conversation_id already indexed; sender_id is not
create index if not exists group_messages_sender_id_idx
  on public.group_messages (sender_id);

-- hidden_message_threads — PK(user_id, partner_id) and user_id index exist;
-- partner_id alone is not independently indexed
create index if not exists hidden_message_threads_partner_id_idx
  on public.hidden_message_threads (partner_id);
