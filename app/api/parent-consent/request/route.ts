import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/Supabase/admin";

type Body = {
  child_user_id?: string;
  parent_email?: string;
  child_name?: string;
};

function appBaseUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(req.url).origin
  );
}

async function sendParentConsentEmail(parentEmail: string, childName: string, approvalUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PARENTAL_CONSENT_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error("Missing RESEND_API_KEY or PARENTAL_CONSENT_FROM_EMAIL.");
  }

  const subject = "Parental authorization required";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2>Parental authorization request</h2>
      <p>${childName} requested access to Lethal Bloom Studio.</p>
      <p>To approve this request, click the button below:</p>
      <p>
        <a href="${approvalUrl}" style="display:inline-block;padding:10px 16px;background:#787878;color:#ffffff;text-decoration:none;border-radius:8px;">
          Approve Access
        </a>
      </p>
      <p>If you did not expect this request, you can ignore this email.</p>
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
      to: [parentEmail],
      subject,
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
    const { child_user_id, parent_email, child_name } = (await req.json()) as Body;
    const childUserId = String(child_user_id ?? "").trim();
    const parentEmail = String(parent_email ?? "").trim().toLowerCase();
    const childName = String(child_name ?? "A youth user").trim() || "A youth user";

    if (!childUserId || !parentEmail) {
      return NextResponse.json({ error: "Missing child user or parent email." }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    await supabase
      .from("parental_consent_requests")
      .update({ status: "expired" })
      .eq("child_user_id", childUserId)
      .eq("status", "pending");

    const { data: row, error } = await supabase
      .from("parental_consent_requests")
      .insert({
        child_user_id: childUserId,
        parent_email: parentEmail,
        status: "pending",
      })
      .select("token")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const token = (row as { token: string }).token;
    const approvalUrl = `${appBaseUrl(req)}/parent-consent/${encodeURIComponent(token)}`;
    await sendParentConsentEmail(parentEmail, childName, approvalUrl);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to request parental consent.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

