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

  const supabase = adminClient();
  const body = await req.json() as {
    type: string;
    // audit fields
    action?: string;
    target_type?: string;
    target_id?: string;
    old_value?: unknown;
    new_value?: unknown;
    notes?: string;
    // update fields
    table?: string;
    id_column?: string;
    id_value?: string;
    updates?: Record<string, unknown>;
    // delete
    delete_table?: string;
    delete_column?: string;
    delete_value?: string;
    // insert
    insert_table?: string;
    insert_row?: Record<string, unknown>;
    // announcement
    admin_id?: string;
    title?: string;
    body?: string;
    reward_coins?: number | null;
    // ledger insert
    user_id?: string;
    delta?: number;
    reason?: string;
    metadata?: Record<string, unknown>;
  };

  if (body.type === "audit") {
    const { error } = await supabase.from("admin_audit_log").insert({
      admin_id: adminId,
      action: body.action,
      target_type: body.target_type,
      target_id: body.target_id,
      old_value: body.old_value ?? null,
      new_value: body.new_value ?? null,
      notes: body.notes ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "update" && body.table && body.id_column && body.id_value && body.updates) {
    const { error } = await supabase.from(body.table).update(body.updates).eq(body.id_column, body.id_value);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "delete" && body.delete_table && body.delete_column && body.delete_value) {
    const { error } = await supabase.from(body.delete_table).delete().eq(body.delete_column, body.delete_value);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "delete_user" && body.user_id) {
    const uid = body.user_id;
    // Delete from tables that may not have ON DELETE CASCADE (created outside migrations)
    const { data: userComments } = await supabase.from("discussion_comments").select("id").eq("author_id", uid);
    const commentIds = (userComments ?? []).map((c: { id: string }) => c.id);
    if (commentIds.length > 0) {
      await supabase.from("discussion_comments").update({ reply_to_id: null }).in("reply_to_id", commentIds);
    }
    await supabase.from("discussion_comments").delete().eq("author_id", uid);
    await supabase.from("discussion_posts").delete().eq("author_id", uid);
    await supabase.from("admin_audit_log").delete().eq("target_id", uid);
    await supabase.from("admin_audit_log").delete().eq("admin_id", uid);
    // Delete auth user via direct SQL (auth.admin.deleteUser has known API-level issues)
    const { error } = await supabase.rpc("delete_user_account", { uid });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "insert" && body.insert_table && body.insert_row) {
    const { error } = await supabase.from(body.insert_table).insert(body.insert_row);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "mod_note" && body.target_type && body.target_id && body.notes) {
    const { data: noteData, error } = await supabase.from("admin_moderation_notes").insert({
      admin_id: adminId,
      target_type: body.target_type,
      target_id: body.target_id,
      note: body.notes,
    }).select("id, created_at, admin_id, target_type, target_id, note").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(noteData);
  }

  if (body.type === "load_mod_notes" && body.target_id) {
    const { data, error } = await supabase
      .from("admin_moderation_notes")
      .select("id, created_at, admin_id, target_type, target_id, note")
      .eq("target_id", body.target_id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as { admin_id: string; [k: string]: unknown }[];
    const adminIds = [...new Set(rows.map(r => r.admin_id))];
    const { data: admins } = adminIds.length
      ? await supabase.from("accounts").select("user_id, full_name").in("user_id", adminIds)
      : { data: [] };
    const adminMap: Record<string, string | null> = {};
    ((admins ?? []) as { user_id: string; full_name: string | null }[]).forEach(a => { adminMap[a.user_id] = a.full_name; });
    return NextResponse.json(rows.map(r => ({ ...r, admin_name: adminMap[r.admin_id] ?? null })));
  }

  if (body.type === "ledger_insert" && body.user_id && body.delta !== undefined && body.reason) {
    const { error } = await supabase.from("bloom_coin_ledger").insert({
      user_id: body.user_id,
      delta: body.delta,
      reason: body.reason,
      metadata: body.metadata ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "announcement" && body.title && body.body) {
    const rewardCoins = body.reward_coins ?? null;

    // Insert the announcement
    const { data: annData, error: annError } = await supabase
      .from("admin_announcements")
      .insert({ author_id: adminId, title: body.title, body: body.body, reward_coins: rewardCoins })
      .select("id")
      .single();
    if (annError) return NextResponse.json({ error: annError.message }, { status: 500 });
    const announcementId = (annData as { id: string }).id;

    // Fetch all user IDs
    const { data: users } = await supabase.from("accounts").select("user_id");
    const userIds = ((users ?? []) as { user_id: string }[]).map(u => u.user_id);

    // Fan out a notification to every user in batches of 500
    const notifTitle = `📢 ${body.title}`;
    const metadata = rewardCoins ? { announcement_id: announcementId, reward_coins: rewardCoins } : null;

    for (let i = 0; i < userIds.length; i += 500) {
      const batch = userIds.slice(i, i + 500).map(uid => ({
        user_id: uid,
        title: notifTitle,
        body: body.body!,
        metadata,
      }));
      await supabase.from("system_notifications").insert(batch);
    }

    return NextResponse.json({ ok: true, notified: userIds.length });
  }

  return NextResponse.json({ error: "Unknown action type" }, { status: 400 });
}
