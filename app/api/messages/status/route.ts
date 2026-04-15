import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

export async function GET() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account, error } = await supabase
    .from("accounts")
    .select("age_category, conduct_strikes, messaging_suspended_until, blacklisted, appeal_requested, has_unacknowledged_violation, lifetime_suspension_count, parent_report_restricted")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Pending violation modal data
  let pendingViolation: { message: string; triggers: string[]; consequence: string } | null = null;
  if (account?.has_unacknowledged_violation) {
    const { data: flag } = await supabase
      .from("message_moderation_flags")
      .select("triggers, consequence")
      .eq("sender_id", userId)
      .not("triggers", "cs", '["copy_attempt"]')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (flag) {
      const consequence = flag.consequence as string;
      const msg =
        consequence === "warning_1" ? "Warning issued. Keep conversation on-platform and policy-safe." :
        consequence === "warning_2" ? "Second warning issued. Another violation will trigger suspension." :
        consequence === "suspended_3_days" ? "Chat/feedback privileges suspended for 3 days due to repeated violations." :
        "Account blacklisted from messaging. You may request an appeal for owner review.";
      pendingViolation = { message: msg, triggers: flag.triggers as string[], consequence };
    }
  }

  // Latest appeal status
  const { data: latestAppeal } = await supabase
    .from("conduct_appeals")
    .select("id, status, admin_note, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Build list of user IDs that must be excluded from messaging for this user.
  // Uses admin client to bypass RLS - includes any youth accounts in their friend graph.
  const admin = supabaseAdmin();
  const excludedFromMessaging: string[] = [];

  // Linked youth accounts (parent → children)
  const { data: youthLinks } = await admin
    .from("youth_links")
    .select("child_user_id")
    .eq("parent_user_id", userId)
    .eq("status", "active");
  for (const row of (youthLinks ?? []) as { child_user_id: string }[]) {
    excludedFromMessaging.push(row.child_user_id);
  }

  // Also exclude any friends whose age_category is youth (catches edge cases)
  const { data: friendRows } = await admin
    .from("profile_friend_requests")
    .select("sender_id, receiver_id")
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq("status", "accepted");
  const friendIds = ((friendRows ?? []) as { sender_id: string; receiver_id: string }[])
    .map((r) => (r.sender_id === userId ? r.receiver_id : r.sender_id));
  if (friendIds.length > 0) {
    const { data: friendAccts } = await admin
      .from("accounts")
      .select("user_id, age_category")
      .in("user_id", friendIds);
    for (const a of (friendAccts ?? []) as { user_id: string; age_category: string | null }[]) {
      if (a.age_category === "youth_13_17" && !excludedFromMessaging.includes(a.user_id)) {
        excludedFromMessaging.push(a.user_id);
      }
    }
  }

  return NextResponse.json({
    status: account ?? null,
    pendingViolation,
    latestAppeal: latestAppeal ?? null,
    excludedFromMessaging,
  });
}
