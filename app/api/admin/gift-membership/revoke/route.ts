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

export async function POST(req: Request) {
  const adminId = await verifyAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { gift_membership_id } = await req.json() as { gift_membership_id?: string };
  if (!gift_membership_id) {
    return NextResponse.json({ error: "gift_membership_id required." }, { status: 400 });
  }

  const supabase = adminClient();

  // Fetch the row to confirm it exists and is currently active
  const { data: giftData } = await supabase
    .from("gift_memberships")
    .select("id, user_id, status")
    .eq("id", gift_membership_id)
    .maybeSingle();

  if (!giftData) return NextResponse.json({ error: "Gift membership not found." }, { status: 404 });

  const gift = giftData as { id: string; user_id: string; status: string };
  if (gift.status !== "active") {
    return NextResponse.json({ error: "Gift membership is not active." }, { status: 409 });
  }

  const revokedAt = new Date().toISOString();

  // Mark revoked in gift_memberships (CHECK constraint requires revoked_at when status = 'revoked')
  const { error: revokeError } = await supabase
    .from("gift_memberships")
    .update({ status: "revoked", revoked_at: revokedAt, revoke_reason: "manual_revoke" })
    .eq("id", gift_membership_id);

  if (revokeError) return NextResponse.json({ error: revokeError.message }, { status: 500 });

  // Clear the denormalized reference on accounts
  const { error: accountError } = await supabase
    .from("accounts")
    .update({
      active_gift_membership_id: null,
      gift_access_expires_at: null,
      updated_at: revokedAt,
    })
    .eq("active_gift_membership_id", gift_membership_id);

  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
