import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type Body = { book_option_id?: string };

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
  const bookOptionId = raw.book_option_id ? String(raw.book_option_id).trim() : null;
  if (!bookOptionId) return NextResponse.json({ error: "Missing book selection." }, { status: 400 });

  const { data: cycle } = await supabase
    .from("book_club_cycles")
    .select("id")
    .eq("status", "voting")
    .maybeSingle();
  if (!cycle) {
    return NextResponse.json({ error: "Voting isn't open right now." }, { status: 400 });
  }

  const { data: participant } = await supabase
    .from("book_club_participants")
    .select("id")
    .eq("cycle_id", cycle.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!participant) {
    return NextResponse.json({ error: "Opt in to this month's Book Club before voting." }, { status: 403 });
  }

  const { error } = await supabase
    .from("book_club_book_votes")
    .upsert(
      { cycle_id: cycle.id, voter_id: userId, book_option_id: bookOptionId, updated_at: new Date().toISOString() },
      { onConflict: "cycle_id,voter_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
