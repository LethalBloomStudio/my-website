import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function verifyAdmin(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;

  const supabase = adminClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;

  const { data } = await supabase
    .from("accounts")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  const acc = data as { is_admin?: boolean } | null;
  return acc?.is_admin ? user.id : null;
}

export async function GET(req: Request) {
  const adminId = await verifyAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();

  const { data: accs, error } = await supabase
    .from("accounts")
    .select("user_id, full_name, email, account_status, is_admin, created_at, bloom_coins, subscription_status, status_reason, messaging_restricted, last_active_at, age_category, parental_consent, conduct_strikes, lifetime_suspension_count, messaging_suspended_until, blacklisted, manuscript_conduct_strikes, manuscript_lifetime_suspension_count, manuscript_suspended_until, manuscript_blacklisted")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = accs ?? [];
  const ids = rows.map((r: { user_id: string }) => r.user_id);

  const { data: profiles } = ids.length
    ? await supabase.from("public_profiles").select("user_id, username, pen_name").in("user_id", ids)
    : { data: [] };

  const profileMap: Record<string, { username: string | null; pen_name: string | null }> = {};
  ((profiles ?? []) as { user_id: string; username: string | null; pen_name: string | null }[]).forEach(p => {
    profileMap[p.user_id] = { username: p.username, pen_name: p.pen_name };
  });

  const users = rows.map((r: { user_id: string; [key: string]: unknown }) => ({
    ...r,
    username: profileMap[r.user_id]?.username ?? null,
    pen_name: profileMap[r.user_id]?.pen_name ?? null,
  }));

  return NextResponse.json(users);
}
