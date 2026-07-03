-- Re-runs the initplan cleanup from 20260411000011 to catch policies added after that date.
-- Affects: referrals (Apr 20), hidden_message_threads (Apr 21),
--          group_message_conversations/members/messages (Apr 24),
--          group_message_member_rls_recursion fixes (Apr 26).
--
-- Replaces bare auth.uid() with (select auth.uid()) in all public RLS policies
-- so Postgres evaluates the auth lookup once per query instead of once per row.

do $$
declare
  r record;
  roles_sql text;
  create_sql text;
  using_sql text;
  check_sql text;
begin
  for r in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%auth.uid()%'
      )
      -- Idempotency guard: skip policies already wrapped by a prior run of this
      -- (or the April 11) cleanup. Without this, the substring 'auth.uid()' still
      -- matches inside an already-wrapped '(select auth.uid())', so a naive rerun
      -- would double-wrap it into '(select (select auth.uid()))'.
      and coalesce(qual, '') not like '%(select auth.uid())%'
      and coalesce(with_check, '') not like '%(select auth.uid())%'
  loop
    select string_agg(quote_ident(role_name), ', ')
      into roles_sql
    from unnest(r.roles) as role_name;

    using_sql := case
      when r.qual is null then ''
      else ' using (' || replace(r.qual, 'auth.uid()', '(select auth.uid())') || ')'
    end;

    check_sql := case
      when r.with_check is null then ''
      else ' with check (' || replace(r.with_check, 'auth.uid()', '(select auth.uid())') || ')'
    end;

    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);

    create_sql :=
      format(
        'create policy %I on %I.%I as %s for %s to %s%s%s',
        r.policyname,
        r.schemaname,
        r.tablename,
        lower(r.permissive),
        lower(r.cmd),
        roles_sql,
        using_sql,
        check_sql
      );

    execute create_sql;
  end loop;
end
$$;
