export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import { YOUTH_ALLOWED_CATEGORIES } from "@/lib/manuscriptOptions";
import { createHash } from "crypto";

// mulberry32 seeded PRNG — deterministic, fast, good distribution
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Stable UTC week number (days since Unix epoch / 7, floored)
function utcWeekNumber(now: Date): number {
  return Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
}

// Spread week seed across full int32 range via a quick hash
function weekSeed(weekNum: number): number {
  const hex = createHash("md5").update(String(weekNum)).digest("hex").slice(0, 8);
  return parseInt(hex, 16) | 0;
}

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

  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat

  // Build the query with day-appropriate server-side sort.
  // Sunday (0) is handled post-fetch with a seeded shuffle, so we use a
  // stable fallback order (id ASC) to ensure the shuffle input is consistent.
  type OrderCol = "created_at" | "tip_count" | "view_count" | "id";
  const orderMap: Record<number, { col: OrderCol; asc: boolean }[]> = {
    0: [{ col: "id", asc: true }],                                              // Sunday  — shuffle below
    1: [{ col: "created_at", asc: false }],                                     // Monday  — newest first
    2: [{ col: "created_at", asc: true }],                                      // Tuesday — oldest first
    3: [{ col: "tip_count", asc: false }, { col: "created_at", asc: false }],   // Wednesday — most tipped
    4: [{ col: "tip_count", asc: true },  { col: "created_at", asc: false }],   // Thursday  — least tipped
    5: [{ col: "view_count", asc: true },  { col: "created_at", asc: false }],  // Friday    — fewest reads
    6: [{ col: "view_count", asc: false }, { col: "created_at", asc: false }],  // Saturday  — most reads
  };

  const orders = orderMap[utcDay] ?? orderMap[1];

  let q = admin
    .from("manuscripts")
    .select(
      "id, owner_id, title, genre, categories, word_count, chapter_count, " +
      "requested_feedback, age_rating, created_at, cover_url, description, stage, " +
      "tip_count, view_count"
    )
    .eq("visibility", "public");

  for (const { col, asc } of orders) {
    q = q.order(col, { ascending: asc });
  }

  q = q.limit(200);

  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{ owner_id: string; categories?: string[] | null; genre?: string | null }>;

  if (rows.length === 0) {
    return NextResponse.json({ manuscripts: [], isYouth: viewerIsYouth, sortDay: utcDay });
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
      const cats = (m.categories?.length ? m.categories : m.genre ? [m.genre] : []) as string[];
      return cats.some((c) => youthCategorySet.has(c));
    }
    return !ownerIsYouth;
  });

  // Sunday: apply seeded deterministic shuffle (consistent for all users same day)
  const manuscripts = utcDay === 0
    ? seededShuffle(filtered, weekSeed(utcWeekNumber(now)))
    : filtered;

  return NextResponse.json({ manuscripts, isYouth: viewerIsYouth, sortDay: utcDay });
}
