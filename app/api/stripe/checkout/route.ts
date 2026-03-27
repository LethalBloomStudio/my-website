import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import { stripe, COIN_PACKAGES, SUBSCRIPTION_PLANS } from "@/lib/stripe";
import type { CoinPackageId, SubscriptionPlanId } from "@/lib/stripe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function POST(req: Request) {
  try {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  const userEmail = auth?.user?.email;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    type: "coins" | "subscription";
    package_id?: string;
    plan?: string;
    // optional: gift coins to a child
    gift_to?: string;
  };

  // ── Coins ──────────────────────────────────────────────────────────────────
  if (body.type === "coins") {
    const pkg = COIN_PACKAGES[body.package_id as CoinPackageId];
    if (!pkg) return NextResponse.json({ error: "Invalid package." }, { status: 400 });

    const recipientId = body.gift_to ?? userId;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: userEmail ?? undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: pkg.label },
            unit_amount: pkg.amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "coins",
        package_id: body.package_id!,
        user_id: userId,
        recipient_id: recipientId,
        coins: String(pkg.coins),
      },
      success_url: `${SITE_URL}/wallet?success=1`,
      cancel_url: `${SITE_URL}/wallet?canceled=1`,
    });

    return NextResponse.json({ url: session.url });
  }

  // ── Subscription ────────────────────────────────────────────────────────────
  if (body.type === "subscription") {
    const plan = SUBSCRIPTION_PLANS[body.plan as SubscriptionPlanId];
    if (!plan) return NextResponse.json({ error: "Invalid plan." }, { status: 400 });

    // Retrieve or create Stripe customer so we can link subscriptions to this user
    const { data: acct } = await supabase
      .from("accounts")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId = (acct as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail ?? undefined,
        metadata: { user_id: userId },
      });
      customerId = customer.id;
      await supabaseAdmin().from("accounts").update({ stripe_customer_id: customerId }).eq("user_id", userId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: plan.label },
            unit_amount: plan.amount,
            recurring: { interval: plan.interval },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "subscription",
        plan_id: body.plan!,
        user_id: userId,
      },
      subscription_data: {
        metadata: {
          plan_id: body.plan!,
          user_id: userId,
        },
      },
      success_url: `${SITE_URL}/subscription?success=1`,
      cancel_url: `${SITE_URL}/subscription?canceled=1`,
    });

    return NextResponse.json({ url: session.url });
  }

  return NextResponse.json({ error: "Invalid type." }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[checkout] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
