-- Logs every successful Stripe subscription invoice payment.
-- Populated by the invoice.paid webhook handler.

create table if not exists public.stripe_billing_events (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete set null,
  stripe_customer_id    text not null,
  stripe_invoice_id     text not null unique,
  stripe_subscription_id text,
  amount_cents          integer not null default 0,
  currency              text not null default 'usd',
  plan_id               text,
  billing_reason        text,  -- 'subscription_create', 'subscription_cycle', etc.
  period_start          timestamptz,
  period_end            timestamptz,
  created_at            timestamptz not null default now()
);

-- Admins need full read access; users should not see each other's billing rows.
alter table public.stripe_billing_events enable row level security;

create policy "Admin full access to stripe_billing_events"
  on public.stripe_billing_events
  for all
  using (
    exists (
      select 1 from public.accounts
      where accounts.user_id = auth.uid()
        and accounts.is_admin = true
    )
  );
