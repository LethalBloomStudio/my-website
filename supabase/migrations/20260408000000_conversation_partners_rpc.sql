-- Returns distinct conversation partners for a user with their last message
-- time and unread count. Avoids the PostgREST 1000-row cap that caused old
-- conversations to disappear from the messages sidebar.
create or replace function get_conversation_partners(p_user_id uuid)
returns table(
  partner_id uuid,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
security definer
stable
as $$
  select
    partner_id,
    max(created_at) as last_message_at,
    count(*) filter (where status = 'sent' and receiver_id = p_user_id) as unread_count
  from (
    select receiver_id as partner_id, created_at, status, receiver_id
      from direct_messages where sender_id = p_user_id
    union all
    select sender_id as partner_id, created_at, status, receiver_id
      from direct_messages where receiver_id = p_user_id
  ) t
  group by partner_id
  order by last_message_at desc;
$$;
