export const dynamic = "force-dynamic";

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

  // Fetch all public profiles (admin accounts may not have beta_reader_level set)
  const { data: profiles, error } = await admin
    .from("public_profiles")
    .select("user_id, username, pen_name, avatar_url, bio, beta_reader_level, reads_genres, feedback_areas, feedback_strengths")
    .eq("is_public", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profileList = (profiles ?? []) as Array<{ user_id: string }>;

  if (profileList.length === 0) {
    return NextResponse.json({ profiles: [], isYouth: viewerIsYouth });
  }

  // Fetch age categories and admin status for all profiles using admin (bypasses RLS)
  const { data: acctRows } = await admin
    .from("accounts")
    .select("user_id, age_category, is_admin")
    .in("user_id", profileList.map((p) => p.user_id));

  const ageCategoryMap = new Map(
    ((acctRows as Array<{ user_id: string; age_category: string; is_admin?: boolean }> | null) ?? []).map(
      (r) => [r.user_id, r.age_category]
    )
  );
  const adminSet = new Set(
    ((acctRows as Array<{ user_id: string; is_admin?: boolean }> | null) ?? [])
      .filter((r) => r.is_admin)
      .map((r) => r.user_id)
  );

  // Filter: must be a beta reader or admin to appear; youth viewers see youth + admin only;
  // exclude profiles with no identifying information (null username AND null pen_name)
  const filtered = profileList.filter((p) => {
    const typed = p as { beta_reader_level?: string | null; username?: string | null; pen_name?: string | null };
    const isYouthProfile = ageCategoryMap.get(p.user_id) === "youth_13_17";
    const isAdminProfile = adminSet.has(p.user_id);
    const hasBetaLevel = typed.beta_reader_level != null;
    const hasIdentity = typed.username != null || typed.pen_name != null;
    if (!hasBetaLevel && !isAdminProfile) return false;
    if (!hasIdentity) return false;
    if (viewerIsYouth) return isYouthProfile || isAdminProfile;
    return !isYouthProfile;
  });

  return NextResponse.json({ profiles: filtered, isYouth: viewerIsYouth });
}
