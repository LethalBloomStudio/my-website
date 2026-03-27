import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/Supabase/admin";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("youth_links")
      .select("child_name, child_email, child_dob, subscription_tier, status, invite_expires_at, parent_user_id")
      .eq("invite_token", token)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Invalid or expired invite link." }, { status: 404 });
    }

    const row = data as {
      child_name: string;
      child_email: string;
      child_dob: string;
      subscription_tier: string;
      status: string;
      invite_expires_at: string;
      parent_user_id: string;
    };

    if (row.status !== "pending") {
      return NextResponse.json({ error: "This invite has already been used." }, { status: 400 });
    }

    if (new Date(row.invite_expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "This invite link has expired. Ask your parent or guardian to resend it." },
        { status: 400 }
      );
    }

    // Fetch parent's display name
    const { data: prof } = await supabase
      .from("public_profiles")
      .select("pen_name, username")
      .eq("user_id", row.parent_user_id)
      .maybeSingle();

    const p = prof as { pen_name?: string | null; username?: string | null } | null;
    const parentName =
      p?.pen_name?.trim() || (p?.username ? `@${p.username}` : "your parent or guardian");

    return NextResponse.json({
      invite: {
        child_name: row.child_name,
        child_email: row.child_email,
        child_dob: row.child_dob,
        subscription_tier: row.subscription_tier,
        parent_name: parentName,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
