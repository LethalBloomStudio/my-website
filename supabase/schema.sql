do $$ begin
  create type public.member_level as enum ('bloom', 'forge', 'lethal');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.feedback_pref as enum ('gentle', 'balanced', 'blunt', 'line_edits', 'big_picture');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.feedback_pref add value if not exists 'direct';
exception when others then null;
end $$;

do $$ begin
  create type public.age_category as enum ('youth_13_17', 'adult_18_plus');
exception when duplicate_object then null;
end $$;

create table if not exists public.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_name text,
  full_name text,
  dob date,
  email text,
  subscription_status text not null default 'free',
  bloom_coins bigint not null default 0,
  age_category public.age_category not null default 'adult_18_plus',
  parental_consent boolean not null default false,
  last_active_at timestamptz not null default now(),
  inactive_reminder_sent_at timestamptz,
  inactivity_warning_4m_sent_at timestamptz,
  inactivity_warning_5m_sent_at timestamptz
);

create table if not exists public.system_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'system',
  title text not null,
  body text not null,
  severity text not null default 'info',
  is_read boolean not null default false,
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create unique index if not exists system_notifications_user_dedupe_idx
on public.system_notifications (user_id, dedupe_key)
where dedupe_key is not null;

create table if not exists public.bloom_coin_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta bigint not null,
  reason text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  username text unique,
  is_public boolean not null default true,
  pen_name text,
  avatar_url text,
  bio text,
  writer_level public.member_level not null default 'bloom',
  beta_reader_level public.member_level not null default 'bloom',
  writes_genres text[] not null default '{}',
  reads_genres text[] not null default '{}',
  publishing_goals text,
  feedback_areas text,
  feedback_preference public.feedback_pref not null default 'gentle',
  feedback_strengths text,
  profile_complete boolean not null default false
);

create table if not exists public.manuscript_moderation_flags (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  matched_terms text[] not null default '{}',
  status text not null default 'pending_owner_review',
  created_at timestamptz not null default now()
);

create table if not exists public.profile_friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(sender_id, receiver_id)
);

create table if not exists public.profile_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(blocker_id, blocked_id)
);

create table if not exists public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'pending_owner_review',
  created_at timestamptz not null default now()
);

create table if not exists public.profile_contact_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  question_1 text not null,
  question_2 text not null,
  question_3 text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  status text not null default 'sent',
  created_at timestamptz not null default now()
);

create table if not exists public.message_moderation_flags (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  content_excerpt text,
  triggers text[] not null default '{}',
  consequence text not null,
  status text not null default 'pending_owner_review',
  created_at timestamptz not null default now()
);

create table if not exists public.line_feedback (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  reader_id uuid not null references auth.users(id) on delete cascade,
  selection_excerpt text not null,
  comment_text text not null,
  start_offset int,
  end_offset int,
  word_count int not null default 0,
  coins_awarded int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.line_feedback_replies (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.line_feedback(id) on delete cascade,
  replier_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.manuscript_access_requests (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(manuscript_id, requester_id)
);

create table if not exists public.manuscript_access_grants (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  reader_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(manuscript_id, reader_id)
);

create table if not exists public.manuscript_chapters (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  chapter_order int not null default 1,
  title text not null default 'Chapter 1',
  content text not null,
  is_private boolean not null default true,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create or replace function public.set_manuscript_chapter_published_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_private = false then
    if tg_op = 'INSERT' then
      new.published_at := coalesce(new.published_at, now());
    elsif old.is_private is distinct from new.is_private and old.is_private = true then
      new.published_at := now();
    elsif new.published_at is null then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists manuscript_chapters_set_published_at on public.manuscript_chapters;
create trigger manuscript_chapters_set_published_at
before insert or update on public.manuscript_chapters
for each row execute function public.set_manuscript_chapter_published_at();

alter table public.manuscripts add column if not exists cover_url text;
alter table public.manuscripts add column if not exists description text;
alter table public.manuscripts add column if not exists requested_feedback text;
alter table public.manuscripts add column if not exists potential_triggers text;
alter table public.manuscripts add column if not exists copyright_info text;
alter table public.manuscripts add column if not exists visibility text not null default 'private';
alter table public.manuscripts add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_manuscripts_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists manuscripts_set_updated_at on public.manuscripts;
create trigger manuscripts_set_updated_at
before update on public.manuscripts
for each row execute function public.set_manuscripts_updated_at();

alter table public.line_feedback add column if not exists chapter_id uuid references public.manuscript_chapters(id) on delete cascade;

create table if not exists public.owner_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists public_profiles_username_idx
on public.public_profiles (username);

alter table public.accounts enable row level security;
alter table public.public_profiles enable row level security;
alter table public.manuscript_moderation_flags enable row level security;
alter table public.profile_friend_requests enable row level security;
alter table public.profile_blocks enable row level security;
alter table public.profile_reports enable row level security;
alter table public.profile_contact_requests enable row level security;
alter table public.direct_messages enable row level security;
alter table public.message_moderation_flags enable row level security;
alter table public.bloom_coin_ledger enable row level security;
alter table public.owner_admins enable row level security;
alter table public.line_feedback enable row level security;
alter table public.line_feedback_replies enable row level security;
alter table public.manuscript_access_requests enable row level security;
alter table public.manuscript_access_grants enable row level security;
alter table public.manuscript_chapters enable row level security;
alter table public.system_notifications enable row level security;

drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own"
on public.accounts for select
using (auth.uid() = user_id);

drop policy if exists "accounts_insert_own" on public.accounts;
create policy "accounts_insert_own"
on public.accounts for insert
with check (auth.uid() = user_id);

drop policy if exists "accounts_update_own" on public.accounts;
create policy "accounts_update_own"
on public.accounts for update
using (auth.uid() = user_id);

drop policy if exists "accounts_owner_admin_select" on public.accounts;
create policy "accounts_owner_admin_select"
on public.accounts for select
using (
  exists (
    select 1
    from public.owner_admins oa
    where oa.user_id = auth.uid()
  )
);

drop policy if exists "accounts_owner_admin_update" on public.accounts;
create policy "accounts_owner_admin_update"
on public.accounts for update
using (
  exists (
    select 1
    from public.owner_admins oa
    where oa.user_id = auth.uid()
  )
);

drop policy if exists "system_notifications_select_own" on public.system_notifications;
create policy "system_notifications_select_own"
on public.system_notifications for select
using (auth.uid() = user_id);

drop policy if exists "system_notifications_update_own" on public.system_notifications;
create policy "system_notifications_update_own"
on public.system_notifications for update
using (auth.uid() = user_id);

alter table public.accounts
  add column if not exists conduct_strikes int not null default 0;
alter table public.accounts
  add column if not exists messaging_suspended_until timestamptz;
alter table public.accounts
  add column if not exists feedback_suspended_until timestamptz;
alter table public.accounts
  add column if not exists blacklisted boolean not null default false;
alter table public.accounts
  add column if not exists appeal_requested boolean not null default false;
alter table public.accounts
  add column if not exists inactivity_warning_4m_sent_at timestamptz;
alter table public.accounts
  add column if not exists inactivity_warning_5m_sent_at timestamptz;

drop policy if exists "coin_ledger_select_own" on public.bloom_coin_ledger;
create policy "coin_ledger_select_own"
on public.bloom_coin_ledger for select
using (auth.uid() = user_id);

drop policy if exists "flags_select_own" on public.manuscript_moderation_flags;
create policy "flags_select_own"
on public.manuscript_moderation_flags for select
using (auth.uid() = owner_id);

drop policy if exists "flags_insert_own" on public.manuscript_moderation_flags;
create policy "flags_insert_own"
on public.manuscript_moderation_flags for insert
with check (auth.uid() = owner_id);

drop policy if exists "friend_requests_select_own" on public.profile_friend_requests;
create policy "friend_requests_select_own"
on public.profile_friend_requests for select
using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "friend_requests_insert_own" on public.profile_friend_requests;
create policy "friend_requests_insert_own"
on public.profile_friend_requests for insert
with check (auth.uid() = sender_id);

drop policy if exists "friend_requests_update_receiver" on public.profile_friend_requests;
create policy "friend_requests_update_receiver"
on public.profile_friend_requests for update
using (auth.uid() = receiver_id);

drop policy if exists "blocks_select_own" on public.profile_blocks;
create policy "blocks_select_own"
on public.profile_blocks for select
using (auth.uid() = blocker_id);

drop policy if exists "blocks_insert_own" on public.profile_blocks;
create policy "blocks_insert_own"
on public.profile_blocks for insert
with check (auth.uid() = blocker_id);

drop policy if exists "reports_select_own" on public.profile_reports;
create policy "reports_select_own"
on public.profile_reports for select
using (auth.uid() = reporter_id);

drop policy if exists "reports_insert_own" on public.profile_reports;
create policy "reports_insert_own"
on public.profile_reports for insert
with check (auth.uid() = reporter_id);

drop policy if exists "contact_select_own" on public.profile_contact_requests;
create policy "contact_select_own"
on public.profile_contact_requests for select
using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "contact_insert_own" on public.profile_contact_requests;
create policy "contact_insert_own"
on public.profile_contact_requests for insert
with check (auth.uid() = sender_id);

drop policy if exists "messages_select_participant" on public.direct_messages;
create policy "messages_select_participant"
on public.direct_messages for select
using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "messages_insert_sender" on public.direct_messages;
create policy "messages_insert_sender"
on public.direct_messages for insert
with check (auth.uid() = sender_id);

drop policy if exists "messages_update_receiver" on public.direct_messages;
create policy "messages_update_receiver"
on public.direct_messages for update
using (auth.uid() = receiver_id)
with check (auth.uid() = receiver_id);

drop policy if exists "line_feedback_select_participants" on public.line_feedback;
create policy "line_feedback_select_participants"
on public.line_feedback for select
using (
  auth.uid() = reader_id
  or exists (
    select 1
    from public.manuscripts m
    where m.id = line_feedback.manuscript_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists "line_feedback_insert_reader" on public.line_feedback;
create policy "line_feedback_insert_reader"
on public.line_feedback for insert
with check (
  auth.uid() = reader_id
  and (
    exists (
      select 1
      from public.manuscripts m
      where m.id = line_feedback.manuscript_id
        and m.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.manuscript_access_grants g
      where g.manuscript_id = line_feedback.manuscript_id
        and g.reader_id = auth.uid()
    )
  )
);

drop policy if exists "line_feedback_replies_select_participants" on public.line_feedback_replies;
create policy "line_feedback_replies_select_participants"
on public.line_feedback_replies for select
using (
  exists (
    select 1
    from public.line_feedback lf
    join public.manuscripts m on m.id = lf.manuscript_id
    where lf.id = line_feedback_replies.feedback_id
      and (lf.reader_id = auth.uid() or m.owner_id = auth.uid())
  )
);

drop policy if exists "line_feedback_replies_insert_participants" on public.line_feedback_replies;
create policy "line_feedback_replies_insert_participants"
on public.line_feedback_replies for insert
with check (
  auth.uid() = replier_id
  and exists (
    select 1
    from public.line_feedback lf
    join public.manuscripts m on m.id = lf.manuscript_id
    where lf.id = line_feedback_replies.feedback_id
      and (lf.reader_id = auth.uid() or m.owner_id = auth.uid())
  )
);

drop policy if exists "mar_select_participant" on public.manuscript_access_requests;
create policy "mar_select_participant"
on public.manuscript_access_requests for select
using (
  auth.uid() = requester_id
  or exists (
    select 1
    from public.manuscripts m
    where m.id = manuscript_access_requests.manuscript_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists "mar_insert_requester" on public.manuscript_access_requests;
create policy "mar_insert_requester"
on public.manuscript_access_requests for insert
with check (auth.uid() = requester_id);

drop policy if exists "mar_update_owner" on public.manuscript_access_requests;
create policy "mar_update_owner"
on public.manuscript_access_requests for update
using (
  exists (
    select 1
    from public.manuscripts m
    where m.id = manuscript_access_requests.manuscript_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists "mag_select_participant" on public.manuscript_access_grants;
create policy "mag_select_participant"
on public.manuscript_access_grants for select
using (
  auth.uid() = reader_id
  or exists (
    select 1
    from public.manuscripts m
    where m.id = manuscript_access_grants.manuscript_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists "mag_insert_owner" on public.manuscript_access_grants;
create policy "mag_insert_owner"
on public.manuscript_access_grants for insert
with check (
  exists (
    select 1
    from public.manuscripts m
    where m.id = manuscript_access_grants.manuscript_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists "mag_delete_owner" on public.manuscript_access_grants;
create policy "mag_delete_owner"
on public.manuscript_access_grants for delete
using (
  exists (
    select 1
    from public.manuscripts m
    where m.id = manuscript_access_grants.manuscript_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists "chapters_select_owner_or_granted" on public.manuscript_chapters;
create policy "chapters_select_owner_or_granted"
on public.manuscript_chapters for select
using (
  exists (
    select 1
    from public.manuscripts m
    where m.id = manuscript_chapters.manuscript_id
      and m.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.manuscript_access_grants g
    where g.manuscript_id = manuscript_chapters.manuscript_id
      and g.reader_id = auth.uid()
  )
);

drop policy if exists "chapters_insert_owner" on public.manuscript_chapters;
create policy "chapters_insert_owner"
on public.manuscript_chapters for insert
with check (
  exists (
    select 1
    from public.manuscripts m
    where m.id = manuscript_chapters.manuscript_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists "chapters_update_owner" on public.manuscript_chapters;
create policy "chapters_update_owner"
on public.manuscript_chapters for update
using (
  exists (
    select 1
    from public.manuscripts m
    where m.id = manuscript_chapters.manuscript_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists "chapters_delete_owner" on public.manuscript_chapters;
create policy "chapters_delete_owner"
on public.manuscript_chapters for delete
using (
  exists (
    select 1
    from public.manuscripts m
    where m.id = manuscript_chapters.manuscript_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists "message_flags_select_sender" on public.message_moderation_flags;
create policy "message_flags_select_sender"
on public.message_moderation_flags for select
using (auth.uid() = sender_id);

drop policy if exists "message_flags_insert_sender" on public.message_moderation_flags;
create policy "message_flags_insert_sender"
on public.message_moderation_flags for insert
with check (auth.uid() = sender_id);

drop policy if exists "message_flags_owner_admin_select" on public.message_moderation_flags;
create policy "message_flags_owner_admin_select"
on public.message_moderation_flags for select
using (
  exists (
    select 1
    from public.owner_admins oa
    where oa.user_id = auth.uid()
  )
);

drop policy if exists "message_flags_owner_admin_update" on public.message_moderation_flags;
create policy "message_flags_owner_admin_update"
on public.message_moderation_flags for update
using (
  exists (
    select 1
    from public.owner_admins oa
    where oa.user_id = auth.uid()
  )
);

drop policy if exists "owner_admins_select_own" on public.owner_admins;
create policy "owner_admins_select_own"
on public.owner_admins for select
using (auth.uid() = user_id);

drop policy if exists "public_profiles_select_public" on public.public_profiles;
create policy "public_profiles_select_public"
on public.public_profiles for select
using (is_public = true);

drop policy if exists "public_profiles_insert_own" on public.public_profiles;
create policy "public_profiles_insert_own"
on public.public_profiles for insert
with check (auth.uid() = user_id);

drop policy if exists "public_profiles_update_own" on public.public_profiles;
create policy "public_profiles_update_own"
on public.public_profiles for update
using (auth.uid() = user_id);

create or replace function public.send_inactivity_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with warning_4m as (
    select a.user_id, a.last_active_at
    from public.accounts a
    where a.last_active_at < now() - interval '4 months'
      and a.last_active_at >= now() - interval '5 months'
      and a.inactivity_warning_4m_sent_at is null
  ),
  inserted_4m as (
    insert into public.system_notifications (user_id, category, title, body, severity, dedupe_key)
    select
      w.user_id,
      'inactivity',
      'Inactivity warning: 2 months left',
      'Your account has been inactive for 4 months. Sign in before 6 months to avoid account deactivation.',
      'warning',
      'inactivity-4m-' || to_char(date_trunc('day', w.last_active_at), 'YYYYMMDD')
    from warning_4m w
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
    returning user_id
  )
  update public.accounts a
  set inactivity_warning_4m_sent_at = now(),
      inactive_reminder_sent_at = now(),
      updated_at = now()
  from inserted_4m i
  where a.user_id = i.user_id;

  with warning_5m as (
    select a.user_id, a.last_active_at
    from public.accounts a
    where a.last_active_at < now() - interval '5 months'
      and a.last_active_at >= now() - interval '6 months'
      and a.inactivity_warning_5m_sent_at is null
  ),
  inserted_5m as (
    insert into public.system_notifications (user_id, category, title, body, severity, dedupe_key)
    select
      w.user_id,
      'inactivity',
      'Final inactivity warning: 1 month left',
      'Your account has been inactive for 5 months. Sign in before 6 months to avoid account deactivation.',
      'warning',
      'inactivity-5m-' || to_char(date_trunc('day', w.last_active_at), 'YYYYMMDD')
    from warning_5m w
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
    returning user_id
  )
  update public.accounts a
  set inactivity_warning_5m_sent_at = now(),
      updated_at = now()
  from inserted_5m i
  where a.user_id = i.user_id;
end;
$$;

create or replace function public.delete_inactive_accounts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users
  where id in (
    select user_id from public.accounts
    where last_active_at < now() - interval '6 months'
  );
end;
$$;

create or replace function public.process_inactivity_lifecycle()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.send_inactivity_reminders();
  perform public.delete_inactive_accounts();
end;
$$;

create or replace function public.reset_inactivity_warning_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.last_active_at is distinct from old.last_active_at
     and new.last_active_at > old.last_active_at
     and new.last_active_at >= now() - interval '4 months' then
    new.inactivity_warning_4m_sent_at := null;
    new.inactivity_warning_5m_sent_at := null;
    new.inactive_reminder_sent_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists accounts_reset_inactivity_warning_state on public.accounts;
create trigger accounts_reset_inactivity_warning_state
before update on public.accounts
for each row execute function public.reset_inactivity_warning_state();

create or replace function public.submit_line_feedback(
  p_manuscript_id uuid,
  p_selection_excerpt text,
  p_comment_text text,
  p_chapter_id uuid default null,
  p_start_offset int default null,
  p_end_offset int default null
)
returns table (feedback_id uuid, coins_earned int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reader_id uuid := auth.uid();
  v_owner_id uuid;
  v_has_grant boolean := false;
  v_words int;
  v_coins int := 0;
  v_feedback_id uuid;
begin
  if v_reader_id is null then
    raise exception 'Not authenticated';
  end if;

  select owner_id
  into v_owner_id
  from public.manuscripts
  where id = p_manuscript_id;

  if v_owner_id is null then
    raise exception 'Manuscript not found';
  end if;

  if p_chapter_id is not null then
    if not exists (
      select 1
      from public.manuscript_chapters c
      where c.id = p_chapter_id and c.manuscript_id = p_manuscript_id
    ) then
      raise exception 'Chapter does not belong to manuscript';
    end if;
  end if;

  if v_owner_id <> v_reader_id then
    select exists (
      select 1
      from public.manuscript_access_grants g
      where g.manuscript_id = p_manuscript_id
        and g.reader_id = v_reader_id
    ) into v_has_grant;

    if not v_has_grant then
      raise exception 'Access not granted for this manuscript';
    end if;
  end if;

  if p_comment_text is null or btrim(p_comment_text) = '' then
    raise exception 'Feedback text is required';
  end if;

  v_words := coalesce(array_length(regexp_split_to_array(btrim(p_comment_text), '\s+'), 1), 0);

  if v_words >= 200 then
    v_coins := 10;
  elsif v_words >= 100 then
    v_coins := 5;
  end if;

  if v_owner_id = v_reader_id then
    v_coins := 0;
  end if;

  insert into public.line_feedback (
    manuscript_id,
    chapter_id,
    reader_id,
    selection_excerpt,
    comment_text,
    start_offset,
    end_offset,
    word_count,
    coins_awarded
  )
  values (
    p_manuscript_id,
    p_chapter_id,
    v_reader_id,
    p_selection_excerpt,
    p_comment_text,
    p_start_offset,
    p_end_offset,
    v_words,
    v_coins
  )
  returning id into v_feedback_id;

  if v_coins > 0 then
    update public.accounts
    set bloom_coins = bloom_coins + v_coins,
        updated_at = now(),
        last_active_at = now()
    where user_id = v_reader_id;

    insert into public.bloom_coin_ledger (user_id, delta, reason, metadata)
    values (
      v_reader_id,
      v_coins,
      'feedback_reward',
      jsonb_build_object('manuscript_id', p_manuscript_id, 'line_feedback_id', v_feedback_id)
    );
  end if;

  return query select v_feedback_id, v_coins;
end;
$$;

grant execute on function public.submit_line_feedback(uuid, text, text, uuid, int, int) to authenticated;

-- Schedule these in Supabase SQL editor (pg_cron) if enabled:
-- select cron.schedule('process-inactivity-lifecycle', '0 12 * * *', $$select public.process_inactivity_lifecycle();$$);

do $$
declare
  has_manuscripts boolean;
begin
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'manuscripts'
  ) into has_manuscripts;

  if has_manuscripts then
    begin
      alter table public.manuscripts
      drop constraint if exists manuscripts_owner_id_fkey;
    exception when others then
      null;
    end;

    alter table public.manuscripts
    add constraint manuscripts_owner_id_fkey
    foreign key (owner_id)
    references auth.users(id)
    on delete cascade;
  end if;
end $$;
