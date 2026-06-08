import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type Body = { feedback_id?: string };

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { feedback_id } = (await req.json()) as Body;
  if (!feedback_id) return NextResponse.json({ error: "Missing feedback_id." }, { status: 400 });

  const { data: replies } = await supabase
    .from("line_feedback_replies")
    .select("id")
    .eq("feedback_id", feedback_id);

  const replyIds = ((replies as { id: string }[] | null) ?? []).map((r) => r.id);
  if (replyIds.length === 0) return NextResponse.json({ ok: true });

  const rows = replyIds.map((reply_id) => ({ user_id: userId, reply_id }));
  await supabase.from("feedback_reply_reads").upsert(rows, { onConflict: "user_id,reply_id", ignoreDuplicates: true });

  return NextResponse.json({ ok: true });
}
