import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Called after new user signup and after admin promotion.
// Creates accepted friend_requests between the user and all admins (or vice versa).

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: Request) {
  const supabase = adminClient();
  const body = await req.json() as { user_id?: string; admin_id?: string };

  if (body.admin_id) {
    // An admin was just promoted — friend them with every existing user
    const { data: users } = await supabase
      .from("accounts")
      .select("user_id")
      .neq("user_id", body.admin_id);

    const rows = ((users ?? []) as { user_id: string }[]).map(u => ({
      sender_id: body.admin_id!,
      receiver_id: u.user_id,
      status: "accepted",
    }));

    if (rows.length > 0) {
      await supabase
        .from("profile_friend_requests")
        .upsert(rows, { onConflict: "sender_id,receiver_id" });
    }
    return NextResponse.json({ ok: true, count: rows.length });
  }

  if (body.user_id) {
    // A new user signed up — friend them with all current admins
    const { data: admins } = await supabase
      .from("accounts")
      .select("user_id")
      .eq("is_admin", true)
      .neq("user_id", body.user_id);

    const rows = ((admins ?? []) as { user_id: string }[]).map(a => ({
      sender_id: body.user_id!,
      receiver_id: a.user_id,
      status: "accepted",
    }));

    if (rows.length > 0) {
      await supabase
        .from("profile_friend_requests")
        .upsert(rows, { onConflict: "sender_id,receiver_id" });
    }
    return NextResponse.json({ ok: true, count: rows.length });
  }

  return NextResponse.json({ error: "Provide user_id or admin_id" }, { status: 400 });
}

// GET — backfill all existing users with all admins (run once from admin dashboard)
export async function GET(req: Request) {
  // Only allow admins to trigger the backfill
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: acc } = await supabase.from("accounts").select("is_admin").eq("user_id", user.id).maybeSingle();
  if (!(acc as { is_admin?: boolean } | null)?.is_admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: admins }, { data: allUsers }] = await Promise.all([
    supabase.from("accounts").select("user_id").eq("is_admin", true),
    supabase.from("accounts").select("user_id"),
  ]);

  const adminIds = new Set(((admins ?? []) as { user_id: string }[]).map(a => a.user_id));
  const allUserIds = ((allUsers ?? []) as { user_id: string }[]).map(u => u.user_id);

  const rows: { sender_id: string; receiver_id: string; status: string }[] = [];
  for (const adminId of adminIds) {
    for (const userId of allUserIds) {
      if (adminId !== userId) {
        rows.push({ sender_id: adminId, receiver_id: userId, status: "accepted" });
      }
    }
  }

  if (rows.length > 0) {
    // Upsert in batches of 500
    for (let i = 0; i < rows.length; i += 500) {
      await supabase
        .from("profile_friend_requests")
        .upsert(rows.slice(i, i + 500), { onConflict: "sender_id,receiver_id" });
    }
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
