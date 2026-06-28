import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { birthday_award_id?: string };
  if (!body.birthday_award_id) return NextResponse.json({ error: "Missing birthday_award_id" }, { status: 400 });

  // Atomically claim the award: the UPDATE only matches a row that is still
  // unclaimed, so concurrent requests race on the same row and only one can
  // win -- the loser's UPDATE matches zero rows and .single() returns null.
  const { data: award } = await supabase
    .from("birthday_coin_awards")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", body.birthday_award_id)
    .eq("user_id", userId)
    .is("claimed_at", null)
    .select("id, coins_awarded")
    .single();

  if (!award) return NextResponse.json({ error: "Already claimed" }, { status: 409 });

  const coins = award.coins_awarded as number;

  // Credit coins via the established RPC (UPDATE accounts + no ledger)
  const { error: rpcErr } = await supabase.rpc("increment_bloom_coins", {
    p_user_id: userId,
    p_amount: coins,
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

  // Write ledger entry
  await supabase.from("bloom_coin_ledger").insert({
    user_id: userId,
    delta: coins,
    reason: "birthday_reward",
    metadata: { birthday_award_id: body.birthday_award_id },
  });

  const { data: acct } = await supabase
    .from("accounts")
    .select("bloom_coins")
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    new_balance: (acct as { bloom_coins?: number } | null)?.bloom_coins ?? null,
  });
}
