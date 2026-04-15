import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/Supabase/admin";

type Body = {
  child_name?: string;
  child_email?: string;
  child_dob?: string;
  subscription_tier?: string;
  parent_user_id?: string;
  parent_name?: string;
};

function appBaseUrl(req: Request) {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
}

async function sendYouthInviteEmail(
  to: string,
  childName: string,
  parentName: string,
  inviteUrl: string
) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PARENTAL_CONSENT_FROM_EMAIL;
  // In development/mock environments without email config, skip sending silently
  if (!apiKey || !from) return;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:520px">
      <h2 style="margin-bottom:8px">You've been invited to Lethal Bloom Studio</h2>
      <p>Hi ${childName},</p>
      <p><strong>${parentName}</strong> has set up a youth account for you on <strong>Lethal Bloom Studio</strong> - a platform for writers to share manuscripts and get meaningful feedback.</p>
      <p>Your account will be connected to your parent or guardian's profile. Click the button below to set up your account:</p>
      <p style="margin:24px 0">
        <a href="${inviteUrl}" style="display:inline-block;padding:12px 20px;background:#333333;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">
          Set Up My Account
        </a>
      </p>
      <p style="font-size:13px;color:#6b7280">This invite link expires in 7 days. If you did not expect this invitation, you can safely ignore this email.</p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${parentName} invited you to Lethal Bloom Studio`,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Email send failed: ${text}`);
  }
}

export async function POST(req: Request) {
  try {
    const { child_name, child_email, child_dob, subscription_tier, parent_user_id, parent_name } =
      (await req.json()) as Body;

    if (!child_name || !child_email || !child_dob || !parent_user_id) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Verify parent is an adult account
    const { data: parentAccount } = await supabase
      .from("accounts")
      .select("age_category")
      .eq("user_id", parent_user_id)
      .maybeSingle();

    if ((parentAccount as { age_category?: string } | null)?.age_category !== "adult_18_plus") {
      return NextResponse.json(
        { error: "Only adult accounts can manage youth profiles." },
        { status: 403 }
      );
    }

    // Expire any existing pending invite for this email under this parent
    await supabase
      .from("youth_links")
      .update({ status: "revoked" })
      .eq("parent_user_id", parent_user_id)
      .eq("child_email", child_email.trim().toLowerCase())
      .eq("status", "pending");

    const { data: link, error } = await supabase
      .from("youth_links")
      .insert({
        parent_user_id,
        child_email: child_email.trim().toLowerCase(),
        child_name: child_name.trim(),
        child_dob,
        subscription_tier: subscription_tier === "unlimited" ? "unlimited" : "free",
        status: "pending",
      })
      .select("invite_token")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const token = (link as { invite_token: string }).invite_token;
    const inviteUrl = `${appBaseUrl(req)}/youth-invite/${encodeURIComponent(token)}`;

    await sendYouthInviteEmail(
      child_email.trim().toLowerCase(),
      child_name.trim(),
      parent_name ?? "Your parent/guardian",
      inviteUrl
    );

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to send invite.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
