import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function verifyAdmin(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const supabase = adminClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data } = await supabase.from("accounts").select("is_admin").eq("user_id", user.id).maybeSingle();
  const acc = data as { is_admin?: boolean } | null;
  return acc?.is_admin ? user.id : null;
}

const VALID_MONTHS = new Set([1, 2, 3, 6, 12]);

export async function POST(req: Request) {
  const adminId = await verifyAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { user_id?: string; months?: number };
  const { user_id: targetUserId, months } = body;

  if (!targetUserId) return NextResponse.json({ error: "user_id required." }, { status: 400 });
  if (!months || !VALID_MONTHS.has(months)) {
    return NextResponse.json({ error: "months must be 1, 2, 3, 6, or 12." }, { status: 400 });
  }

  const supabase = adminClient();

  // Verify target account exists and check for an already-active gift
  const { data: accountData } = await supabase
    .from("accounts")
    .select("user_id, active_gift_membership_id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (!accountData) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const account = accountData as { user_id: string; active_gift_membership_id: string | null };
  if (account.active_gift_membership_id) {
    return NextResponse.json(
      { error: "User already has an active gift membership. Revoke it before granting a new one." },
      { status: 409 }
    );
  }

  // Insert the gift_memberships row; the trigger derives ends_at from starts_at + months
  const { data: giftData, error: giftError } = await supabase
    .from("gift_memberships")
    .insert({
      user_id: targetUserId,
      granted_by: adminId,
      months,
      starts_at: new Date().toISOString(),
    })
    .select("id, ends_at")
    .single();

  if (giftError || !giftData) {
    return NextResponse.json(
      { error: giftError?.message ?? "Failed to create gift membership." },
      { status: 500 }
    );
  }

  const gift = giftData as { id: string; ends_at: string };

  // Denormalize onto accounts for fast membership-type lookups
  const { error: accountError } = await supabase
    .from("accounts")
    .update({
      active_gift_membership_id: gift.id,
      gift_access_expires_at: gift.ends_at,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", targetUserId);

  if (accountError) {
    return NextResponse.json({ error: accountError.message }, { status: 500 });
  }

  // Notify the recipient
  const monthLabel = months === 1 ? "1 month" : `${months} months`;
  await supabase.from("system_notifications").insert({
    user_id: targetUserId,
    category: "account_action",
    title: "You've received a Gift Membership!",
    body: `You've been gifted a Lethal Membership for ${monthLabel}! Thank you for being an amazing member of the Lethal Bloom Studio community. Please note that gift memberships can be revoked at any time.`,
    severity: "info",
    dedupe_key: `gift-grant-${gift.id}`,
  });

  return NextResponse.json({ ok: true, gift_membership_id: gift.id, ends_at: gift.ends_at });
}
