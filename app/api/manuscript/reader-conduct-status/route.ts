import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { user_ids?: string[] };
  const userIds = body.user_ids ?? [];
  if (userIds.length === 0) return NextResponse.json({ suspended: [] });

  const admin = supabaseAdmin();
  const { data } = await admin
    .from("accounts")
    .select("user_id, manuscript_suspended_until, manuscript_blacklisted")
    .in("user_id", userIds);

  const now = Date.now();
  const suspended = ((data ?? []) as { user_id: string; manuscript_suspended_until: string | null; manuscript_blacklisted: boolean | null }[])
    .filter((r) => r.manuscript_blacklisted || (r.manuscript_suspended_until && new Date(r.manuscript_suspended_until).getTime() > now))
    .map((r) => r.user_id);

  return NextResponse.json({ suspended });
}
