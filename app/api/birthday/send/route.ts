import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

const VALID_AMOUNTS = new Set([5, 10, 25, 50]);

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const senderId = auth.user?.id;
  if (!senderId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    birthday_user_id?: string;
    message?: string;
    coin_amount?: number;
  };

  const { birthday_user_id, message, coin_amount } = body;
  if (!birthday_user_id) return NextResponse.json({ error: "Missing birthday_user_id" }, { status: 400 });
  if (!message?.trim() && !coin_amount) return NextResponse.json({ error: "Provide a message, a coin amount, or both" }, { status: 400 });
  if (coin_amount !== undefined && !VALID_AMOUNTS.has(coin_amount)) {
    return NextResponse.json({ error: "Invalid coin amount — must be 5, 10, 25, or 50" }, { status: 400 });
  }
  if (senderId === birthday_user_id) return NextResponse.json({ error: "Cannot send to yourself" }, { status: 400 });

  const admin = supabaseAdmin();

  // Verify accepted friendship
  const { data: friendship } = await admin
    .from("profile_friend_requests")
    .select("id")
    .or(`and(sender_id.eq.${senderId},receiver_id.eq.${birthday_user_id}),and(sender_id.eq.${birthday_user_id},receiver_id.eq.${senderId})`)
    .eq("status", "accepted")
    .maybeSingle();

  if (!friendship) return NextResponse.json({ error: "You are not friends with this user" }, { status: 403 });

  // Resolve sender display name
  const { data: senderProfile } = await admin
    .from("public_profiles")
    .select("pen_name, username")
    .eq("user_id", senderId)
    .maybeSingle();

  const sp = senderProfile as { pen_name?: string | null; username?: string | null } | null;
  const senderName = sp?.pen_name?.trim() || sp?.username?.trim() || "A friend";

  let newSenderBalance: number | null = null;

  // ── Coin gift ──────────────────────────────────────────────────────────────
  if (coin_amount) {
    const { data: senderAcct } = await admin
      .from("accounts")
      .select("bloom_coins")
      .eq("user_id", senderId)
      .maybeSingle();

    const senderBalance = Number((senderAcct as { bloom_coins?: number } | null)?.bloom_coins ?? 0);
    if (senderBalance < coin_amount) {
      return NextResponse.json({ error: "Insufficient Bloom Coins" }, { status: 402 });
    }

    // Debit sender
    await admin
      .from("accounts")
      .update({ bloom_coins: senderBalance - coin_amount, updated_at: new Date().toISOString() })
      .eq("user_id", senderId);

    newSenderBalance = senderBalance - coin_amount;

    await admin.from("bloom_coin_ledger").insert({
      user_id: senderId,
      delta: -coin_amount,
      reason: "birthday_gift_sent",
      metadata: { recipient_id: birthday_user_id, coins: coin_amount },
    });

    // Credit recipient
    const { data: recipAcct } = await admin
      .from("accounts")
      .select("bloom_coins")
      .eq("user_id", birthday_user_id)
      .maybeSingle();

    const recipBalance = Number((recipAcct as { bloom_coins?: number } | null)?.bloom_coins ?? 0);

    await admin
      .from("accounts")
      .update({ bloom_coins: recipBalance + coin_amount, updated_at: new Date().toISOString() })
      .eq("user_id", birthday_user_id);

    await admin.from("bloom_coin_ledger").insert({
      user_id: birthday_user_id,
      delta: coin_amount,
      reason: "birthday_gift_received",
      metadata: { sender_id: senderId, coins: coin_amount },
    });
  }

  // ── Notification to birthday user ──────────────────────────────────────────
  const hasCoins = !!coin_amount;
  const hasMessage = !!message?.trim();

  const title = hasCoins
    ? `${senderName} sent you ${coin_amount} Bloom Coins for your birthday! ✿`
    : `${senderName} wished you a happy birthday 🎂`;

  const notifBody = hasMessage ? message!.trim() : undefined;

  await admin.from("system_notifications").insert({
    user_id: birthday_user_id,
    category: "birthday_gift",
    title,
    ...(notifBody ? { body: notifBody } : { body: "🎉 Hope your day is wonderful!" }),
    severity: "info",
    metadata: {
      sender_id: senderId,
      sender_name: senderName,
      ...(hasCoins ? { coins_sent: coin_amount } : {}),
    },
  });

  return NextResponse.json({ ok: true, new_balance: newSenderBalance });
}
