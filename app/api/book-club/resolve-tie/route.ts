import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type Body = { cycle_id?: string; book_option_id?: string };

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
  const cycleId = raw.cycle_id ? String(raw.cycle_id).trim() : null;
  const bookOptionId = raw.book_option_id ? String(raw.book_option_id).trim() : null;
  if (!cycleId || !bookOptionId) {
    return NextResponse.json({ error: "Missing cycle or book selection." }, { status: 400 });
  }

  // book_club_resolve_tie() itself re-checks that the caller is the cycle's
  // host and that the chosen option is genuinely part of the tied set.
  const { error } = await supabase.rpc("book_club_resolve_tie", {
    p_cycle_id: cycleId,
    p_book_option_id: bookOptionId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
