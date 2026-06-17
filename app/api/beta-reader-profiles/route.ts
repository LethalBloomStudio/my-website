export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

export async function GET(req: Request) {
  const serverClient = await supabaseServer();
  const { data: { user } } = await serverClient.auth.getUser();

  const admin = supabaseAdmin();
  const viewParam = new URL(req.url).searchParams.get("view");

  // Determine the viewer's age category and admin status
  let viewerIsYouth = false;
  let viewerIsAdmin = false;
  if (user) {
    const { data: acct } = await admin
      .from("accounts")
      .select("age_category, is_admin")
      .eq("user_id", user.id)
      .maybeSingle();
    const a = acct as { age_category?: string; is_admin?: boolean } | null;
    viewerIsYouth = a?.age_category === "youth_13_17";
    viewerIsAdmin = !!a?.is_admin;
    // Admin requesting youth view sees the same profiles youth accounts see
    if (viewerIsAdmin && viewParam === "youth") viewerIsYouth = true;
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
    .select("user_id, age_category, is_admin, last_active_at, activity_score")
    .in("user_id", profileList.map((p) => p.user_id));

  const acctData = (acctRows as Array<{ user_id: string; age_category: string; is_admin?: boolean; last_active_at?: string | null; activity_score?: number | null }> | null) ?? [];
  const ageCategoryMap = new Map(acctData.map((r) => [r.user_id, r.age_category]));
  const adminSet = new Set(acctData.filter((r) => r.is_admin).map((r) => r.user_id));
  const activityScoreMap = new Map(acctData.map((r) => [r.user_id, r.activity_score ?? 0]));

  // Filter: must be a beta reader or admin to appear; youth viewers see youth + admin only
  const filtered = profileList.filter((p) => {
    const isYouthProfile = ageCategoryMap.get(p.user_id) === "youth_13_17";
    const isAdminProfile = adminSet.has(p.user_id);
    const hasBetaLevel = (p as { beta_reader_level?: string | null }).beta_reader_level != null;
    if (!hasBetaLevel && !isAdminProfile) return false;
    if (viewerIsYouth) return isYouthProfile || isAdminProfile;
    return !isYouthProfile;
  });

  // Attach active badge for each reader
  const filteredIds = filtered.map((p) => p.user_id);
  const { data: badgeRows } = filteredIds.length > 0
    ? await admin.from("reader_badges").select("reader_id, active_badge, badge_count").in("reader_id", filteredIds)
    : { data: [] };

  const badgeData = (badgeRows as Array<{ reader_id: string; active_badge: string; badge_count?: number }> | null) ?? [];
  const badgeMap = new Map(badgeData.map((r) => [r.reader_id, r.active_badge]));
  const badgeCountMap = new Map(badgeData.map((r) => [r.reader_id, r.badge_count ?? 0]));

  const withBadges = filtered.map((p) => ({
    ...p,
    active_badge: badgeMap.get(p.user_id) ?? null,
  }));

  withBadges.sort((a, b) => {
    const aScore = activityScoreMap.get(a.user_id) ?? 0;
    const bScore = activityScoreMap.get(b.user_id) ?? 0;
    if (bScore !== aScore) return bScore - aScore;

    // Tiebreaker: badge count (e.g. two new readers both at 0)
    const aBadges = badgeCountMap.get(a.user_id) ?? 0;
    const bBadges = badgeCountMap.get(b.user_id) ?? 0;
    return bBadges - aBadges;
  });

  return NextResponse.json({ profiles: withBadges, isYouth: viewerIsYouth });
}
