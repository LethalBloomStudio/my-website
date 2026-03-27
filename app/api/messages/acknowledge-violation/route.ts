import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

export async function POST() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase
    .from("accounts")
    .update({ has_unacknowledged_violation: false })
    .eq("user_id", userId);

  return NextResponse.json({ ok: true });
}
