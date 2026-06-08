import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const raw = url.searchParams.get("feedback_ids") ?? "";
  const feedbackIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (feedbackIds.length === 0) return NextResponse.json({ unread: {} });

  const { data: replies } = await supabase
    .from("line_feedback_replies")
    .select("id, feedback_id")
    .in("feedback_id", feedbackIds)
    .neq("replier_id", userId);

  const replyRows = (replies as { id: string; feedback_id: string }[] | null) ?? [];
  if (replyRows.length === 0) return NextResponse.json({ unread: {} });

  const replyIds = replyRows.map((r) => r.id);
  const { data: reads } = await supabase
    .from("feedback_reply_reads")
    .select("reply_id")
    .eq("user_id", userId)
    .in("reply_id", replyIds);

  const readSet = new Set(((reads as { reply_id: string }[] | null) ?? []).map((r) => r.reply_id));

  const unread: Record<string, number> = {};
  for (const { id, feedback_id } of replyRows) {
    if (!readSet.has(id)) {
      unread[feedback_id] = (unread[feedback_id] ?? 0) + 1;
    }
  }

  return NextResponse.json({ unread });
}
