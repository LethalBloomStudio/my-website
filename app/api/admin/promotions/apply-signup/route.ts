import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/Supabase/admin";

// Called server-side after a new user account is created.
// Checks for any active promotion that targets new signups and applies it.
export async function POST(req: Request) {
  const { user_id } = (await req.json()) as { user_id: string };
  if (!user_id) return NextResponse.json({ ok: false });

  const admin = supabaseAdmin();

  // Find the most recently created active promotion that covers new signups
  const { data: promos } = await admin
    .from("promotions")
    .select("*")
    .eq("status", "active")
    .in("applies_to", ["new_signups", "both"])
    .order("created_at", { ascending: false })
    .limit(1);

  const promo = (promos as Array<{
    id: string; duration_days: number; bonus_coins: number;
    max_users: number | null; enrolled_count: number;
  }> | null)?.[0];

  if (!promo) return NextResponse.json({ ok: true, enrolled: false });

  // Check user cap
  if (promo.max_users !== null && promo.enrolled_count >= promo.max_users) {
    return NextResponse.json({ ok: true, enrolled: false, reason: "cap_reached" });
  }

  const expiresAt = new Date(Date.now() + promo.duration_days * 24 * 60 * 60 * 1000).toISOString();

  // Apply promotion to user
  await admin
    .from("accounts")
    .update({ active_promotion_id: promo.id, promotion_expires_at: expiresAt })
    .eq("user_id", user_id);

  // Award bonus coins
  if (promo.bonus_coins > 0) {
    const { data: acct } = await admin.from("accounts").select("bloom_coins").eq("user_id", user_id).maybeSingle();
    const current = Number((acct as { bloom_coins?: number } | null)?.bloom_coins ?? 0);
    await admin.from("accounts").update({ bloom_coins: current + promo.bonus_coins }).eq("user_id", user_id);
    await admin.from("bloom_coin_ledger").insert({
      user_id,
      delta: promo.bonus_coins,
      reason: "promotion_bonus",
      metadata: { promotion_id: promo.id },
    });
  }

  // Increment enrolled count
  await admin.from("promotions").update({ enrolled_count: promo.enrolled_count + 1 }).eq("id", promo.id);

  return NextResponse.json({ ok: true, enrolled: true, expires_at: expiresAt });
}
