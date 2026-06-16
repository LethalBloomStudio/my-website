import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function verifyAdmin(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const supabase = adminClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data } = await supabase.from("accounts").select("is_admin").eq("user_id", user.id).maybeSingle();
  return (data as { is_admin?: boolean } | null)?.is_admin ? user.id : null;
}

export async function POST(req: Request) {
  const adminId = await verifyAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { user_id } = await req.json() as { user_id?: string };
  if (!user_id) return NextResponse.json({ error: "Missing user_id" }, { status: 400 });

  const supabase = adminClient();
  const currentYear = new Date().getFullYear();

  // Guard: don't double-send for the same year
  const { data: existing } = await supabase
    .from("birthday_coin_awards")
    .select("id")
    .eq("user_id", user_id)
    .eq("awarded_year", currentYear)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: "Birthday award already sent for this year" }, { status: 409 });

  // Insert unclaimed award
  const { data: award, error: awardErr } = await supabase
    .from("birthday_coin_awards")
    .insert({ user_id, awarded_year: currentYear, coins_awarded: 100 })
    .select("id")
    .single();

  if (awardErr) return NextResponse.json({ error: awardErr.message }, { status: 500 });

  // Send notification
  await supabase.from("system_notifications").insert({
    user_id,
    category: "birthday_coins",
    title: "Happy Birthday from Lethal Bloom!",
    body: "🎉 Wishing you a beautiful birthday! 🌹 Thank you for being part of the Lethal Bloom community. Here's 100 bloom coins on us! ✿",
    severity: "info",
    dedupe_key: `birthday-coins-${currentYear}`,
    metadata: { birthday_award_id: (award as { id: string }).id, reward_coins: 100 },
  });

  return NextResponse.json({ ok: true });
}
