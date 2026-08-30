import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type Body = {
  cycle_id?: string;
  body?: string;
  parent_comment_id?: string | null;
};

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
  const body = String(raw.body ?? "").trim();
  const requestedParentId = raw.parent_comment_id ? String(raw.parent_comment_id).trim() : null;

  if (!cycleId || !body) {
    return NextResponse.json({ error: "Missing cycle or comment body." }, { status: 400 });
  }

  const { data: cycle } = await supabase
    .from("book_club_cycles")
    .select("id, status")
    .eq("id", cycleId)
    .maybeSingle();
  if (!(cycle as { status?: string } | null) || (cycle as { status: string }).status !== "active") {
    return NextResponse.json({ error: "This discussion isn't open right now." }, { status: 404 });
  }

  // Comments are scoped to the current week only -- closed (past) weeks are
  // read-only, matching book_club_question_responses' same current-week-only
  // write rule.
  const { data: weekNumber } = await supabase.rpc("book_club_current_week_number", { p_cycle_id: cycleId });
  if (!weekNumber) {
    return NextResponse.json({ error: "This week has closed and no longer accepts new comments." }, { status: 403 });
  }

  // Flatten to 2 levels, same as Bloom Circle's comments: replying to a
  // reply attaches to that reply's own top-level parent.
  let parentCommentId: string | null = null;
  if (requestedParentId) {
    const { data: target } = await supabase
      .from("book_club_comments")
      .select("id, cycle_id, week_number, parent_comment_id")
      .eq("id", requestedParentId)
      .maybeSingle();
    const row = target as { id: string; cycle_id: string; week_number: number; parent_comment_id: string | null } | null;
    if (!row || row.cycle_id !== cycleId || row.week_number !== weekNumber) {
      return NextResponse.json({ error: "The comment you're replying to no longer exists." }, { status: 404 });
    }
    parentCommentId = row.parent_comment_id ?? row.id;
  }

  const { data: inserted, error } = await supabase
    .from("book_club_comments")
    .insert({
      cycle_id: cycleId,
      author_id: userId,
      parent_comment_id: parentCommentId,
      week_number: weekNumber,
      body,
    })
    .select("id, cycle_id, author_id, parent_comment_id, week_number, body, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // A comment is one of the "+1 of any kind" weekly engagement actions --
  // this is a no-op unless the week's question has also been answered.
  await supabase.rpc("book_club_try_award_weekly_checkmark", {
    p_cycle_id: cycleId,
    p_user_id: userId,
    p_week_number: weekNumber,
  });

  return NextResponse.json({ ok: true, comment: inserted });
}
