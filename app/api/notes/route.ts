import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const manuscriptId = url.searchParams.get("manuscript_id");

  let query = supabase
    .from("user_notes")
    .select("id, content, manuscript_id, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (manuscriptId) query = query.eq("manuscript_id", manuscriptId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ notes: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { content?: string; manuscript_id?: string | null };
  const content = (body.content ?? "").trim();
  if (!content) return NextResponse.json({ error: "Note cannot be empty." }, { status: 400 });

  const { data, error } = await supabase
    .from("user_notes")
    .insert({ user_id: userId, content, manuscript_id: body.manuscript_id ?? null })
    .select("id, content, manuscript_id, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ note: data });
}
