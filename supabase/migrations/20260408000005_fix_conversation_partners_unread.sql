-- Fix get_conversation_partners: the original query had a bug where
-- unread_count was always 0 because the filter checked receiver_id = p_user_id
-- across the entire union, but the first branch (sent messages) never has
-- receiver_id = p_user_id so those rows never matched.
-- Now each branch marks is_unread correctly before grouping.
create or replace function get_conversation_partners(p_user_id uuid)
returns table(
  partner_id uuid,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    partner_id,
    max(created_at) as last_message_at,
    count(*) filter (where is_unread) as unread_count
  from (
    -- Messages the user sent — never unread for the sender
    select
      receiver_id as partner_id,
      created_at,
      false as is_unread
    from direct_messages where sender_id = p_user_id
    union all
    -- Messages the user received — unread if status = 'sent'
    select
      sender_id as partner_id,
      created_at,
      status = 'sent' as is_unread
    from direct_messages where receiver_id = p_user_id
  ) t
  group by partner_id
  order by last_message_at desc;
$$;
