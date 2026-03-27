import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { reason?: string };
  const reason = body.reason?.trim() ?? "";
  if (reason.length < 20) {
    return NextResponse.json({ error: "Please provide a more detailed reason (at least 20 characters)." }, { status: 400 });
  }

  const admin = adminClient();

  // Check account is actually manuscript-suspended or manuscript-blacklisted
  const { data: account } = await admin
    .from("accounts")
    .select("manuscript_blacklisted, manuscript_suspended_until")
    .eq("user_id", userId)
    .maybeSingle();

  const isSuspended =
    account?.manuscript_suspended_until &&
    new Date(account.manuscript_suspended_until).getTime() > Date.now();

  if (!account?.manuscript_blacklisted && !isSuspended) {
    return NextResponse.json({ error: "Your manuscript access is not currently suspended or blacklisted." }, { status: 400 });
  }

  // Block duplicate pending appeals
  const { data: existing } = await admin
    .from("conduct_appeals")
    .select("id, status")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "You already have a pending appeal under review." }, { status: 400 });
  }

  // Insert the appeal
  const { data: appeal, error: insertErr } = await admin
    .from("conduct_appeals")
    .insert({ user_id: userId, reason })
    .select("id")
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Mark appeal_requested on account
  await admin
    .from("accounts")
    .update({ appeal_requested: true, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  // Get submitter's display name for the admin notification
  const { data: profile } = await admin
    .from("public_profiles")
    .select("username, pen_name")
    .eq("user_id", userId)
    .maybeSingle();
  const displayName =
    (profile as { pen_name?: string | null; username?: string | null } | null)?.pen_name?.trim() ||
    (profile as { pen_name?: string | null; username?: string | null } | null)?.username ||
    "A user";

  // Notify all admins
  const { data: adminAccounts } = await admin
    .from("accounts")
    .select("user_id")
    .eq("is_admin", true);

  const adminIds = ((adminAccounts ?? []) as { user_id: string }[]).map((a) => a.user_id);
  if (adminIds.length > 0) {
    await admin.from("system_notifications").insert(
      adminIds.map((adminId) => ({
        user_id: adminId,
        category: "conduct_appeal",
        title: "New Manuscript Conduct Appeal",
        body: `${displayName} has submitted an appeal for their manuscript access suspension or blacklist. Appeal ID: ${(appeal as { id: string }).id}`,
        severity: "warning",
        dedupe_key: `manuscript-appeal-${(appeal as { id: string }).id}-admin-${adminId}`,
      }))
    );
  }

  return NextResponse.json({ ok: true, appeal_id: (appeal as { id: string }).id });
}
