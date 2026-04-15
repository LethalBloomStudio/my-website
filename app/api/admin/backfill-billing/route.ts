export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import type Stripe from "stripe";

async function verifyAdmin(): Promise<boolean> {
  const serverClient = await supabaseServer();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return false;
  const admin = supabaseAdmin();
  const { data } = await admin.from("accounts").select("is_admin").eq("user_id", user.id).maybeSingle();
  return (data as { is_admin?: boolean } | null)?.is_admin === true;
}

export async function POST() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  const admin = supabaseAdmin();

  // Fetch all paid invoices from Stripe (paginated)
  const invoices: Stripe.Invoice[] = [];
  let hasMore = true;
  let startingAfter: string | undefined = undefined;

  while (hasMore) {
    const page: Stripe.ApiList<Stripe.Invoice> = await stripe.invoices.list({
      status: "paid",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    invoices.push(...page.data);
    hasMore = page.has_more;
    if (page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id;
    }
  }

  // Only keep subscription invoices
  const subInvoices = invoices.filter(inv => inv.parent?.type === "subscription_details");

  let inserted = 0;
  let skipped = 0;

  for (const invoice of subInvoices) {
    const customerId = typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer as { id?: string } | null)?.id ?? null;
    if (!customerId) { skipped++; continue; }

    const subDetails = invoice.parent?.subscription_details;
    const subscriptionId = subDetails?.subscription
      ? (typeof subDetails.subscription === "string" ? subDetails.subscription : subDetails.subscription.id)
      : null;

    // Look up user by Stripe customer ID
    const { data: acct } = await admin
      .from("accounts")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    const userId = (acct as { user_id?: string } | null)?.user_id ?? null;

    const { error } = await admin.from("stripe_billing_events").insert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_invoice_id: invoice.id,
      stripe_subscription_id: subscriptionId,
      amount_cents: invoice.amount_paid ?? 0,
      currency: invoice.currency ?? "usd",
      billing_reason: invoice.billing_reason ?? null,
      period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
      period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
      created_at: new Date(invoice.created * 1000).toISOString(),
    }).single();

    if (error?.code === "23505") {
      // Unique constraint - already exists
      skipped++;
    } else if (error) {
      skipped++;
    } else {
      inserted++;
    }
  }

  return NextResponse.json({ ok: true, inserted, skipped, total: subInvoices.length });
}
