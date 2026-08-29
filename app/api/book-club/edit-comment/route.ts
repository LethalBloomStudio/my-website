import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type Body = { comment_id?: string; body?: string };

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (await req.json()) as Body;
  const commentId = String(raw.comment_id ?? "").trim();
  const body = String(raw.body ?? "").trim();
  if (!commentId || !body) {
    return NextResponse.json({ error: "Missing comment or body." }, { status: 400 });
  }

  // No lock, ever -- ownership is the only gate, same as Bloom Circle's
  // comment editing, enforced here and by the RLS policy's USING/WITH CHECK.
  const { data: updated, error } = await supabase
    .from("book_club_comments")
    .update({ body, updated_at: new Date().toISOString() })
    .eq("id", commentId)
    .eq("author_id", userId)
    .select("id, body, updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!updated) return NextResponse.json({ error: "Comment not found." }, { status: 404 });

  return NextResponse.json({ ok: true, comment: updated });
}
