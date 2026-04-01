import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function getSessionUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      }
    );
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    title: string;
    content?: string;
    coin_prize: number;
    duration_hours: number;
  };

  const { title, content, coin_prize, duration_hours } = body;
  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });
  if (!coin_prize || coin_prize < 1) return NextResponse.json({ error: "Invalid coin prize" }, { status: 400 });
  if (!duration_hours || duration_hours < 1) return NextResponse.json({ error: "Invalid duration" }, { status: 400 });

  const supabase = adminClient();

  // Check user has enough coins
  const { data: account } = await supabase
    .from("accounts")
    .select("bloom_coins")
    .eq("user_id", userId)
    .maybeSingle();

  const accountRow = account as { bloom_coins: number } | null;
  if (!accountRow || accountRow.bloom_coins < coin_prize) {
    return NextResponse.json({ error: "Insufficient Bloom Coins" }, { status: 400 });
  }

  // Deduct coins from poster's wallet
  const { error: deductErr } = await supabase
    .from("accounts")
    .update({ bloom_coins: accountRow.bloom_coins - coin_prize })
    .eq("user_id", userId);

  if (deductErr) return NextResponse.json({ error: "Failed to deduct coins" }, { status: 500 });

  const ends_at = new Date(Date.now() + duration_hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("profile_announcements")
    .insert({
      user_id: userId,
      type: "challenge",
      title: title.trim(),
      content: content?.trim() || null,
      coin_prize,
      ends_at,
    })
    .select("id, user_id, type, title, content, poll_options, coin_prize, ends_at, winner_id, winner_drawn, created_at")
    .single();

  if (error) {
    // Refund coins on failure
    await supabase.from("accounts").update({ bloom_coins: accountRow.bloom_coins }).eq("user_id", userId);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ann = data as { id: string };

  // Notify friends about the new challenge announcement (fire-and-forget)
  void (async () => {
    const [{ data: sent }, { data: received }, { data: prof }] = await Promise.all([
      supabase.from("profile_friend_requests").select("receiver_id").eq("sender_id", userId).eq("status", "accepted"),
      supabase.from("profile_friend_requests").select("sender_id").eq("receiver_id", userId).eq("status", "accepted"),
      supabase.from("public_profiles").select("pen_name, username").eq("user_id", userId).maybeSingle(),
    ]);
    const friendIds = [
      ...((sent ?? []) as { receiver_id: string }[]).map(r => r.receiver_id),
      ...((received ?? []) as { sender_id: string }[]).map(r => r.sender_id),
    ].filter(id => id !== userId);
    if (friendIds.length === 0) return;
    const profRow = prof as { pen_name: string | null; username: string | null } | null;
    const posterName = profRow?.pen_name || profRow?.username || "A friend";
    const profileUsername = profRow?.username;
    if (!profileUsername) return;
    for (let i = 0; i < friendIds.length; i += 500) {
      await supabase.from("system_notifications").insert(
        friendIds.slice(i, i + 500).map(uid => ({
          user_id: uid,
          category: "social",
          title: `${posterName} posted a new announcement`,
          body: title.trim(),
          severity: "info",
          metadata: { announcement_id: ann.id, profile_username: profileUsername },
        }))
      );
    }
  })();

  return NextResponse.json({ ok: true, announcement: data });
}
