import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type Body = { cycle_id?: string };

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await supabase
    .from("accounts")
    .select("age_category")
    .eq("user_id", userId)
    .maybeSingle();
  if ((account as { age_category?: string } | null)?.age_category !== "adult_18_plus") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const raw = (await req.json()) as Body;
  const cycleId = String(raw.cycle_id ?? "").trim();
  if (!cycleId) return NextResponse.json({ error: "Missing cycle." }, { status: 400 });

  const { data: weekNumber } = await supabase.rpc("book_club_current_week_number", { p_cycle_id: cycleId });
  if (!weekNumber) {
    return NextResponse.json({ error: "This cycle isn't active right now." }, { status: 400 });
  }

  const { error } = await supabase
    .from("book_club_check_ins")
    .insert({ cycle_id: cycleId, user_id: userId, week_number: weekNumber });
  // 23505 = already checked in this week -- treat as a no-op success.
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await supabase.rpc("book_club_try_award_weekly_checkmark", {
    p_cycle_id: cycleId,
    p_user_id: userId,
    p_week_number: weekNumber,
  });

  return NextResponse.json({ ok: true });
}
