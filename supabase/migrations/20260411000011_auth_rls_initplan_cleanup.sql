-- Performance cleanup for RLS policies that call auth.uid() directly.
-- Rewrites affected public-schema policies to use (select auth.uid()) so
-- Postgres can evaluate the auth lookup once per query instead of per row.

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
