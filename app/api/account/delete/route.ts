import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reason } = (await req.json()) as { reason: string };
  if (!reason?.trim()) return NextResponse.json({ error: "Reason required" }, { status: 400 });

  const admin = supabaseAdmin();

  // Fetch snapshot data before deletion
  const { data: account } = await admin
    .from("accounts")
    .select("full_name, email, subscription_status, bloom_coins, age_category")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: profile } = await admin
    .from("public_profiles")
    .select("username, pen_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const snap = account as {
    full_name: string | null;
    email: string | null;
    subscription_status: string | null;
    bloom_coins: number | null;
    age_category: string | null;
  } | null;

  const prof = profile as { username: string | null; pen_name: string | null } | null;

  // Save deletion snapshot
  await admin.from("deleted_accounts").insert({
    user_id: user.id,
    email_snapshot: snap?.email ?? user.email ?? null,
    full_name_snapshot: snap?.full_name ?? null,
    username_snapshot: prof?.username ?? null,
    pen_name_snapshot: prof?.pen_name ?? null,
    age_category: snap?.age_category ?? null,
    subscription_status: snap?.subscription_status ?? null,
    bloom_coins: snap?.bloom_coins ?? 0,
    reason: reason.trim(),
    deleted_at: new Date().toISOString(),
  });

  // Also cascade: deactivate linked youth accounts before deletion
  const { data: youthLinks } = await admin
    .from("youth_links")
    .select("child_user_id")
    .eq("parent_user_id", user.id)
    .eq("status", "active");

  if (youthLinks && youthLinks.length > 0) {
    const childIds = (youthLinks as { child_user_id: string }[]).map((y) => y.child_user_id);
    await admin
      .from("accounts")
      .update({ is_deactivated: true, deactivated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in("user_id", childIds);
  }

  // Clean up tables that may lack ON DELETE CASCADE
  // Null out reply references to this user's comments before deleting them
  const { data: userComments } = await admin.from("discussion_comments").select("id").eq("author_id", user.id);
  const commentIds = (userComments ?? []).map((c: { id: string }) => c.id);
  if (commentIds.length > 0) {
    await admin.from("discussion_comments").update({ reply_to_id: null }).in("reply_to_id", commentIds);
  }
  await admin.from("discussion_comments").delete().eq("author_id", user.id);
  await admin.from("discussion_posts").delete().eq("author_id", user.id);
  await admin.from("admin_audit_log").delete().eq("target_id", user.id);
  await admin.from("admin_audit_log").delete().eq("admin_id", user.id);
  await admin.from("admin_moderation_notes").delete().eq("admin_id", user.id);

  // Delete the auth user via direct SQL (auth.admin.deleteUser has known API-level issues)
  const { error: deleteError } = await admin.rpc("delete_user_account", { uid: user.id });
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
