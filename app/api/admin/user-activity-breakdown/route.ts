import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function verifyAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return false;
  const supabase = adminClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return false;
  const { data } = await supabase
    .from("accounts")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  const acc = data as { is_admin?: boolean } | null;
  return !!acc?.is_admin;
}

export async function GET(req: Request) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = new URL(req.url).searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const supabase = adminClient();

  const [feedbackRes, chaptersRes, ledgerRes] = await Promise.all([
    supabase
      .from("line_feedback")
      .select("id, word_count, created_at, manuscript:manuscripts(title)")
      .eq("reader_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("chapter_read_completions")
      .select("id, completed_at, manuscript:manuscripts(title)")
      .eq("reader_id", userId)
      .order("completed_at", { ascending: false }),
    supabase
      .from("bloom_coin_ledger")
      .select("id, created_at, metadata")
      .eq("user_id", userId)
      .eq("reason", "author_reward")
      .order("created_at", { ascending: false }),
  ]);

  const ledgerRows = (ledgerRes.data ?? []) as Array<{
    id: string;
    created_at: string;
    metadata: { from_user_id?: string; reward_reason?: string; manuscript_id?: string } | null;
  }>;

  const giverIds = [...new Set(
    ledgerRows.map(r => r.metadata?.from_user_id).filter((id): id is string => !!id)
  )];

  const giverNameMap: Record<string, string | null> = {};
  if (giverIds.length > 0) {
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("user_id, pen_name, username")
      .in("user_id", giverIds);
    ((profiles ?? []) as Array<{ user_id: string; pen_name: string | null; username: string | null }>)
      .forEach(p => { giverNameMap[p.user_id] = p.pen_name ?? p.username ?? null; });
  }

  const feedbackRows = ((feedbackRes.data ?? []) as unknown as Array<{
    id: string;
    word_count: number | null;
    created_at: string;
    manuscript: { title: string | null } | { title: string | null }[] | null;
  }>).map(r => ({
    id: r.id,
    word_count: r.word_count,
    created_at: r.created_at,
    manuscript_title: Array.isArray(r.manuscript) ? (r.manuscript[0]?.title ?? null) : (r.manuscript?.title ?? null),
  }));

  const chapterRows = ((chaptersRes.data ?? []) as unknown as Array<{
    id: string;
    completed_at: string;
    manuscript: { title: string | null } | { title: string | null }[] | null;
  }>).map(r => ({
    id: r.id,
    completed_at: r.completed_at,
    manuscript_title: Array.isArray(r.manuscript) ? (r.manuscript[0]?.title ?? null) : (r.manuscript?.title ?? null),
  }));

  const rewardEvents = ledgerRows.map(r => ({
    id: r.id,
    created_at: r.created_at,
    reward_reason: r.metadata?.reward_reason ?? null,
    from_user_name: r.metadata?.from_user_id ? (giverNameMap[r.metadata.from_user_id] ?? null) : null,
    manuscript_id: r.metadata?.manuscript_id ?? null,
  }));

  return NextResponse.json({ feedbackRows, chapterRows, rewardEvents });
}
