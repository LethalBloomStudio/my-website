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

  const raw = (await req.json().catch(() => ({}))) as Body;
  const cycleId = String(raw.cycle_id ?? "").trim();
  if (!cycleId) return NextResponse.json({ error: "Missing cycle." }, { status: 400 });

  const { data: cycle } = await supabase
    .from("book_club_cycles")
    .select("id")
    .eq("id", cycleId)
    .neq("status", "completed")
    .maybeSingle();

  if (!cycle) {
    return NextResponse.json({ error: "There's no Book Club cycle to join right now." }, { status: 400 });
  }

  const { error } = await supabase
    .from("book_club_participants")
    .insert({ cycle_id: cycle.id, user_id: userId });
  // 23505 = already opted in -- treat as a no-op success, not an error.
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, cycle_id: cycle.id });
}
