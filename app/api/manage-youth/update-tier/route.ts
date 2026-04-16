import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const parentId = auth?.user?.id;
  if (!parentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { link_id?: string; tier?: string };
  const { link_id, tier } = body;
  if (!link_id || (tier !== "free" && tier !== "unlimited" && tier !== "lethal_standalone")) {
    return NextResponse.json({ error: "Missing or invalid fields." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Verify the link belongs to this parent
  const { data: link } = await admin
    .from("youth_links")
    .select("id")
    .eq("id", link_id)
    .eq("parent_user_id", parentId)
    .maybeSingle();

  if (!link) return NextResponse.json({ error: "Access denied." }, { status: 403 });

  await admin
    .from("youth_links")
    .update({ subscription_tier: tier, updated_at: new Date().toISOString() })
    .eq("id", link_id);

  return NextResponse.json({ ok: true });
}
