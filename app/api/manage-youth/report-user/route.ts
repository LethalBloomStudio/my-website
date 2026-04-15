import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const parentId = auth?.user?.id;
    if (!parentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      youth_user_id?: string;
      reported_user_id?: string;
      reason?: string;
      feedback_excerpt?: string;
    };
    const { youth_user_id, reported_user_id, reason, feedback_excerpt } = body;
    if (!youth_user_id || !reported_user_id || !reason?.trim()) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Verify caller is an active parent of this youth account
    const { data: link } = await admin
      .from("youth_links")
      .select("id")
      .eq("parent_user_id", parentId)
      .eq("child_user_id", youth_user_id)
      .eq("status", "active")
      .maybeSingle();

    if (!link) return NextResponse.json({ error: "Access denied." }, { status: 403 });

    // Cannot report yourself or your own child
    if (reported_user_id === parentId || reported_user_id === youth_user_id) {
      return NextResponse.json({ error: "Invalid report target." }, { status: 400 });
    }

    // Insert report
    const { data: report, error: reportErr } = await admin
      .from("parent_reports")
      .insert({ parent_user_id: parentId, youth_user_id, reported_user_id, reason: reason.trim() })
      .select("id")
      .single();

    if (reportErr) return NextResponse.json({ error: reportErr.message }, { status: 500 });

    // Restrict the reported user - block messaging AND manuscript/beta reading access
    await admin
      .from("accounts")
      .update({ parent_report_restricted: true, updated_at: new Date().toISOString() })
      .eq("user_id", reported_user_id);

    // Get reported user's profile for notification
    const { data: reportedProf } = await admin
      .from("public_profiles")
      .select("pen_name, username")
      .eq("user_id", reported_user_id)
      .maybeSingle();
    const reportedName =
      (reportedProf as { pen_name?: string | null; username?: string | null } | null)?.pen_name?.trim() ||
      (reportedProf as { pen_name?: string | null; username?: string | null } | null)?.username ||
      "User";

    // Notify the reported user
    await admin.from("system_notifications").insert({
      user_id: reported_user_id,
      category: "account_action",
      title: "Your Account Has Been Restricted",
      body: "Your account has been temporarily restricted from beta reading and messaging following a report from a parent account. An admin will review the report. If you believe this is an error, you may submit an appeal.",
      severity: "error",
      dedupe_key: `parent-report-restrict-${reported_user_id}-${Date.now()}`,
    });

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
          title: "Parent Report Submitted",
          body: `A parent account reported ${reportedName} for inappropriate activity regarding a linked youth account. Report ID: ${(report as { id: string }).id}. Reason: ${reason.trim()}${feedback_excerpt ? ` | Feedback: "${feedback_excerpt.slice(0, 300)}"` : ""}`,
          severity: "warning",
          dedupe_key: `parent-report-admin-${(report as { id: string }).id}-${adminId}`,
        }))
      );
    }

    return NextResponse.json({ ok: true, report_id: (report as { id: string }).id });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
