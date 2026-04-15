import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();

  // Verify the user
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { announcement_id: string; reward_coins: number };
  const { announcement_id, reward_coins } = body;

  if (!announcement_id || ![5, 10, 25, 50, 75, 100].includes(reward_coins)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Verify the announcement exists, has this reward amount, and is within the 7-day claim window
  const { data: ann } = await supabase
    .from("admin_announcements")
    .select("id, reward_coins, created_at")
    .eq("id", announcement_id)
    .maybeSingle();

  const annRow = ann as { id: string; reward_coins: number | null; created_at: string } | null;
  if (!annRow || annRow.reward_coins !== reward_coins) {
    return NextResponse.json({ error: "Invalid announcement or reward amount" }, { status: 400 });
  }

  const ageMs = Date.now() - new Date(annRow.created_at).getTime();
  if (ageMs > 7 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Claim window expired" }, { status: 410 });
  }

  // Check if already claimed (insert fails on duplicate primary key)
  const { error: claimError } = await supabase
    .from("announcement_coin_claims")
    .insert({ announcement_id, user_id: user.id });

  if (claimError) {
    // Unique violation = already claimed
    if (claimError.code === "23505") {
      return NextResponse.json({ error: "Already claimed" }, { status: 409 });
    }
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  // Credit coins to user - admin source, so no balance deduction needed
  const { data: accRow } = await supabase
    .from("accounts")
    .select("bloom_coins")
    .eq("user_id", user.id)
    .maybeSingle();
  const current = Number((accRow as { bloom_coins?: number | null } | null)?.bloom_coins ?? 0);
  const newBalance = current + reward_coins;

  const { error: updateError } = await supabase
    .from("accounts")
    .update({ bloom_coins: newBalance })
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Record in the ledger so the transaction appears in wallet history
  await supabase.from("bloom_coin_ledger").insert({
    user_id: user.id,
    delta: reward_coins,
    reason: "announcement_reward",
    metadata: { announcement_id },
  });

  return NextResponse.json({ ok: true, new_balance: newBalance });
}
