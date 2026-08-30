import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type TargetType = "response" | "reply" | "comment";
type Body = { cycle_id?: string; target_type?: TargetType; target_id?: string };

const TARGET_COLUMN: Record<TargetType, string> = {
  response: "response_id",
  reply: "reply_id",
  comment: "comment_id",
};

const TARGET_AUTHOR: Record<TargetType, { table: string; column: string }> = {
  response: { table: "book_club_question_responses", column: "user_id" },
  reply: { table: "book_club_response_replies", column: "author_id" },
  comment: { table: "book_club_comments", column: "author_id" },
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
  const targetType = raw.target_type;
  const targetId = String(raw.target_id ?? "").trim();
  if (!cycleId || !targetId || !targetType || !(targetType in TARGET_COLUMN)) {
    return NextResponse.json({ error: "Missing or invalid like target." }, { status: 400 });
  }

  const column = TARGET_COLUMN[targetType];
  const { table: authorTable, column: authorColumn } = TARGET_AUTHOR[targetType];

  const { data: targetRow } = await supabase
    .from(authorTable)
    .select(authorColumn)
    .eq("id", targetId)
    .maybeSingle();
  if ((targetRow as Record<string, string> | null)?.[authorColumn] === userId) {
    return NextResponse.json({ error: "You can't like your own post." }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("book_club_likes")
    .select("id")
    .eq("user_id", userId)
    .eq(column, targetId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("book_club_likes").delete().eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, liked: false });
  }

  const { error } = await supabase.from("book_club_likes").insert({
    cycle_id: cycleId,
    user_id: userId,
    [column]: targetId,
  });
  // 23505 = raced with another toggle and someone else's insert already
  // landed first -- treat as a no-op success (end state is "liked" either way).
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, liked: true });
}
