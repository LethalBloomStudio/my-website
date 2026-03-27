import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/Supabase/admin";

type Body = { token?: string };

export async function POST(req: Request) {
  try {
    const { token } = (await req.json()) as Body;
    const consentToken = String(token ?? "").trim();
    if (!consentToken) {
      return NextResponse.json({ error: "Missing token." }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("parental_consent_requests")
      .select("id, child_user_id, status, expires_at")
      .eq("token", consentToken)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const row = data as {
      id: string;
      child_user_id: string;
      status: "pending" | "approved" | "expired";
      expires_at: string;
    } | null;
    if (!row) {
      return NextResponse.json({ error: "Invalid approval link." }, { status: 404 });
    }

    if (row.status === "approved") {
      return NextResponse.json({ ok: true, alreadyApproved: true });
    }

    if (row.status !== "pending" || new Date(row.expires_at).getTime() < Date.now()) {
      await supabase
        .from("parental_consent_requests")
        .update({ status: "expired" })
        .eq("id", row.id);
      return NextResponse.json({ error: "This approval link has expired." }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for") ?? "";
    const approvedAt = new Date().toISOString();

    const { error: updateAccountError } = await supabase
      .from("accounts")
      .update({
        parental_consent: true,
        updated_at: approvedAt,
      })
      .eq("user_id", row.child_user_id)
      .eq("age_category", "youth_13_17");
    if (updateAccountError) {
      return NextResponse.json({ error: updateAccountError.message }, { status: 400 });
    }

    const { error: updateRequestError } = await supabase
      .from("parental_consent_requests")
      .update({
        status: "approved",
        approved_at: approvedAt,
        approved_ip: ip,
      })
      .eq("id", row.id);
    if (updateRequestError) {
      return NextResponse.json({ error: updateRequestError.message }, { status: 400 });
    }

    await supabase.from("system_notifications").insert({
      user_id: row.child_user_id,
      category: "safety",
      title: "Parental authorization approved",
      body: "Your parent/guardian approved your access. You can now sign in.",
      severity: "info",
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to approve parental consent.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

