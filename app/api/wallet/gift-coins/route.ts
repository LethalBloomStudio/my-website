import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

const PACKAGES: Record<string, number> = {
  starter_100: 100,
  writer_350: 350,
  studio_600: 600,
};

type Body = { package_id?: string; child_user_id?: string };

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const parentId = auth?.user?.id;
  if (!parentId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { package_id, child_user_id } = (await req.json()) as Body;
  const coins = PACKAGES[String(package_id ?? "")];
  if (!coins) return NextResponse.json({ error: "Invalid package." }, { status: 400 });
  if (!child_user_id) return NextResponse.json({ error: "Missing child user ID." }, { status: 400 });

  const admin = supabaseAdmin();

  // Verify the parent-child link is active
  const { data: link } = await admin
    .from("youth_links")
    .select("id, child_name")
    .eq("parent_user_id", parentId)
    .eq("child_user_id", child_user_id)
    .eq("status", "active")
    .maybeSingle();

  if (!link) return NextResponse.json({ error: "No active link found for this child." }, { status: 403 });

  const _row = link as { id: string; child_name: string };

  // Credit coins to child's account
  const { data: childAcct } = await admin
    .from("accounts")
    .select("bloom_coins")
    .eq("user_id", child_user_id)
    .maybeSingle();

  const currentBalance = Number((childAcct as { bloom_coins?: number } | null)?.bloom_coins ?? 0);
  const newBalance = currentBalance + coins;

  await admin
    .from("accounts")
    .update({ bloom_coins: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", child_user_id);

  // Insert ledger entry for child
  await admin.from("bloom_coin_ledger").insert({
    user_id: child_user_id,
    delta: coins,
    reason: "parent_gift",
    created_at: new Date().toISOString(),
  });

  // Notify child
  await admin.from("system_notifications").insert({
    user_id: child_user_id,
    category: "socials",
    title: "Your parent sent you Bloom Coins!",
    body: `${coins} Bloom Coins have been added to your wallet.`,
    severity: "info",
  });

  return NextResponse.json({ ok: true, coins_added: coins, new_balance: newBalance });
}
