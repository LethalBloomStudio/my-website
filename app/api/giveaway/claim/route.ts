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
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { post_id, reward_coins } = (await req.json()) as {
    post_id: string;
    reward_coins: number;
  };
  if (!post_id || !reward_coins) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Verify this user is the declared winner
  const { data: postRow } = await supabase
    .from("discussion_posts")
    .select("winner_id, winner_drawn, coin_prize, ends_at")
    .eq("id", post_id)
    .maybeSingle();

  const p = postRow as {
    winner_id: string | null;
    winner_drawn: boolean;
    coin_prize: number | null;
    ends_at: string | null;
  } | null;

  if (!p || !p.winner_drawn || p.winner_id !== user.id) {
    return NextResponse.json({ error: "You are not the winner of this giveaway" }, { status: 403 });
  }
  if (p.coin_prize !== reward_coins) {
    return NextResponse.json({ error: "Invalid reward amount" }, { status: 400 });
  }

  // 7-day claim window from when the giveaway ended
  const endedAt = p.ends_at ? new Date(p.ends_at).getTime() : 0;
  if (Date.now() - endedAt > 7 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Claim window expired" }, { status: 410 });
  }

  // Record the claim (unique constraint prevents double-claim)
  const { error: claimError } = await supabase
    .from("giveaway_claims")
    .insert({ post_id, user_id: user.id });

  if (claimError) {
    if (claimError.code === "23505") {
      return NextResponse.json({ error: "Already claimed" }, { status: 409 });
    }
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  // Credit coins
  const { data: accRow } = await supabase
    .from("accounts")
    .select("bloom_coins")
    .eq("user_id", user.id)
    .maybeSingle();
  const current = Number((accRow as { bloom_coins?: number | null } | null)?.bloom_coins ?? 0);
  const newBalance = current + reward_coins;

  await supabase.from("accounts").update({ bloom_coins: newBalance }).eq("user_id", user.id);

  await supabase.from("bloom_coin_ledger").insert({
    user_id: user.id,
    delta: reward_coins,
    reason: "giveaway_win",
    metadata: { post_id },
  });

  return NextResponse.json({ ok: true, new_balance: newBalance });
}
