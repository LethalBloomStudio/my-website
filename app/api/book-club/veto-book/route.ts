import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type Body = { option_id?: string; reason?: string };

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (await req.json()) as Body;
  const optionId = String(raw.option_id ?? "").trim();
  const reason = String(raw.reason ?? "").trim();
  if (!optionId || !reason) {
    return NextResponse.json({ error: "A reason is required to veto a book." }, { status: 400 });
  }

  const { error } = await supabase.rpc("book_club_veto_book", {
    p_option_id: optionId,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
