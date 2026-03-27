import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: Request) {
  const { post_id } = (await req.json()) as { post_id: string };
  if (!post_id) return NextResponse.json({ error: "Missing post_id" }, { status: 400 });

  const supabase = adminClient();

  const { data: postRow } = await supabase
    .from("discussion_posts")
    .select("id, type, title, coin_prize, ends_at, winner_drawn")
    .eq("id", post_id)
    .maybeSingle();

  const p = postRow as {
    id: string;
    type: string;
    title: string;
    coin_prize: number | null;
    ends_at: string | null;
    winner_drawn: boolean;
  } | null;

  if (!p || p.type !== "giveaway") {
    return NextResponse.json({ error: "Not a giveaway post" }, { status: 400 });
  }
  if (p.winner_drawn) {
    return NextResponse.json({ ok: true, already_drawn: true });
  }
  if (!p.ends_at || new Date(p.ends_at) > new Date()) {
    return NextResponse.json({ error: "Giveaway has not ended yet" }, { status: 400 });
  }

  // Find qualifying users: must have BOTH liked and commented
  const [{ data: likes }, { data: commentRows }] = await Promise.all([
    supabase.from("discussion_post_likes").select("user_id").eq("post_id", post_id),
    supabase.from("discussion_comments").select("author_id").eq("post_id", post_id),
  ]);

  const likerSet = new Set(((likes ?? []) as { user_id: string }[]).map((l) => l.user_id));
  const commenterSet = new Set(
    ((commentRows ?? []) as { author_id: string }[]).map((c) => c.author_id)
  );
  const qualifying = [...likerSet].filter((id) => commenterSet.has(id));

  if (qualifying.length === 0) {
    await supabase
      .from("discussion_posts")
      .update({ winner_drawn: true })
      .eq("id", post_id);
    return NextResponse.json({ ok: true, winner_id: null, message: "No qualifying entries" });
  }

  // Pick a random winner
  const winnerId = qualifying[Math.floor(Math.random() * qualifying.length)];

  await supabase
    .from("discussion_posts")
    .update({ winner_id: winnerId, winner_drawn: true })
    .eq("id", post_id);

  const { data: prof } = await supabase
    .from("public_profiles")
    .select("pen_name, username")
    .eq("user_id", winnerId)
    .maybeSingle();
  const profRow = prof as { pen_name: string | null; username: string | null } | null;
  const winnerName = profRow?.pen_name ?? profRow?.username ?? "a lucky member";

  // Notify the winner — same metadata shape the notifications page knows how to claim
  await supabase.from("system_notifications").insert({
    user_id: winnerId,
    category: "socials",
    title: "🎉 You won a Bloom Coin Giveaway!",
    body: `You were selected as the winner of "${p.title}" and earned ${p.coin_prize ?? 0} Bloom Coins! Collect your prize before the 7-day window closes.`,
    metadata: { giveaway_post_id: post_id, reward_coins: p.coin_prize ?? 0 },
  });

  return NextResponse.json({ ok: true, winner_id: winnerId, winner_name: winnerName });
}
