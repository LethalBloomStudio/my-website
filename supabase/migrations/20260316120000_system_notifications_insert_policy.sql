drop policy if exists "system_notifications_insert_authenticated" on public.system_notifications;
create policy "system_notifications_insert_authenticated"
on public.system_notifications for insert
with check (auth.uid() is not null);
