import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

type Body = {
  manuscript_id: string;
  reader_id: string;
  amount: number;
  reward_reason: string;
};

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const authorId = auth?.user?.id;
  if (!authorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { manuscript_id, reader_id, amount, reward_reason } = (await req.json()) as Body;
  if (!manuscript_id || !reader_id || !amount || !reward_reason) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (![5, 10].includes(amount)) {
    return NextResponse.json({ error: "Invalid reward amount." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Verify caller owns this manuscript
  const { data: ms } = await admin
    .from("manuscripts")
    .select("id, owner_id")
    .eq("id", manuscript_id)
    .maybeSingle();
  if (!ms || (ms as { owner_id: string }).owner_id !== authorId) {
    return NextResponse.json({ error: "Not authorised to reward on this manuscript." }, { status: 403 });
  }

  // Record reader's receipt in the ledger
  await admin.from("bloom_coin_ledger").insert({
    user_id: reader_id,
    delta: amount,
    reason: "author_reward",
    metadata: { manuscript_id, from_user_id: authorId, reward_reason },
  });

  return NextResponse.json({ ok: true });
}
