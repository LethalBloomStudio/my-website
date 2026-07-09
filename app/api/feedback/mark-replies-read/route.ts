import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { markRepliesReadAndSyncNotification } from "@/lib/markRepliesRead";

type Body = { feedback_id?: string };

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { feedback_id } = (await req.json()) as Body;
  if (!feedback_id) return NextResponse.json({ error: "Missing feedback_id." }, { status: 400 });

  await markRepliesReadAndSyncNotification(supabase, userId, feedback_id);

  return NextResponse.json({ ok: true });
}
