import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const parentId = auth?.user?.id;
  if (!parentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { link_id?: string };
  const { link_id } = body;
  if (!link_id) return NextResponse.json({ error: "Missing link_id." }, { status: 400 });

  const admin = supabaseAdmin();

  // Verify the link belongs to this parent
  const { data: link } = await admin
    .from("youth_links")
    .select("id, child_user_id")
    .eq("id", link_id)
    .eq("parent_user_id", parentId)
    .maybeSingle();

  if (!link) return NextResponse.json({ error: "Access denied." }, { status: 403 });

  const row = link as { id: string; child_user_id: string | null };

  await admin
    .from("youth_links")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", link_id);

  // Revert child to free tier
  if (row.child_user_id) {
    await admin
      .from("accounts")
      .update({ subscription_status: "free", updated_at: new Date().toISOString() })
      .eq("user_id", row.child_user_id);
  }

  return NextResponse.json({ ok: true });
}
