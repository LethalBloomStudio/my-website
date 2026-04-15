import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

async function requireAdmin() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = supabaseAdmin();
  const { data } = await admin.from("accounts").select("is_admin").eq("user_id", user.id).maybeSingle();
  if (!(data as { is_admin?: boolean } | null)?.is_admin) return null;
  return { user, admin };
}

// POST — pause, resume, or end a promotion; or delete it
export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { promotion_id, action } = (await req.json()) as {
    promotion_id: string;
    action: "pause" | "resume" | "end" | "delete";
  };

  if (!promotion_id || !action) return NextResponse.json({ error: "promotion_id and action required." }, { status: 400 });

  if (action === "delete") {
    // Expire any users on this promotion before deleting
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

  // If ending, clear the promotion from all users who are on it
  if (action === "end") {
    await ctx.admin
      .from("accounts")
      .update({ active_promotion_id: null, promotion_expires_at: null })
      .eq("active_promotion_id", promotion_id);
  }

  return NextResponse.json({ ok: true });
}
