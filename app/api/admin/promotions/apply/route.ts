import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

async function requireAdmin() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = supabaseAdmin();
  const { data } = await admin.from("accounts").select("is_admin").eq("user_id", user.id).maybeSingle();
  if (!(data as { is_admin?: boolean } | null)?.is_admin) return null;
  return { user, admin };
}

// POST — apply a promotion to all eligible existing free users
export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { promotion_id } = (await req.json()) as { promotion_id: string };
  if (!promotion_id) return NextResponse.json({ error: "promotion_id required." }, { status: 400 });

  const { data: promo } = await ctx.admin
    .from("promotions")
    .select("*")
    .eq("id", promotion_id)
    .eq("status", "active")
    .maybeSingle();

  if (!promo) return NextResponse.json({ error: "Promotion not found or not active." }, { status: 404 });

  const p = promo as {
    id: string; duration_days: number; bonus_coins: number;
    max_users: number | null; enrolled_count: number; applies_to: string;
  };

  if (!["all_free", "both"].includes(p.applies_to)) {
    return NextResponse.json({ error: "This promotion only applies to new signups." }, { status: 400 });
  }

  // Fetch all free users not already on a promotion and not lethal members
  const { data: freeUsers } = await ctx.admin
    .from("accounts")
    .select("user_id, bloom_coins")
    .eq("subscription_status", "free")
    .is("active_promotion_id", null)
    .eq("account_status", "active");

  const eligible = (freeUsers as { user_id: string; bloom_coins: number }[] | null) ?? [];

  let toApply = eligible;
  if (p.max_users !== null) {
    const remaining = p.max_users - p.enrolled_count;
    if (remaining <= 0) return NextResponse.json({ error: "Promotion has reached its user limit." }, { status: 400 });
    toApply = eligible.slice(0, remaining);
  }

  if (toApply.length === 0) {
    return NextResponse.json({ ok: true, applied: 0, message: "No eligible free users found." });
  }

  const expiresAt = new Date(Date.now() + p.duration_days * 24 * 60 * 60 * 1000).toISOString();

  // Apply promotion in batches of 100
  let applied = 0;
  for (let i = 0; i < toApply.length; i += 100) {
    const batch = toApply.slice(i, i + 100);
    const userIds = batch.map((u) => u.user_id);

    await ctx.admin
      .from("accounts")
      .update({ active_promotion_id: p.id, promotion_expires_at: expiresAt })
      .in("user_id", userIds);

    // Award bonus coins if set
    if (p.bonus_coins > 0) {
      for (const u of batch) {
        await ctx.admin
          .from("accounts")
          .update({ bloom_coins: u.bloom_coins + p.bonus_coins })
          .eq("user_id", u.user_id);
        await ctx.admin.from("bloom_coin_ledger").insert({
          user_id: u.user_id,
          delta: p.bonus_coins,
          reason: "promotion_bonus",
          metadata: { promotion_id: p.id },
        });
      }
    }

    // Notify users
    const notifications = batch.map((u) => ({
      user_id: u.user_id,
      title: "You've been enrolled in a promotion! ✿",
      body: `You now have Lethal Member benefits for ${p.duration_days} days as part of a special promotion.`,
      category: "socials",
      severity: "info",
    }));
    await ctx.admin.from("system_notifications").insert(notifications);

    applied += batch.length;
  }

  // Update enrolled_count on the promotion
  await ctx.admin
    .from("promotions")
    .update({ enrolled_count: p.enrolled_count + applied })
    .eq("id", p.id);

  return NextResponse.json({ ok: true, applied });
}
