import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

const VALID_AMOUNTS = new Set([100, 350, 600]);

type Body = { amount?: number; message?: string };

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { amount, message } = (await req.json()) as Body;
  const coins = Number(amount ?? 0);
  if (!VALID_AMOUNTS.has(coins)) {
    return NextResponse.json({ error: "Invalid coin amount." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Verify the caller is a youth with an active parent link
  const { data: link } = await admin
    .from("youth_links")
    .select("parent_user_id, child_name")
    .eq("child_user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: "No active parent link found." }, { status: 403 });
  }

  const row = link as { parent_user_id: string; child_name: string };

  // Fetch child's display name for the notification
  const { data: childProf } = await admin
    .from("public_profiles")
    .select("pen_name, username")
    .eq("user_id", userId)
    .maybeSingle();
  const cp = childProf as { pen_name?: string | null; username?: string | null } | null;
  const childDisplay = cp?.pen_name?.trim() || row.child_name || "Your child";

  const noteBody = message?.trim()
    ? `${childDisplay} is requesting ${coins} Bloom Coins. Message: "${message.trim()}"`
    : `${childDisplay} is requesting ${coins} Bloom Coins.`;

  // Send notification to parent under "socials" category
  await admin.from("system_notifications").insert({
    user_id: row.parent_user_id,
    category: "socials",
    title: `${childDisplay} is requesting Bloom Coins`,
    body: noteBody,
    severity: "info",
    metadata: { gift_link: `/wallet?gift_to=${encodeURIComponent(userId)}&amount=${coins}`, child_user_id: userId, amount: coins },
  });

  return NextResponse.json({ ok: true });
}
