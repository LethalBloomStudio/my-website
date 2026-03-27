import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { reason?: string };
    const reason = body.reason?.trim() ?? "";
    if (reason.length < 20) {
      return NextResponse.json({ error: "Please provide more detail (at least 20 characters)." }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Check user is actually restricted
    const { data: acct } = await admin
      .from("accounts")
      .select("parent_report_restricted")
      .eq("user_id", userId)
      .maybeSingle();

    if (!(acct as { parent_report_restricted?: boolean } | null)?.parent_report_restricted) {
      return NextResponse.json({ error: "Your account is not currently restricted by a parent report." }, { status: 400 });
    }

    // Block duplicate pending appeals
    const { data: existing } = await admin
      .from("parent_report_appeals")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) return NextResponse.json({ error: "You already have a pending appeal under review." }, { status: 400 });

    // Get the most recent pending report against this user
    const { data: latestReport } = await admin
      .from("parent_reports")
      .select("id")
      .eq("reported_user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: appeal, error: insertErr } = await admin
      .from("parent_report_appeals")
      .insert({
        user_id: userId,
        report_id: (latestReport as { id: string } | null)?.id ?? null,
        reason,
      })
      .select("id")
      .single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    // Get user's display name
    const { data: prof } = await admin
      .from("public_profiles")
      .select("pen_name, username")
      .eq("user_id", userId)
      .maybeSingle();
    const displayName =
      (prof as { pen_name?: string | null; username?: string | null } | null)?.pen_name?.trim() ||
      (prof as { pen_name?: string | null; username?: string | null } | null)?.username ||
      "A user";

    // Notify admins
    const { data: adminAccounts } = await admin.from("accounts").select("user_id").eq("is_admin", true);
    const adminIds = ((adminAccounts ?? []) as { user_id: string }[]).map((a) => a.user_id);
    if (adminIds.length > 0) {
      await admin.from("system_notifications").insert(
        adminIds.map((adminId) => ({
          user_id: adminId,
          category: "conduct_appeal",
          title: "Parent Report Appeal",
          body: `${displayName} has submitted an appeal against a parent report restriction. Appeal ID: ${(appeal as { id: string }).id}`,
          severity: "warning",
          dedupe_key: `pr-appeal-${(appeal as { id: string }).id}-${adminId}`,
        }))
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
