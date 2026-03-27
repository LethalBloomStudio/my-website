import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

// GET /api/friend-requests/pending
// Returns pending friend requests for the current user with sender profile info.
// Uses supabaseAdmin for profile lookups so youth profiles (is_public = false) are included.
export async function GET() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  const { data: requests } = await admin
    .from("profile_friend_requests")
    .select("sender_id, created_at")
    .eq("receiver_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const senderIds = ((requests ?? []) as { sender_id: string; created_at: string }[]).map(
    (r) => r.sender_id
  );

  let profiles: { user_id: string; pen_name: string | null; username: string | null; avatar_url: string | null }[] = [];
  if (senderIds.length > 0) {
    const { data: profileData } = await admin
      .from("public_profiles")
      .select("user_id, pen_name, username, avatar_url")
      .in("user_id", senderIds);
    profiles = (profileData as typeof profiles | null) ?? [];
  }

  const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

  const result = ((requests ?? []) as { sender_id: string; created_at: string }[]).map((r) => {
    const profile = profileMap.get(r.sender_id);
    return {
      senderId: r.sender_id,
      penName: profile?.pen_name || (profile?.username ? `@${profile.username}` : "Unknown"),
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      createdAt: r.created_at,
    };
  });

  return NextResponse.json({ requests: result });
}
