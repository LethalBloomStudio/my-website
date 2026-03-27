import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const YOUTH_CATEGORIES = [
  "YA Fantasy",
  "YA Contemporary",
  "YA Romance",
  "YA Dystopian",
  "MG Fantasy",
  "MG Adventure",
];

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const audience = searchParams.get("audience") ?? "adult";
  const ageCategory = audience === "youth" ? "youth_13_17" : "adult_18_plus";

  const supabase = adminClient();

  const { data: acctRows } = await supabase
    .from("accounts")
    .select("user_id")
    .eq("age_category", ageCategory);

  const ownerIds = ((acctRows ?? []) as { user_id: string }[]).map((a) => a.user_id);

  if (audience === "adult") {
    if (ownerIds.length === 0) return NextResponse.json([]);
    const { data } = await supabase
      .from("manuscripts")
      .select("id, title, cover_url, owner_id")
      .eq("visibility", "public")
      .in("owner_id", ownerIds)
      .order("created_at", { ascending: false })
      .limit(500);
    return NextResponse.json(data ?? []);
  }

  // Youth audience: include manuscripts from youth account owners AND
  // manuscripts from adult owners that are categorised as YA/MG
  const [youthManuscripts, yaManuscripts] = await Promise.all([
    ownerIds.length > 0
      ? supabase
          .from("manuscripts")
          .select("id, title, cover_url, owner_id")
          .eq("visibility", "public")
          .in("owner_id", ownerIds)
          .order("created_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] }),
    supabase
      .from("manuscripts")
      .select("id, title, cover_url, owner_id, categories")
      .eq("visibility", "public")
      .overlaps("categories", YOUTH_CATEGORIES)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  // Merge and deduplicate by id
  const seen = new Set<string>();
  const merged: { id: string; title: string; cover_url: string | null; owner_id: string }[] = [];
  for (const row of [
    ...((youthManuscripts.data ?? []) as { id: string; title: string; cover_url: string | null; owner_id: string }[]),
    ...((yaManuscripts.data ?? []) as { id: string; title: string; cover_url: string | null; owner_id: string }[]),
  ]) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push({ id: row.id, title: row.title, cover_url: row.cover_url, owner_id: row.owner_id });
    }
  }

  // Sort merged list by created_at desc (best-effort — both sub-queries are already ordered)
  return NextResponse.json(merged);
}
