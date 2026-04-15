export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

// GET - return the current user's favorited friend IDs
export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ favorites: [] });

  const { data } = await supabase
    .from("friend_favorites")
    .select("friend_user_id")
    .eq("user_id", user.id);

  const favorites = ((data ?? []) as Array<{ friend_user_id: string }>).map((r) => r.friend_user_id);
  return NextResponse.json({ favorites });
}

// POST - toggle a favorite { friendUserId: string }
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { friendUserId } = await req.json() as { friendUserId?: string };
  if (!friendUserId) return NextResponse.json({ error: "Missing friendUserId" }, { status: 400 });

  // Check if already favorited
  const { data: existing } = await supabase
    .from("friend_favorites")
    .select("friend_user_id")
    .eq("user_id", user.id)
    .eq("friend_user_id", friendUserId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("friend_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("friend_user_id", friendUserId);
    return NextResponse.json({ favorited: false });
  } else {
    await supabase
      .from("friend_favorites")
      .insert({ user_id: user.id, friend_user_id: friendUserId });
    return NextResponse.json({ favorited: true });
  }
}
