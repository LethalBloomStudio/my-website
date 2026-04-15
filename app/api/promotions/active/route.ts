import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/Supabase/admin";

// Public endpoint - returns the current active promotion safe to display to visitors
export async function GET() {
  const admin = supabaseAdmin();

  const { data } = await admin
    .from("promotions")
    .select("id, name, description, duration_days, applies_to, bonus_coins")
    .eq("status", "active")
    .in("applies_to", ["new_signups", "both"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return NextResponse.json({ promotion: null });
  return NextResponse.json({ promotion: data });
}
