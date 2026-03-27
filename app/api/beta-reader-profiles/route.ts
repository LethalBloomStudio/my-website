import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

export async function GET() {
  const serverClient = await supabaseServer();
  const { data: { user } } = await serverClient.auth.getUser();

  const admin = supabaseAdmin();

  // Determine the viewer's age category
  let viewerIsYouth = false;
  if (user) {
    const { data: acct } = await admin
      .from("accounts")
      .select("age_category")
      .eq("user_id", user.id)
      .maybeSingle();
    viewerIsYouth = (acct as { age_category?: string } | null)?.age_category === "youth_13_17";
  }

  // Fetch all public beta reader profiles
  const { data: profiles, error } = await admin
    .from("public_profiles")
    .select("user_id, username, pen_name, avatar_url, bio, beta_reader_level, reads_genres, feedback_areas, feedback_strengths")
    .eq("is_public", true)
    .not("beta_reader_level", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profileList = (profiles ?? []) as Array<{ user_id: string }>;

  if (profileList.length === 0) {
    return NextResponse.json({ profiles: [], isYouth: viewerIsYouth });
  }

  // Fetch age categories for all profiles using admin (bypasses RLS)
  const { data: acctRows } = await admin
    .from("accounts")
    .select("user_id, age_category")
    .in("user_id", profileList.map((p) => p.user_id));

  const ageCategoryMap = new Map(
    ((acctRows as Array<{ user_id: string; age_category: string }> | null) ?? []).map(
      (r) => [r.user_id, r.age_category]
    )
  );

  // Filter: youth viewers only see youth profiles; adult/unauthenticated viewers never see youth
  const filtered = profileList.filter((p) => {
    const isYouthProfile = ageCategoryMap.get(p.user_id) === "youth_13_17";
    if (viewerIsYouth) return isYouthProfile;
    return !isYouthProfile;
  });

  return NextResponse.json({ profiles: filtered, isYouth: viewerIsYouth });
}
