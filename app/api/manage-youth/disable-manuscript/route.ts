import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

const DISABLE_REASONS = [
  "Inappropriate content",
  "Safety concern",
  "Content needs review",
  "Temporary pause requested",
  "Other parental concern",
];

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const parentId = auth?.user?.id;
    if (!parentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      manuscript_id?: string;
      action?: "disable" | "reinstate";
      reason?: string;
    };
    const { manuscript_id, action, reason } = body;
    if (!manuscript_id || !action) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (action === "disable" && (!reason || !DISABLE_REASONS.includes(reason))) {
      return NextResponse.json({ error: "A valid reason is required." }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Verify the manuscript exists and get owner
    const { data: ms } = await admin
      .from("manuscripts")
      .select("id, owner_id, title, parent_disabled, parent_disabled_by")
      .eq("id", manuscript_id)
      .maybeSingle();

    const manuscript = ms as {
      id: string;
      owner_id: string;
      title: string;
      parent_disabled: boolean;
      parent_disabled_by: string | null;
    } | null;

    if (!manuscript) return NextResponse.json({ error: "Manuscript not found." }, { status: 404 });

    // Reinstate: only the parent who disabled it can reinstate
    if (action === "reinstate" && manuscript.parent_disabled_by !== parentId) {
      return NextResponse.json({ error: "Only the parent who disabled this manuscript can reinstate it." }, { status: 403 });
    }

    // Verify caller is active parent of the manuscript owner
    const { data: link } = await admin
      .from("youth_links")
      .select("id")
      .eq("parent_user_id", parentId)
      .eq("child_user_id", manuscript.owner_id)
      .eq("status", "active")
      .maybeSingle();

    if (!link) return NextResponse.json({ error: "Access denied." }, { status: 403 });

    // Apply the change
    const updates =
      action === "disable"
        ? { parent_disabled: true, parent_disabled_reason: reason, parent_disabled_by: parentId, visibility: "private", updated_at: new Date().toISOString() }
        : { parent_disabled: false, parent_disabled_reason: null, parent_disabled_by: null, updated_at: new Date().toISOString() };

    await admin.from("manuscripts").update(updates).eq("id", manuscript_id);

    // Get parent display name
    const { data: parentProf } = await admin
      .from("public_profiles")
      .select("pen_name, username")
      .eq("user_id", parentId)
      .maybeSingle();
    const parentName =
      (parentProf as { pen_name?: string | null; username?: string | null } | null)?.pen_name?.trim() ||
      (parentProf as { pen_name?: string | null; username?: string | null } | null)?.username ||
      "Your parent";

    // Notify child
    const notifTitle = action === "disable" ? "Manuscript Disabled by Parent" : "Manuscript Reinstated by Parent";
    const notifBody =
      action === "disable"
        ? `Your manuscript "${manuscript.title}" has been temporarily disabled and unpublished by ${parentName}. Reason: ${reason}. It can only be reinstated by your parent account.`
        : `Your manuscript "${manuscript.title}" has been reinstated by ${parentName} and is now accessible again.`;

    await admin.from("system_notifications").insert({
      user_id: manuscript.owner_id,
      category: "account_action",
      title: notifTitle,
      body: notifBody,
      severity: action === "disable" ? "warning" : "info",
      dedupe_key: `parent-ms-${action}-${manuscript_id}-${Date.now()}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
