import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

export async function POST() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Re-check adult status server-side -- defense in depth alongside RLS,
  // matching every other Bloom Circle write path.
  const { data: account } = await supabase
    .from("accounts")
    .select("age_category")
    .eq("user_id", userId)
    .maybeSingle();
  if ((account as { age_category?: string } | null)?.age_category !== "adult_18_plus") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: cycle } = await supabase
    .from("book_club_cycles")
    .select("id")
    .in("status", ["host_pending", "host_grace"])
    .maybeSingle();

  if (!cycle) {
    return NextResponse.json({ error: "Host signup is not open right now." }, { status: 400 });
  }

  const { error } = await supabase.rpc("book_club_join_host_signup", { p_cycle_id: cycle.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
