import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

const COST = 100;
const MAX_SLOTS = 25;
const DURATION_MS = 3 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { manuscript_id, audience } = (await req.json()) as {
    manuscript_id?: string;
    audience?: string;
  };

  if (!manuscript_id || !["adult", "youth"].includes(audience ?? "")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  // Verify user's balance and age_category
  const { data: acct } = await admin
    .from("accounts")
    .select("bloom_coins, age_category")
    .eq("user_id", userId)
    .maybeSingle();

  const acctRow = acct as { bloom_coins?: number; age_category?: string } | null;
  const balance = Number(acctRow?.bloom_coins ?? 0);
  if (balance < COST) {
    return NextResponse.json({ error: "Insufficient Bloom Coins." }, { status: 400 });
  }

  // Audience must match user's age category
  const expectedAudience = acctRow?.age_category === "youth_13_17" ? "youth" : "adult";
  if (audience !== expectedAudience) {
    return NextResponse.json({ error: "Audience mismatch." }, { status: 400 });
  }

  // Manuscript must belong to user and be public
  const { data: ms } = await admin
    .from("manuscripts")
    .select("id, categories, genre")
    .eq("id", manuscript_id)
    .eq("owner_id", userId)
    .eq("visibility", "public")
    .maybeSingle();

  if (!ms) {
    return NextResponse.json({ error: "Manuscript not found or not public." }, { status: 404 });
  }

  // Youth carousel only allows YA/MG category books
  if (audience === "youth") {
    const YOUTH_ALLOWED = ["YA Fantasy","YA Contemporary","YA Romance","YA Dystopian","MG Fantasy","MG Adventure"];
    const msRow = ms as { categories?: string[] | null; genre?: string | null };
    const cats = (msRow.categories?.length ? msRow.categories : msRow.genre ? [msRow.genre] : []) as string[];
    if (!cats.some((c) => YOUTH_ALLOWED.includes(c))) {
      return NextResponse.json(
        { error: "Only YA or MG category books can be featured in the youth carousel." },
        { status: 400 }
      );
    }
  }

  // User must not already have an active slot (use limit(1) — maybeSingle throws if duplicates exist)
  const { data: existingRows } = await admin
    .from("featured_manuscripts")
    .select("id")
    .eq("owner_id", userId)
    .eq("audience", audience)
    .gt("expires_at", now)
    .limit(1);

  if (existingRows && existingRows.length > 0) {
    return NextResponse.json(
      { error: "You already have an active featured slot. Wait for it to expire before purchasing another." },
      { status: 400 }
    );
  }

  // Check total slot count
  const { count } = await admin
    .from("featured_manuscripts")
    .select("*", { count: "exact", head: true })
    .eq("audience", audience)
    .gt("expires_at", now);

  if ((count ?? 0) >= MAX_SLOTS) {
    return NextResponse.json(
      { error: "All 25 featured slots are currently full. Check back when a slot opens." },
      { status: 400 }
    );
  }

  const expiresAt = new Date(Date.now() + DURATION_MS).toISOString();

  // Deduct coins
  await admin
    .from("accounts")
    .update({ bloom_coins: balance - COST, updated_at: now })
    .eq("user_id", userId);

  await admin.from("bloom_coin_ledger").insert({
    user_id: userId,
    delta: -COST,
    reason: "featured_slot",
    created_at: now,
  });

  // Insert featured slot
  await admin.from("featured_manuscripts").insert({
    manuscript_id,
    owner_id: userId,
    audience,
    expires_at: expiresAt,
    created_at: now,
  });

  return NextResponse.json({ ok: true, expires_at: expiresAt });
}
