create table if not exists public.group_message_conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_message_members (
  conversation_id uuid not null references public.group_message_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.group_message_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists group_message_members_user_idx
  on public.group_message_members (user_id, left_at, updated_at desc);

create index if not exists group_messages_conversation_created_idx
  on public.group_messages (conversation_id, created_at desc);

alter table public.group_message_conversations enable row level security;
alter table public.group_message_members enable row level security;
alter table public.group_messages enable row level security;

drop policy if exists "group_message_conversations_select_member" on public.group_message_conversations;
create policy "group_message_conversations_select_member"
on public.group_message_conversations for select
using (
  exists (
    select 1
    from public.group_message_members m
    where m.conversation_id = id
      and m.user_id = auth.uid()
  )
);

drop policy if exists "group_message_conversations_insert_creator" on public.group_message_conversations;
create policy "group_message_conversations_insert_creator"
on public.group_message_conversations for insert
with check (created_by = auth.uid());

drop policy if exists "group_message_conversations_update_active_member" on public.group_message_conversations;
create policy "group_message_conversations_update_active_member"
on public.group_message_conversations for update
using (
  exists (
    select 1
    from public.group_message_members m
    where m.conversation_id = id
      and m.user_id = auth.uid()
      and m.left_at is null
  )
)
with check (
  exists (
    select 1
    from public.group_message_members m
    where m.conversation_id = id
      and m.user_id = auth.uid()
      and m.left_at is null
  )
);

drop policy if exists "group_message_members_select_member" on public.group_message_members;
create policy "group_message_members_select_member"
on public.group_message_members for select
using (
  exists (
    select 1
    from public.group_message_members viewer
    where viewer.conversation_id = conversation_id
      and viewer.user_id = auth.uid()
  )
);

drop policy if exists "group_message_members_insert_self" on public.group_message_members;
create policy "group_message_members_insert_self"
on public.group_message_members for insert
with check (user_id = auth.uid());

drop policy if exists "group_message_members_update_self" on public.group_message_members;
create policy "group_message_members_update_self"
on public.group_message_members for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "group_messages_select_member_window" on public.group_messages;
create policy "group_messages_select_member_window"
on public.group_messages for select
using (
  exists (
    select 1
    from public.group_message_members m
    where m.conversation_id = conversation_id
      and m.user_id = auth.uid()
      and (m.left_at is null or created_at <= m.left_at)
  )
);

drop policy if exists "group_messages_insert_active_member" on public.group_messages;
create policy "group_messages_insert_active_member"
on public.group_messages for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.group_message_members m
    where m.conversation_id = conversation_id
      and m.user_id = auth.uid()
      and m.left_at is null
  )
);

create or replace function public.get_group_message_conversations(p_user_id uuid)
returns table(
  conversation_id uuid,
  title text,
  created_by uuid,
  joined_at timestamptz,
  last_read_at timestamptz,
  last_message_at timestamptz,
  unread_count bigint,
  member_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    c.id as conversation_id,
    c.title,
    c.created_by,
    m.joined_at,
    m.last_read_at,
    max(msg.created_at) as last_message_at,
    count(*) filter (
      where msg.sender_id <> p_user_id
        and msg.created_at > coalesce(m.last_read_at, m.joined_at)
    ) as unread_count,
    (
      select count(*)
      from public.group_message_members all_members
      where all_members.conversation_id = c.id
        and all_members.left_at is null
    ) as member_count
  from public.group_message_members m
  join public.group_message_conversations c
    on c.id = m.conversation_id
  left join public.group_messages msg
    on msg.conversation_id = c.id
   and msg.created_at >= m.joined_at
  where m.user_id = p_user_id
    and m.left_at is null
  group by c.id, c.title, c.created_by, m.joined_at, m.last_read_at
  order by max(msg.created_at) desc nulls last, c.created_at desc;
$$;

alter function public.get_group_message_conversations(uuid) owner to postgres;

alter table public.message_moderation_flags
  alter column receiver_id drop not null;

alter table public.message_moderation_flags
  add column if not exists conversation_id uuid references public.group_message_conversations(id) on delete cascade;
