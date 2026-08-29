import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type Body = {
  cycle_id?: string;
  week_number?: number;
  prompt?: string;
  preset_id?: string | null;
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
  const weekNumber = Number(raw.week_number);
  const presetId = raw.preset_id ? String(raw.preset_id).trim() : null;
  let prompt = String(raw.prompt ?? "").trim();

  if (!cycleId || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 5) {
    return NextResponse.json({ error: "Missing cycle or invalid week number." }, { status: 400 });
  }

  const { data: cycle } = await supabase
    .from("book_club_cycles")
    .select("id, host_user_id")
    .eq("id", cycleId)
    .maybeSingle();
  if (!cycle || cycle.host_user_id !== userId) {
    return NextResponse.json({ error: "Only this cycle's host can set its questions." }, { status: 404 });
  }

  let source: "custom" | "preset" = "custom";
  if (presetId) {
    const { data: preset } = await supabase
      .from("book_club_question_presets")
      .select("prompt")
      .eq("id", presetId)
      .maybeSingle();
    if (!preset) return NextResponse.json({ error: "Preset question not found." }, { status: 404 });
    prompt = preset.prompt;
    source = "preset";
  }

  if (!prompt) {
    return NextResponse.json({ error: "A question prompt is required." }, { status: 400 });
  }

  const { error } = await supabase.from("book_club_questionnaire_questions").upsert(
    {
      cycle_id: cycleId,
      week_number: weekNumber,
      prompt,
      source,
      preset_id: source === "preset" ? presetId : null,
      created_by: userId,
    },
    { onConflict: "cycle_id,week_number" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
