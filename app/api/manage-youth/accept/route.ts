import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/Supabase/admin";

type Body = { token?: string; child_user_id?: string };

export async function POST(req: Request) {
  try {
    const { token, child_user_id } = (await req.json()) as Body;

    if (!token || !child_user_id) {
      return NextResponse.json({ error: "Missing token or user ID." }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("youth_links")
      .select("id, status, invite_expires_at, child_dob, subscription_tier, parent_user_id")
      .eq("invite_token", token)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Invalid invite token." }, { status: 404 });
    }

    const row = data as {
      id: string;
      status: string;
      invite_expires_at: string;
      child_dob: string;
      subscription_tier: string;
      parent_user_id: string;
    };

    if (row.status !== "pending") {
      return NextResponse.json({ error: "This invite has already been used or revoked." }, { status: 400 });
    }

    if (new Date(row.invite_expires_at).getTime() < Date.now()) {
      await supabase
        .from("youth_links")
        .update({ status: "revoked" })
        .eq("id", row.id);
      return NextResponse.json({ error: "This invite link has expired." }, { status: 400 });
    }

    // Activate the link
    await supabase
      .from("youth_links")
      .update({
        child_user_id,
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    // Set child's account as youth with parental consent already granted.
    // Also sync subscription_status:
    // - "unlimited" (parent add-on) → grant lethal access now, parent is paying.
    // - "lethal_standalone" → access comes from Stripe payment, not set here.
    // - "free" → no change (stays free).
    const grantLethal = row.subscription_tier === "unlimited";
    await supabase
      .from("accounts")
      .update({
        age_category: "youth_13_17",
        parental_consent: true,
        dob: row.child_dob,
        ...(grantLethal ? { subscription_status: "lethal" } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", child_user_id);

    // Notify the child
    await supabase.from("system_notifications").insert({
      user_id: child_user_id,
      category: "safety",
      title: "Welcome to Lethal Bloom Studio",
      body: "Your account has been set up and is linked to your parent or guardian's profile. You can start writing!",
      severity: "info",
    });

    // Notify the parent
    await supabase.from("system_notifications").insert({
      user_id: row.parent_user_id,
      category: "safety",
      title: "Youth account activated",
      body: "Your child has accepted their invite and set up their account on Lethal Bloom Studio.",
      severity: "info",
    });

    // Auto-friend the youth and parent (bidirectional, accepted immediately)
    await supabase.from("profile_friend_requests").upsert(
      { sender_id: row.parent_user_id, receiver_id: child_user_id, status: "accepted" },
      { onConflict: "sender_id,receiver_id" }
    );

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to accept invite.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
