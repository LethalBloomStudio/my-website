import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action } = (await req.json()) as { action: "deactivate" | "reactivate" };
  const deactivating = action === "deactivate";
  const admin = supabaseAdmin();

  // Update the user's account
  const { error } = await admin
    .from("accounts")
    .update({
      is_deactivated: deactivating,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Hide or restore user's manuscripts via admin_hidden
  if (deactivating) {
    await admin
      .from("manuscripts")
      .update({ admin_hidden: true, admin_note: "owner_deactivated" })
      .eq("owner_id", user.id)
      .eq("admin_hidden", false);
  } else {
    await admin
      .from("manuscripts")
      .update({ admin_hidden: false, admin_note: null })
      .eq("owner_id", user.id)
      .eq("admin_note", "owner_deactivated");
  }

  // Cascade to linked youth accounts (if this is a parent account)
  const { data: youthLinks } = await admin
    .from("youth_links")
    .select("child_user_id")
    .eq("parent_user_id", user.id)
    .eq("status", "active");

  if (youthLinks && youthLinks.length > 0) {
    const childIds = (youthLinks as { child_user_id: string }[]).map((y) => y.child_user_id);
    await admin
      .from("accounts")
      .update({
        is_deactivated: deactivating,
        updated_at: new Date().toISOString(),
      })
      .in("user_id", childIds);

    if (deactivating) {
      for (const childId of childIds) {
        await admin
          .from("manuscripts")
          .update({ admin_hidden: true, admin_note: "owner_deactivated" })
          .eq("owner_id", childId)
          .eq("admin_hidden", false);
      }
    } else {
      for (const childId of childIds) {
        await admin
          .from("manuscripts")
          .update({ admin_hidden: false, admin_note: null })
          .eq("owner_id", childId)
          .eq("admin_note", "owner_deactivated");
      }
    }
  }

  return NextResponse.json({ ok: true, is_deactivated: deactivating });
}
