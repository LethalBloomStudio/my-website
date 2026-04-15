import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireAdmin(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const admin = adminClient();
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;
  const { data } = await admin.from("accounts").select("is_admin").eq("user_id", user.id).maybeSingle();
  if (!(data as { is_admin?: boolean } | null)?.is_admin) return null;
  return { admin };
}

// POST - pause, resume, end, or delete a promotion
export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { promotion_id, action } = (await req.json()) as {
    promotion_id: string;
    action: "pause" | "resume" | "end" | "delete";
  };

  if (!promotion_id || !action) return NextResponse.json({ error: "promotion_id and action required." }, { status: 400 });

  if (action === "delete") {
    await ctx.admin
      .from("accounts")
      .update({ active_promotion_id: null, promotion_expires_at: null })
      .eq("active_promotion_id", promotion_id);
    await ctx.admin.from("promotions").delete().eq("id", promotion_id);
    return NextResponse.json({ ok: true });
  }

  const newStatus = action === "end" ? "ended" : action === "pause" ? "paused" : "active";
  const updates: Record<string, unknown> = { status: newStatus };
  if (action === "end") updates.ended_at = new Date().toISOString();

  const { error } = await ctx.admin
    .from("promotions")
    .update(updates)
    .eq("id", promotion_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If ending, clear the promotion from all enrolled users
  if (action === "end") {
    await ctx.admin
      .from("accounts")
      .update({ active_promotion_id: null, promotion_expires_at: null })
      .eq("active_promotion_id", promotion_id);
  }

  return NextResponse.json({ ok: true });
}
