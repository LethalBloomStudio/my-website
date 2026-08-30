import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

// Same plain word-splitting idiom as ORIGINAL_MAX_WORDS in
// components/BloomCircleSubmissionForm.tsx / submit-thread/route.ts,
// duplicated locally rather than shared, matching that established style.
function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const RESPONSE_MIN_WORDS = 150;

type Body = { question_id?: string; body?: string };

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
  const questionId = String(raw.question_id ?? "").trim();
  const bodyText = String(raw.body ?? "").trim();
  if (!questionId || !bodyText) {
    return NextResponse.json({ error: "Missing question or response." }, { status: 400 });
  }

  const words = countWords(bodyText);
  if (words < RESPONSE_MIN_WORDS) {
    return NextResponse.json(
      { error: `Your response needs at least ${RESPONSE_MIN_WORDS} words (currently ${words}).` },
      { status: 400 }
    );
  }

  const { data: question } = await supabase
    .from("book_club_questionnaire_questions")
    .select("id, cycle_id, week_number")
    .eq("id", questionId)
    .maybeSingle();
  if (!question) {
    return NextResponse.json({ error: "This question isn't available." }, { status: 404 });
  }

  const { data: currentWeek } = await supabase.rpc("book_club_current_week_number", { p_cycle_id: question.cycle_id });
  if (question.week_number !== currentWeek) {
    return NextResponse.json({ error: "This week has closed and no longer accepts new answers." }, { status: 403 });
  }

  const { error } = await supabase.from("book_club_question_responses").upsert(
    {
      question_id: questionId,
      cycle_id: question.cycle_id,
      week_number: question.week_number,
      user_id: userId,
      body: bodyText,
      word_count: words,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "question_id,user_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.rpc("book_club_try_award_weekly_checkmark", {
    p_cycle_id: question.cycle_id,
    p_user_id: userId,
    p_week_number: question.week_number,
  });

  return NextResponse.json({ ok: true });
}
