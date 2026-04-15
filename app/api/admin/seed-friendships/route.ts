import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Called after new user signup and after admin promotion.
// Only auto-friends with lethalbloom_owner - other admins are not auto-friended.

const AUTO_FRIEND_USERNAME = "lethalbloom_owner";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getAutoFriendAdminId(supabase: ReturnType<typeof adminClient>): Promise<string | null> {
  const { data } = await supabase
    .from("public_profiles")
    .select("user_id")
    .eq("username", AUTO_FRIEND_USERNAME)
    .maybeSingle();
  return (data as { user_id: string } | null)?.user_id ?? null;
}

export async function POST(req: Request) {
  const supabase = adminClient();
  const body = await req.json() as { user_id?: string; admin_id?: string };

  if (body.admin_id) {
    // An admin was just promoted - only auto-friend if it's lethalbloom_owner
    const autoId = await getAutoFriendAdminId(supabase);
    if (!autoId || body.admin_id !== autoId) {
      return NextResponse.json({ ok: true, count: 0, skipped: true });
    }

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
    // A new user signed up - only friend them with lethalbloom_owner
    const autoId = await getAutoFriendAdminId(supabase);
    if (!autoId || autoId === body.user_id) {
      return NextResponse.json({ ok: true, count: 0 });
    }

    await supabase
      .from("profile_friend_requests")
      .upsert(
        [{ sender_id: body.user_id, receiver_id: autoId, status: "accepted" }],
        { onConflict: "sender_id,receiver_id" }
      );

    return NextResponse.json({ ok: true, count: 1 });
  }

  return NextResponse.json({ error: "Provide user_id or admin_id" }, { status: 400 });
}

// GET - backfill all existing users with lethalbloom_owner only
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: acc } = await supabase.from("accounts").select("is_admin").eq("user_id", user.id).maybeSingle();
  if (!(acc as { is_admin?: boolean } | null)?.is_admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const autoId = await getAutoFriendAdminId(supabase);
  if (!autoId) return NextResponse.json({ error: "lethalbloom_owner not found" }, { status: 404 });

  const { data: allUsers } = await supabase.from("accounts").select("user_id");
  const allUserIds = ((allUsers ?? []) as { user_id: string }[]).map(u => u.user_id);

  const rows = allUserIds
    .filter(uid => uid !== autoId)
    .map(uid => ({ sender_id: autoId, receiver_id: uid, status: "accepted" }));

  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 500) {
      await supabase
        .from("profile_friend_requests")
        .upsert(rows.slice(i, i + 500), { onConflict: "sender_id,receiver_id" });
    }
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
