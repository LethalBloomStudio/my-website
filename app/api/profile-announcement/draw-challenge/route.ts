import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function POST(req: Request) {
  const { announcement_id } = (await req.json()) as { announcement_id: string };
  if (!announcement_id) return NextResponse.json({ error: "Missing announcement_id" }, { status: 400 });

  const supabase = adminClient();

  const { data: annRow } = await supabase
    .from("profile_announcements")
    .select("id, user_id, type, title, coin_prize, ends_at, winner_drawn")
    .eq("id", announcement_id)
    .maybeSingle();

  const ann = annRow as {
    id: string;
    user_id: string;
    type: string;
    title: string;
    coin_prize: number | null;
    ends_at: string | null;
    winner_drawn: boolean;
  } | null;

  if (!ann || ann.type !== "challenge") {
    return NextResponse.json({ error: "Not a challenge post" }, { status: 400 });
  }
  if (ann.winner_drawn) {
    return NextResponse.json({ ok: true, already_drawn: true });
  }
  if (!ann.ends_at || new Date(ann.ends_at) > new Date()) {
    return NextResponse.json({ error: "Challenge has not ended yet" }, { status: 400 });
  }

  // Find qualifying users: must have BOTH liked and commented
  const [{ data: likes }, { data: commentRows }] = await Promise.all([
    supabase.from("profile_announcement_likes").select("user_id").eq("announcement_id", announcement_id),
    supabase.from("profile_announcement_comments").select("user_id").eq("announcement_id", announcement_id),
  ]);

  const likerSet = new Set(((likes ?? []) as { user_id: string }[]).map((l) => l.user_id));
  const commenterSet = new Set(((commentRows ?? []) as { user_id: string }[]).map((c) => c.user_id));
  // Exclude the post owner from winning their own challenge
  const qualifying = [...likerSet].filter((id) => commenterSet.has(id) && id !== ann.user_id);

  if (qualifying.length === 0) {
    await supabase
      .from("profile_announcements")
      .update({ winner_drawn: true })
      .eq("id", announcement_id);
    return NextResponse.json({ ok: true, winner_id: null, message: "No qualifying entries" });
  }

  const winnerId = qualifying[Math.floor(Math.random() * qualifying.length)];

  // Credit winner's wallet
  const prize = ann.coin_prize ?? 0;
  if (prize > 0) {
    const { data: winnerAccount } = await supabase
      .from("accounts")
      .select("bloom_coins")
      .eq("user_id", winnerId)
      .maybeSingle();
    const winnerRow = winnerAccount as { bloom_coins: number } | null;
    if (winnerRow) {
      await supabase
        .from("accounts")
        .update({ bloom_coins: winnerRow.bloom_coins + prize })
        .eq("user_id", winnerId);
    }
  }

  // Mark winner on announcement
  await supabase
    .from("profile_announcements")
    .update({ winner_id: winnerId, winner_drawn: true })
    .eq("id", announcement_id);

  const { data: prof } = await supabase
    .from("public_profiles")
    .select("pen_name, username")
    .eq("user_id", winnerId)
    .maybeSingle();
  const profRow = prof as { pen_name: string | null; username: string | null } | null;
  const winnerName = profRow?.pen_name ?? profRow?.username ?? "a lucky reader";

  // Notify the winner
  if (prize > 0) {
    await supabase.from("system_notifications").insert({
      user_id: winnerId,
      title: "🎉 You won a Bloom Coin Challenge!",
      body: `You were selected as the winner of "${ann.title}" and earned ${prize} Bloom Coins!`,
      metadata: { announcement_id, reward_coins: prize },
    });
  }

  return NextResponse.json({ ok: true, winner_id: winnerId, winner_name: winnerName });
}
