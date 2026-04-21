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

  const body = await req.json() as {
    message?: string;
    is_active?: boolean;
    audience?: "adult" | "youth";
  };

  const audience = body.audience === "youth" ? "youth" : "adult";
  const message = (body.message ?? "").trim();
  const isActive = body.is_active ?? true;

  if (isActive && !message) {
    return NextResponse.json({ error: "Announcement message is required." }, { status: 400 });
  }

  const supabase = adminClient();

  const { data: existing } = await supabase
    .from("community_announcements")
    .select("audience, message, is_active, created_by")
    .eq("audience", audience)
    .maybeSingle();

  const previous = existing as { audience: string; message: string; is_active: boolean; created_by: string | null } | null;

  const { data, error } = await supabase
    .from("community_announcements")
    .upsert({
      audience,
      message: message || (previous?.message ?? ""),
      is_active: isActive,
      created_by: previous?.created_by ?? adminId,
      updated_by: adminId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "audience" })
    .select("audience, message, is_active, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("admin_audit_log").insert({
    admin_id: adminId,
    action: "update_community_announcement",
    target_type: "community_announcement",
    target_id: audience,
    old_value: previous,
    new_value: data,
    notes: `Updated ${audience} community announcement`,
  });

  return NextResponse.json({ ok: true, announcement: data });
}
