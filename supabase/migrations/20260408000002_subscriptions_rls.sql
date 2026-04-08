-- Enable RLS on public.subscriptions and allow users to read their own row.
-- All writes go through the service-role admin client (Stripe webhook) so
-- no insert/update/delete policies are needed for regular users.
alter table public.subscriptions enable row level security;

create policy "Users can read own subscription"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);
