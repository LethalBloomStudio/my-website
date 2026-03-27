import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { getStripe, COIN_PACKAGES } from "@/lib/stripe";
import type { CoinPackageId } from "@/lib/stripe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  const userEmail = auth?.user?.email;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { package_id?: string; gift_to?: string };
  const packageId = String(body.package_id ?? "").trim() as CoinPackageId;
  const pkg = COIN_PACKAGES[packageId];
  if (!pkg) return NextResponse.json({ error: "Invalid package." }, { status: 400 });

  const recipientId = body.gift_to ?? userId;

  const session = await getStripe().checkout.sessions.create({
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
      package_id: packageId,
      user_id: userId,
      recipient_id: recipientId,
      coins: String(pkg.coins),
    },
    success_url: `${SITE_URL}/wallet?success=1`,
    cancel_url: `${SITE_URL}/wallet?canceled=1`,
  });

  return NextResponse.json({ ok: true, url: session.url });
}
