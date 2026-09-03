import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type Body = {
  cycle_id?: string;
  message?: string;
  is_active?: boolean;
};

// Session-bound client (cookies, anon key) -- the host_user_id/status check
// below is only a friendlier error message. The real enforcement is the RLS
// policies on book_club_cycle_banners, which re-check host + active status
// at the database layer regardless of what this route does.
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (await req.json()) as Body;
  const cycleId = String(raw.cycle_id ?? "").trim();
  const message = (raw.message ?? "").trim();
  const isActive = raw.is_active ?? true;

  if (!cycleId) {
    return NextResponse.json({ error: "Missing cycle id." }, { status: 400 });
  }
  if (isActive && !message) {
    return NextResponse.json({ error: "Banner message is required." }, { status: 400 });
  }

  const { data: cycle } = await supabase
    .from("book_club_cycles")
    .select("id, host_user_id, status")
    .eq("id", cycleId)
    .maybeSingle();
  if (!cycle || cycle.host_user_id !== userId || cycle.status !== "active") {
    return NextResponse.json({ error: "Only this month's host can set the banner." }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("book_club_cycle_banners")
    .select("message")
    .eq("cycle_id", cycleId)
    .maybeSingle();
  const previousMessage = (existing as { message: string } | null)?.message ?? "";

  const { data, error } = await supabase
    .from("book_club_cycle_banners")
    .upsert(
      {
        cycle_id: cycleId,
        message: message || previousMessage,
        is_active: isActive,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cycle_id" }
    )
    .select("message, is_active, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Response shape matches /api/admin/community-announcement's { announcement }
  // so the shared AnnouncementBanner component can parse both the same way.
  return NextResponse.json({ ok: true, announcement: data });
}
