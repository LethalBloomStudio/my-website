import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  const supabase = adminClient();
  const { data } = await supabase
    .from("accounts")
    .select("user_id")
    .eq("is_admin", true);

  const ids = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  return NextResponse.json({ ids });
}
