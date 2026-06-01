import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function verifyAdmin(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const supabase = adminClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data } = await supabase.from("accounts").select("is_admin").eq("user_id", user.id).maybeSingle();
  const acc = data as { is_admin?: boolean } | null;
  return acc?.is_admin ? user.id : null;
}

export async function GET(req: Request) {
  const adminId = await verifyAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const supabase = adminClient();

  const [{ data: billingData }, { data: coinData }] = await Promise.all([
    supabase
      .from("stripe_billing_events")
      .select("id, stripe_invoice_id, stripe_subscription_id, amount_cents, currency, billing_reason, period_start, period_end, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("bloom_coin_ledger")
      .select("id, delta, reason, metadata, created_at")
      .eq("user_id", userId)
      .eq("reason", "coin_purchase")
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    billingEvents: billingData ?? [],
    coinPurchases: coinData ?? [],
  });
}
