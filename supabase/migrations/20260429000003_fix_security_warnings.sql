-- ─── 1. Fix mutable search_path on all security definer functions ────────────
-- Dynamically sets search_path = public on every security definer function in
-- the public schema that is still missing a fixed search_path. Covers functions
-- that were recreated by later migrations after the April 11 manual patch.

do $$
declare
  r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, '{}')) as cfg
        where cfg like 'search_path=%'
      )
  loop
    execute format(
      'alter function public.%I(%s) set search_path = public',
      r.proname, r.args
    );
  end loop;
end $$;


-- ─── 2. Revoke anon execute on admin-only functions ──────────────────────────
-- PostgreSQL grants EXECUTE to PUBLIC by default on every new function.
-- admin_* functions are only ever called server-side via the service role,
-- which bypasses all grants. Revoking from PUBLIC removes anon access while
-- a follow-up grant to authenticated preserves client-side admin-panel calls.

do $$
declare
  r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and p.proname like 'admin\_%'
  loop
    execute format(
      'revoke execute on function public.%I(%s) from public',
      r.proname, r.args
    );
    -- Grant back to authenticated so admin panel client-side calls keep working.
    -- Each function enforces is_admin internally anyway.
    execute format(
      'grant execute on function public.%I(%s) to authenticated',
      r.proname, r.args
    );
  end loop;
end $$;

-- apply_signup_referral is triggered server-side by the handle_new_user trigger
-- or service-role API routes; anon never needs to call it directly.
do $$
declare
  r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'apply_signup_referral'
  loop
    execute format(
      'revoke execute on function public.%I(%s) from public',
      r.proname, r.args
    );
    execute format(
      'grant execute on function public.%I(%s) to authenticated',
      r.proname, r.args
    );
  end loop;
end $$;


-- ─── 3. Fix always-true RLS policies ─────────────────────────────────────────

-- posts table: stale Supabase starter policy, not used by the app.
drop policy if exists "Enable insert for authenticated users only" on public.posts;

-- deleted_accounts: "service role manages deleted_accounts" has using(true) /
-- with_check(true) for ALL operations on all roles. Service role bypasses RLS
-- anyway, so this policy is redundant and dangerous. Drop it — service role
-- still has full access, regular users get blocked by RLS with no policy.
drop policy if exists "service role manages deleted_accounts" on public.deleted_accounts;

-- user_feedback_insert: the initplan rewrite (Step 2) may have corrupted this
-- policy to with_check(true). Recreate it with the correct condition.
drop policy if exists "user_feedback_insert" on public.user_feedback;
create policy "user_feedback_insert"
  on public.user_feedback for insert
  with check (
    user_id is null
    or user_id = (select auth.uid())
  );
