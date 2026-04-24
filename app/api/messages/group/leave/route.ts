import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { group_id?: string };
  const groupId = String(body.group_id ?? "").trim();
  if (!groupId) return NextResponse.json({ error: "Missing group chat." }, { status: 400 });

  const { data: membership } = await supabase
    .from("group_message_members")
    .select("left_at")
    .eq("conversation_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Group chat not found." }, { status: 404 });
  }
  if (membership.left_at) {
    return NextResponse.json({ ok: true });
  }

  const leftAt = new Date().toISOString();
  const { error } = await supabase
    .from("group_message_members")
    .update({ left_at: leftAt, last_read_at: leftAt, updated_at: leftAt })
    .eq("conversation_id", groupId)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, leftAt });
}
