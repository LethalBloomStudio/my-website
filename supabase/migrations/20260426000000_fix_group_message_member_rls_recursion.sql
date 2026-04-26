create or replace function public.is_group_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.group_message_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = p_user_id
  );
$$;

alter function public.is_group_conversation_member(uuid, uuid) owner to postgres;

create or replace function public.is_group_conversation_active_member(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.group_message_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = p_user_id
      and m.left_at is null
  );
$$;

alter function public.is_group_conversation_active_member(uuid, uuid) owner to postgres;

drop policy if exists "group_message_conversations_select_member" on public.group_message_conversations;
create policy "group_message_conversations_select_member"
on public.group_message_conversations for select
using (public.is_group_conversation_member(id, auth.uid()));

drop policy if exists "group_message_conversations_update_active_member" on public.group_message_conversations;
create policy "group_message_conversations_update_active_member"
on public.group_message_conversations for update
using (public.is_group_conversation_active_member(id, auth.uid()))
with check (public.is_group_conversation_active_member(id, auth.uid()));

drop policy if exists "group_message_members_select_member" on public.group_message_members;
create policy "group_message_members_select_member"
on public.group_message_members for select
using (public.is_group_conversation_member(conversation_id, auth.uid()));

drop policy if exists "group_messages_select_member_window" on public.group_messages;
create policy "group_messages_select_member_window"
on public.group_messages for select
using (
  exists (
    select 1
    from public.group_message_members m
    where m.conversation_id = group_messages.conversation_id
      and m.user_id = auth.uid()
      and (m.left_at is null or group_messages.created_at <= m.left_at)
  )
);

drop policy if exists "group_messages_insert_active_member" on public.group_messages;
create policy "group_messages_insert_active_member"
on public.group_messages for insert
with check (
  sender_id = auth.uid()
  and public.is_group_conversation_active_member(conversation_id, auth.uid())
);
