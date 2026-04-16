import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const parentId = auth?.user?.id;
  if (!parentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { link_id?: string; tier?: string };
  const { link_id, tier } = body;
  if (!link_id || (tier !== "free" && tier !== "unlimited")) {
    return NextResponse.json({ error: "Missing or invalid fields." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Verify the link belongs to this parent and get the child's user ID
  const { data: link } = await admin
    .from("youth_links")
    .select("id, child_user_id, subscription_tier")
    .eq("id", link_id)
    .eq("parent_user_id", parentId)
    .maybeSingle();

  if (!link) return NextResponse.json({ error: "Access denied." }, { status: 403 });

  // The "unlimited" add-on is billed through the parent's Lethal subscription.
  // Verify the parent is actually an active Lethal member before granting it.
  if (tier === "unlimited") {
    const { data: parentAcct } = await admin
      .from("accounts")
      .select("subscription_status, active_promotion_id, promotion_expires_at")
      .eq("user_id", parentId)
      .maybeSingle();
    const parentStatus = ((parentAcct as { subscription_status?: string | null } | null)?.subscription_status ?? "").toLowerCase();
    const parentIsLethal = parentStatus.includes("lethal");
    const onPromo = !!(
      (parentAcct as { active_promotion_id?: string | null; promotion_expires_at?: string | null } | null)?.active_promotion_id &&
      (parentAcct as { promotion_expires_at?: string | null } | null)?.promotion_expires_at &&
      new Date((parentAcct as { promotion_expires_at: string }).promotion_expires_at) > new Date()
    );
    if (!parentIsLethal && !onPromo) {
      return NextResponse.json(
        { error: "You must have an active Lethal Member subscription to add the Unlimited add-on for a youth account." },
        { status: 403 }
      );
    }
  }

  const childUserId = (link as { child_user_id?: string | null }).child_user_id ?? null;

  await admin
    .from("youth_links")
    .update({ subscription_tier: tier, updated_at: new Date().toISOString() })
    .eq("id", link_id);

  // Sync subscription_status on the child's account.
  // - "unlimited" is the parent-paid add-on ($5/mo) — grant lethal access immediately.
  // - "free" downgrades from the parent add-on — revoke lethal access.
  //   (Only revoke if the child has no independent Stripe subscription of their own.)
  // - "lethal_standalone" is billed independently via Stripe ($10/mo) — access is
  //   granted/revoked exclusively by the Stripe webhook, not here.
  if (childUserId) {
    if (tier === "unlimited") {
      await admin
        .from("accounts")
        .update({ subscription_status: "lethal", updated_at: new Date().toISOString() })
        .eq("user_id", childUserId);
    } else if (tier === "free") {
      await admin
        .from("accounts")
        .update({ subscription_status: "free", updated_at: new Date().toISOString() })
        .eq("user_id", childUserId);
    }
  }

  return NextResponse.json({ ok: true });
}
