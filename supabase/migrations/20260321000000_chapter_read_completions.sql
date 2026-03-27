-- Tracks which chapters a beta reader has completed (≥200 words feedback → 5 bloom coins).
-- One row per (chapter, reader) pair. Coins are awarded once, permanently.

create table if not exists public.chapter_read_completions (
  id              uuid primary key default gen_random_uuid(),
  chapter_id      uuid not null references public.manuscript_chapters(id) on delete cascade,
  manuscript_id   uuid not null references public.manuscripts(id) on delete cascade,
  reader_id       uuid not null references auth.users(id) on delete cascade,
  coins_awarded   int  not null default 5,
  completed_at    timestamptz not null default now(),
  unique(chapter_id, reader_id)
);

alter table public.chapter_read_completions enable row level security;

-- Readers can see their own completions
create policy "crc_reader_select" on public.chapter_read_completions
  for select using (reader_id = auth.uid());

-- Manuscript owner can see completions for their manuscript
create policy "crc_owner_select" on public.chapter_read_completions
  for select using (
    exists (
      select 1 from public.manuscripts m
      where m.id = manuscript_id and m.owner_id = auth.uid()
    )
  );

-- Only the RPC function (security definer) inserts; no direct user insert policy needed.

-- ─────────────────────────────────────────────────────────────────────────────
-- award_chapter_coins(p_chapter_id, p_manuscript_id)
--   Checks eligibility, inserts a completion record, increments the wallet,
--   and logs the transaction. Safe to call multiple times — idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.award_chapter_coins(
  p_chapter_id    uuid,
  p_manuscript_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reader_id  uuid := auth.uid();
  v_coins      int  := 5;
  v_new_balance bigint;
begin
  if v_reader_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Already completed this chapter — return gracefully
  if exists (
    select 1 from chapter_read_completions
    where chapter_id = p_chapter_id and reader_id = v_reader_id
  ) then
    return jsonb_build_object('success', false, 'reason', 'already_completed');
  end if;

  -- Must hold an access grant (beta reader) — owners do not earn coins
  if not exists (
    select 1 from manuscript_access_grants
    where manuscript_id = p_manuscript_id and reader_id = v_reader_id
  ) then
    return jsonb_build_object('success', false, 'reason', 'no_grant');
  end if;

  -- Record the completion
  insert into chapter_read_completions(chapter_id, manuscript_id, reader_id, coins_awarded)
  values (p_chapter_id, p_manuscript_id, v_reader_id, v_coins);

  -- Credit the wallet
  update public.accounts
  set bloom_coins = bloom_coins + v_coins,
      updated_at  = now()
  where user_id = v_reader_id
  returning bloom_coins into v_new_balance;

  if v_new_balance is null then
    raise exception 'Account not found';
  end if;

  -- Audit log
  insert into public.bloom_coin_ledger(user_id, delta, reason, metadata)
  values (
    v_reader_id,
    v_coins,
    'chapter_feedback_reward',
    jsonb_build_object(
      'chapter_id',    p_chapter_id,
      'manuscript_id', p_manuscript_id,
      'coins',         v_coins
    )
  );

  return jsonb_build_object(
    'success',       true,
    'coins_awarded', v_coins,
    'new_balance',   v_new_balance
  );
end;
$$;

grant execute on function public.award_chapter_coins(uuid, uuid) to authenticated;
