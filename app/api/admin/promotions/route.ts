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

// GET — list all promotions
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await ctx.admin
    .from("promotions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ promotions: data ?? [] });
}

// POST — create a new promotion
export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    name: string;
    description?: string;
    benefit?: string;
    duration_days: number;
    applies_to: string;
    bonus_coins?: number;
    max_users?: number | null;
  };

  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!body.duration_days || body.duration_days < 1) return NextResponse.json({ error: "Duration must be at least 1 day." }, { status: 400 });
  if (!["new_signups", "all_free", "both", "all_users"].includes(body.applies_to)) {
    return NextResponse.json({ error: "Invalid applies_to value." }, { status: 400 });
  }
  const benefit = body.benefit ?? "lethal_access";
  if (!["lethal_access", "coins_only"].includes(benefit)) {
    return NextResponse.json({ error: "Invalid benefit value." }, { status: 400 });
  }

  const { data, error } = await ctx.admin.from("promotions").insert({
    name: body.name.trim(),
    description: body.description?.trim() ?? null,
    benefit,
    duration_days: body.duration_days,
    applies_to: body.applies_to,
    bonus_coins: body.bonus_coins ?? 0,
    max_users: body.max_users ?? null,
    status: "active",
    created_by: ctx.user.id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ promotion: data });
}
