export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import { YOUTH_ALLOWED_CATEGORIES } from "@/lib/manuscriptOptions";

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

  // Fetch all public manuscripts
  const { data, error } = await admin
    .from("manuscripts")
    .select("id, owner_id, title, genre, categories, word_count, requested_feedback, age_rating, created_at, cover_url, description")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{ owner_id: string; categories?: string[] | null; genre?: string | null }>;

  if (rows.length === 0) {
    return NextResponse.json({ manuscripts: [], isYouth: viewerIsYouth });
  }

  // Fetch age categories for all owners using admin (bypasses RLS)
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id)));
  const { data: acctRows } = await admin
    .from("accounts")
    .select("user_id, age_category")
    .in("user_id", ownerIds);

  const ageCategoryMap = new Map(
    ((acctRows as Array<{ user_id: string; age_category: string }> | null) ?? []).map(
      (r) => [r.user_id, r.age_category]
    )
  );

  const youthCategorySet = new Set(YOUTH_ALLOWED_CATEGORIES);

  const filtered = rows.filter((m) => {
    const ownerIsYouth = ageCategoryMap.get(m.owner_id) === "youth_13_17";
    if (viewerIsYouth) {
      // Youth viewers see any manuscript that has at least one youth-allowed category,
      // regardless of whether the owner is adult or youth.
      const cats = (m.categories?.length ? m.categories : m.genre ? [m.genre] : []) as string[];
      return cats.some((c) => youthCategorySet.has(c));
    }
    // Adult viewers never see manuscripts owned by youth
    return !ownerIsYouth;
  });

  return NextResponse.json({ manuscripts: filtered, isYouth: viewerIsYouth });
}
