import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import { getStripe } from "@/lib/stripe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Opens the Stripe Customer Portal so users can manage/cancel their subscription
export async function POST() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: acct } = await supabase
      .from("accounts")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId = (acct as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;

    // Fallback: look up by email in Stripe and save if found
    if (!customerId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        const customers = await getStripe().customers.list({ email: user.email, limit: 1 });
        if (customers.data.length > 0) {
          customerId = customers.data[0].id;
          await supabaseAdmin().from("accounts").update({ stripe_customer_id: customerId }).eq("user_id", userId);
        }
      }
    }

    if (!customerId) {
      return NextResponse.json({ error: "No billing account found. Please subscribe first." }, { status: 404 });
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${SITE_URL}/subscription`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to open billing portal.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
