import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function verifyAdmin(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const supabase = adminClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data } = await supabase.from("accounts").select("is_admin").eq("user_id", user.id).maybeSingle();
  return (data as { is_admin?: boolean } | null)?.is_admin ? user.id : null;
}

export async function POST(req: Request) {
  const adminId = await verifyAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    appeal_id: string;
    decision: "approved" | "denied";
    admin_note?: string;
  };

  if (!body.appeal_id || !body.decision) {
    return NextResponse.json({ error: "Missing appeal_id or decision." }, { status: 400 });
  }

  const supabase = adminClient();

  // Fetch the appeal
  const { data: appeal } = await supabase
    .from("conduct_appeals")
    .select("id, user_id, status")
    .eq("id", body.appeal_id)
    .maybeSingle();

  if (!appeal) return NextResponse.json({ error: "Appeal not found." }, { status: 404 });
  const ap = appeal as { id: string; user_id: string; status: string };
  if (ap.status !== "pending") {
    return NextResponse.json({ error: "This appeal has already been reviewed." }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Update the appeal record
  await supabase
    .from("conduct_appeals")
    .update({
      status: body.decision,
      reviewed_by: adminId,
      reviewed_at: now,
      admin_note: body.admin_note?.trim() || null,
    })
    .eq("id", body.appeal_id);

  // Update the user's account
  if (body.decision === "approved") {
    await supabase
      .from("accounts")
      .update({
        appeal_requested: false,
        conduct_strikes: 0,
        messaging_suspended_until: null,
        feedback_suspended_until: null,
        blacklisted: false,
        manuscript_conduct_strikes: 0,
        manuscript_suspended_until: null,
        manuscript_blacklisted: false,
        updated_at: now,
      })
      .eq("user_id", ap.user_id);
  } else {
    await supabase
      .from("accounts")
      .update({ appeal_requested: false, updated_at: now })
      .eq("user_id", ap.user_id);
  }

  // Notify the user
  const notifTitle =
    body.decision === "approved"
      ? "Appeal Approved - Access Restored"
      : "Appeal Denied";
  const notifBody =
    body.decision === "approved"
      ? `Your appeal has been reviewed and approved. Your messaging and feedback access has been fully restored and your conduct strikes have been reset to zero.${body.admin_note ? ` Admin note: ${body.admin_note}` : ""}`
      : `Your appeal has been reviewed and denied. Your account restrictions remain in effect.${body.admin_note ? ` Admin note: ${body.admin_note}` : ""}`;

  await supabase.from("system_notifications").insert({
    user_id: ap.user_id,
    category: "conduct_appeal",
    title: notifTitle,
    body: notifBody,
    severity: body.decision === "approved" ? "info" : "warning",
    dedupe_key: `appeal-result-${body.appeal_id}`,
  });

  // Audit log
  await supabase.from("admin_audit_log").insert({
    admin_id: adminId,
    action: `appeal_${body.decision}`,
    target_type: "conduct_appeal",
    target_id: body.appeal_id,
    new_value: { decision: body.decision, admin_note: body.admin_note ?? null },
    notes: body.admin_note ?? null,
  });

  return NextResponse.json({ ok: true });
}
