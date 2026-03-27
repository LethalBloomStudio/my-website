import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const adminUserId = auth?.user?.id;
    if (!adminUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify admin
    const admin = supabaseAdmin();
    const { data: acct } = await admin.from("accounts").select("is_admin").eq("user_id", adminUserId).maybeSingle();
    if (!(acct as { is_admin?: boolean } | null)?.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { report_id?: string; admin_note?: string };
    if (!body.report_id) return NextResponse.json({ error: "Missing report_id." }, { status: 400 });

    // Get the report
    const { data: report } = await admin
      .from("parent_reports")
      .select("id, reported_user_id, status")
      .eq("id", body.report_id)
      .maybeSingle();

    const row = report as { id: string; reported_user_id: string; status: string } | null;
    if (!row) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    if (row.status === "cleared") return NextResponse.json({ error: "Report already cleared." }, { status: 400 });

    // Check if the user has a pending parent-report appeal
    const { data: pendingAppeal } = await admin
      .from("parent_report_appeals")
      .select("id")
      .eq("user_id", row.reported_user_id)
      .eq("status", "pending")
      .maybeSingle();

    // If no pending appeal, auto-restore access
    const autoRestore = !pendingAppeal;

    // Clear the report
    await admin.from("parent_reports").update({
      status: "cleared",
      admin_note: body.admin_note?.trim() ?? null,
      cleared_at: new Date().toISOString(),
      auto_restored: autoRestore,
    }).eq("id", body.report_id);

    if (autoRestore) {
      // Lift the restriction
      await admin
        .from("accounts")
        .update({ parent_report_restricted: false, updated_at: new Date().toISOString() })
        .eq("user_id", row.reported_user_id);

      // Notify reported user that restriction is lifted
      await admin.from("system_notifications").insert({
        user_id: row.reported_user_id,
        category: "account_action",
        title: "Account Restriction Lifted",
        body: "A parent report against your account has been reviewed and cleared by an admin. Your beta reading and messaging access has been restored.",
        severity: "info",
        dedupe_key: `parent-report-cleared-${body.report_id}`,
      });
    }

    return NextResponse.json({ ok: true, auto_restored: autoRestore });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
