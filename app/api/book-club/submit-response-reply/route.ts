import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

// No hard minimum to post -- REPLY_MIN_WORDS_TO_QUALIFY only gates the
// coin reward (evaluated below, RPC-side), matching how ordinary comments
// have never had a length requirement.
const REPLY_MIN_WORDS_TO_QUALIFY = 100;

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

type Body = { response_id?: string; body?: string };

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
  const responseId = String(raw.response_id ?? "").trim();
  const bodyText = String(raw.body ?? "").trim();
  if (!responseId || !bodyText) {
    return NextResponse.json({ error: "Missing response or reply body." }, { status: 400 });
  }

  const { data: target } = await supabase
    .from("book_club_question_responses")
    .select("id, cycle_id, week_number, user_id")
    .eq("id", responseId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "That answer isn't available." }, { status: 404 });
  }
  if (target.user_id === userId) {
    return NextResponse.json({ error: "You can't reply to your own answer." }, { status: 400 });
  }

  const { data: currentWeek } = await supabase.rpc("book_club_current_week_number", { p_cycle_id: target.cycle_id });
  if (target.week_number !== currentWeek) {
    return NextResponse.json({ error: "Replies are only open for the current week." }, { status: 403 });
  }

  const words = countWords(bodyText);

  const { data: inserted, error } = await supabase
    .from("book_club_response_replies")
    .insert({
      response_id: responseId,
      cycle_id: target.cycle_id,
      week_number: target.week_number,
      recipient_id: target.user_id,
      author_id: userId,
      body: bodyText,
      word_count: words,
    })
    .select("id, body, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (words >= REPLY_MIN_WORDS_TO_QUALIFY) {
    await supabase.rpc("book_club_try_award_reply_reward", { p_reply_id: inserted.id });
  }

  return NextResponse.json({ ok: true, reply: inserted, qualified: words >= REPLY_MIN_WORDS_TO_QUALIFY });
}
