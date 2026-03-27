import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

// Stripe sends the raw body — Next.js must NOT parse it
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }
  if (!webhookSecret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET env var." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Webhook verification failed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const admin = supabaseAdmin();

  switch (event.type) {
    // ── One-time coin purchase completed ──────────────────────────────────────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "payment") break;

      const { user_id, recipient_id, package_id, coins } = session.metadata ?? {};
      if (!user_id || !recipient_id || !coins) break;

      const coinsNum = Number(coins);

      // Credit coins to recipient
      const { data: acct } = await admin
        .from("accounts")
        .select("bloom_coins")
        .eq("user_id", recipient_id)
        .maybeSingle();

      const current = (acct as { bloom_coins?: number } | null)?.bloom_coins ?? 0;

      await admin
        .from("accounts")
        .update({ bloom_coins: current + coinsNum, updated_at: new Date().toISOString() })
        .eq("user_id", recipient_id);

      // Ledger entry
      await admin.from("bloom_coin_ledger").insert({
        user_id: recipient_id,
        delta: coinsNum,
        reason: "coin_purchase",
        metadata: {
          package_id,
          stripe_session_id: session.id,
          price_cents: session.amount_total,
          currency: session.currency,
          gifted_by: user_id !== recipient_id ? user_id : null,
        },
      });

      // Notify recipient if it's a gift
      if (user_id !== recipient_id) {
        await admin.from("system_notifications").insert({
          user_id: recipient_id,
          category: "account_action",
          title: "Bloom Coins Received!",
          body: `Your parent account sent you ${coinsNum} Bloom Coins.`,
          severity: "info",
          dedupe_key: `coin-gift-${session.id}`,
        });
      }

      break;
    }

    // ── Subscription created or updated ──────────────────────────────────────
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const { user_id, plan_id } = sub.metadata ?? {};
      if (!user_id || !plan_id) break;

      const isActive = sub.status === "active" || sub.status === "trialing";
      const newStatus = isActive ? plan_id : "free";

      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

      await admin
        .from("accounts")
        .update({
          subscription_status: newStatus,
          stripe_subscription_id: sub.id,
          ...(customerId ? { stripe_customer_id: customerId } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id);

      if (isActive) {
        await admin.from("system_notifications").insert({
          user_id,
          category: "account_action",
          title: "Subscription Active",
          body: `Your Lethal Member subscription is now active. Enjoy the benefits!`,
          severity: "info",
          dedupe_key: `sub-active-${sub.id}`,
        });
      }

      break;
    }

    // ── Subscription cancelled / expired ─────────────────────────────────────
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const { user_id } = sub.metadata ?? {};
      if (!user_id) break;

      await admin
        .from("accounts")
        .update({
          subscription_status: "free",
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id);

      await admin.from("system_notifications").insert({
        user_id,
        category: "account_action",
        title: "Subscription Ended",
        body: "Your Lethal Member subscription has ended. You've been moved to the free tier.",
        severity: "info",
        dedupe_key: `sub-ended-${sub.id}`,
      });

      break;
    }

    // ── Payment failed ────────────────────────────────────────────────────────
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;

      const { data: acct } = await admin
        .from("accounts")
        .select("user_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();

      const userId = (acct as { user_id?: string } | null)?.user_id;
      if (!userId) break;

      await admin.from("system_notifications").insert({
        user_id: userId,
        category: "account_action",
        title: "Payment Failed",
        body: "We couldn't process your subscription payment. Please update your billing details to keep your membership active.",
        severity: "warning",
        dedupe_key: `payment-failed-${invoice.id}`,
      });

      break;
    }
  }

  return NextResponse.json({ received: true });
}
