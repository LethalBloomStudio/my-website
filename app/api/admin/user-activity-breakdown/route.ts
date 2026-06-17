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

type ChapterJoin = { chapter_order: number | null; title: string | null } | { chapter_order: number | null; title: string | null }[] | null;
type ManuscriptJoin = { title: string | null; owner_id: string | null } | { title: string | null; owner_id: string | null }[] | null;

function resolveChapter(c: ChapterJoin) {
  const ch = Array.isArray(c) ? c[0] : c;
  return { chapter_order: ch?.chapter_order ?? null, chapter_title: ch?.title ?? null };
}
function resolveManuscript(m: ManuscriptJoin) {
  const ms = Array.isArray(m) ? m[0] : m;
  return { manuscript_title: ms?.title ?? null, owner_id: ms?.owner_id ?? null };
}

export async function GET(req: Request) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = new URL(req.url).searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const supabase = adminClient();

  const [feedbackRes, chaptersRes, ledgerRes, manuscriptsRes] = await Promise.all([
    supabase
      .from("line_feedback")
      .select("id, word_count, created_at, chapter:manuscript_chapters(chapter_order, title), manuscript:manuscripts(title, owner_id)")
      .eq("reader_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("chapter_read_completions")
      .select("id, completed_at, chapter:manuscript_chapters(chapter_order, title), manuscript:manuscripts(title, owner_id)")
      .eq("reader_id", userId)
      .order("completed_at", { ascending: false }),
    supabase
      .from("bloom_coin_ledger")
      .select("id, created_at, metadata")
      .eq("user_id", userId)
      .eq("reason", "author_reward")
      .order("created_at", { ascending: false }),
    supabase
      .from("manuscripts")
      .select("id")
      .eq("owner_id", userId),
  ]);

  const manuscriptIds = ((manuscriptsRes.data ?? []) as { id: string }[]).map(m => m.id);
  const manuscriptsUploaded = manuscriptIds.length;
  let chaptersUploaded = 0;
  if (manuscriptIds.length > 0) {
    const { count } = await supabase
      .from("manuscript_chapters")
      .select("id", { count: "exact", head: true })
      .in("manuscript_id", manuscriptIds);
    chaptersUploaded = count ?? 0;
  }

  const feedbackRaw = ((feedbackRes.data ?? []) as unknown as Array<{
    id: string;
    word_count: number | null;
    created_at: string;
    chapter: ChapterJoin;
    manuscript: ManuscriptJoin;
  }>);

  const chapterRaw = ((chaptersRes.data ?? []) as unknown as Array<{
    id: string;
    completed_at: string;
    chapter: ChapterJoin;
    manuscript: ManuscriptJoin;
  }>);

  const ledgerRows = (ledgerRes.data ?? []) as Array<{
    id: string;
    created_at: string;
    metadata: { from_user_id?: string; reward_reason?: string; manuscript_id?: string } | null;
  }>;

  // Collect all user IDs that need name resolution
  const allIds = new Set<string>();
  for (const r of feedbackRaw) {
    const ms = Array.isArray(r.manuscript) ? r.manuscript[0] : r.manuscript;
    if (ms?.owner_id) allIds.add(ms.owner_id);
  }
  for (const r of chapterRaw) {
    const ms = Array.isArray(r.manuscript) ? r.manuscript[0] : r.manuscript;
    if (ms?.owner_id) allIds.add(ms.owner_id);
  }
  for (const r of ledgerRows) {
    if (r.metadata?.from_user_id) allIds.add(r.metadata.from_user_id);
  }

  // Resolve names: pen_name > username > full_name
  const nameMap: Record<string, string | null> = {};
  if (allIds.size > 0) {
    const ids = [...allIds];
    const [profilesRes, accountsRes] = await Promise.all([
      supabase.from("public_profiles").select("user_id, pen_name, username").in("user_id", ids),
      supabase.from("accounts").select("user_id, full_name").in("user_id", ids),
    ]);
    ((accountsRes.data ?? []) as Array<{ user_id: string; full_name: string | null }>)
      .forEach(a => { nameMap[a.user_id] = a.full_name ?? null; });
    // profiles override accounts — pen_name/username preferred over full_name
    ((profilesRes.data ?? []) as Array<{ user_id: string; pen_name: string | null; username: string | null }>)
      .forEach(p => { nameMap[p.user_id] = p.pen_name ?? p.username ?? nameMap[p.user_id] ?? null; });
  }

  const feedbackRows = feedbackRaw.map(r => {
    const { chapter_order, chapter_title } = resolveChapter(r.chapter);
    const { manuscript_title, owner_id } = resolveManuscript(r.manuscript);
    return {
      id: r.id,
      word_count: r.word_count,
      created_at: r.created_at,
      manuscript_title,
      chapter_order,
      chapter_title,
      author_name: owner_id ? (nameMap[owner_id] ?? null) : null,
    };
  });

  const chapterRows = chapterRaw.map(r => {
    const { chapter_order, chapter_title } = resolveChapter(r.chapter);
    const { manuscript_title, owner_id } = resolveManuscript(r.manuscript);
    return {
      id: r.id,
      completed_at: r.completed_at,
      manuscript_title,
      chapter_order,
      chapter_title,
      author_name: owner_id ? (nameMap[owner_id] ?? null) : null,
    };
  });

  const rewardEvents = ledgerRows.map(r => ({
    id: r.id,
    created_at: r.created_at,
    reward_reason: r.metadata?.reward_reason ?? null,
    from_user_name: r.metadata?.from_user_id ? (nameMap[r.metadata.from_user_id] ?? null) : null,
    manuscript_id: r.metadata?.manuscript_id ?? null,
  }));

  return NextResponse.json({ feedbackRows, chapterRows, rewardEvents, manuscriptsUploaded, chaptersUploaded });
}
