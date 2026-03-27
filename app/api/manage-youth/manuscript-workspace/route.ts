import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const manuscriptId = url.searchParams.get("manuscript_id");
    const chapterId = url.searchParams.get("chapter_id");

    if (!manuscriptId) {
      return NextResponse.json({ error: "Missing manuscript_id." }, { status: 400 });
    }

    // Identify caller from session cookie
    const cookieStore = await cookies();
    const supabaseServer = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const supabase = supabaseAdmin();

    // Fetch manuscript
    const { data: manuscript } = await supabase
      .from("manuscripts")
      .select(
        "id, owner_id, title, genre, categories, age_rating, content, cover_url, description, requested_feedback, potential_triggers, copyright_info, visibility, word_count, chapter_count, created_at, parent_disabled, parent_disabled_reason"
      )
      .eq("id", manuscriptId)
      .maybeSingle();

    if (!manuscript) {
      return NextResponse.json({ error: "Manuscript not found." }, { status: 404 });
    }

    // Verify caller is an active parent of the manuscript owner
    const { data: link } = await supabase
      .from("youth_links")
      .select("id")
      .eq("parent_user_id", user.id)
      .eq("child_user_id", manuscript.owner_id)
      .eq("status", "active")
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    // Fetch all chapters (including private)
    const { data: chapters } = await supabase
      .from("manuscript_chapters")
      .select("id, title, chapter_order, content, is_private, created_at")
      .eq("manuscript_id", manuscriptId)
      .order("chapter_order", { ascending: true });

    // Fetch access grants
    const { data: grants } = await supabase
      .from("manuscript_access_grants")
      .select("id, reader_id")
      .eq("manuscript_id", manuscriptId);

    // Fetch pending access requests
    const { data: pendingReqs } = await supabase
      .from("manuscript_access_requests")
      .select("id, requester_id, created_at")
      .eq("manuscript_id", manuscriptId)
      .eq("status", "pending");

    // Fetch chapter-specific feedback (for sidebar when a chapter is open in the reading view)
    const feedbackQuery = supabase
      .from("line_feedback")
      .select(
        "id, reader_id, selection_excerpt, comment_text, chapter_id, start_offset, end_offset, word_count, coins_awarded, created_at, resolved, author_response"
      )
      .eq("manuscript_id", manuscriptId)
      .order("created_at", { ascending: false });

    if (chapterId) {
      feedbackQuery.eq("chapter_id", chapterId);
    } else {
      feedbackQuery.is("chapter_id", null);
    }

    const { data: chapterFeedback } = await feedbackQuery;

    // Fetch ALL feedback across every chapter (for the overview/details panel)
    const { data: ownerAllFeedback } = await supabase
      .from("line_feedback")
      .select(
        "id, reader_id, selection_excerpt, comment_text, chapter_id, start_offset, end_offset, word_count, coins_awarded, created_at, resolved, author_response"
      )
      .eq("manuscript_id", manuscriptId)
      .order("created_at", { ascending: false });

    // Fetch ALL replies across all feedback
    const allFeedbackIds = (ownerAllFeedback ?? []).map((f: { id: string }) => f.id);
    const { data: allReplies } = allFeedbackIds.length
      ? await supabase
          .from("line_feedback_replies")
          .select("id, feedback_id, replier_id, body, created_at")
          .in("feedback_id", allFeedbackIds)
      : { data: [] };

    // Fetch replies for chapter-specific feedback (subset used by reading view)
    const chapterFeedbackIds = (chapterFeedback ?? []).map((f: { id: string }) => f.id);
    const replies = (allReplies ?? []).filter((r: { feedback_id: string }) =>
      chapterFeedbackIds.includes(r.feedback_id)
    );

    // Resolve display names for all involved user IDs
    const allUserIds = Array.from(
      new Set([
        manuscript.owner_id,
        ...(grants ?? []).map((g: { reader_id: string }) => g.reader_id),
        ...(ownerAllFeedback ?? []).map((f: { reader_id: string }) => f.reader_id),
        ...(pendingReqs ?? []).map((r: { requester_id: string }) => r.requester_id),
        ...(allReplies ?? []).map((r: { replier_id: string }) => r.replier_id),
      ])
    );

    const [{ data: profiles }, { data: accounts }] = await Promise.all([
      supabase
        .from("public_profiles")
        .select("user_id, pen_name, username, avatar_url")
        .in("user_id", allUserIds),
      supabase
        .from("accounts")
        .select("user_id, age_category")
        .in("user_id", allUserIds),
    ]);

    const names: Record<string, string> = {};
    const usernames: Record<string, string> = {};
    const penNames: Record<string, string | null> = {};
    const avatars: Record<string, string | null> = {};
    const ages: Record<string, string> = {};

    (profiles ?? []).forEach(
      (p: { user_id: string; pen_name: string | null; username: string | null; avatar_url: string | null }) => {
        names[p.user_id] = p.pen_name || (p.username ? `@${p.username}` : "Writer");
        if (p.username) usernames[p.user_id] = p.username;
        penNames[p.user_id] = p.pen_name;
        avatars[p.user_id] = p.avatar_url;
      }
    );
    (accounts ?? []).forEach(
      (a: { user_id: string; age_category: string | null }) => {
        ages[a.user_id] = a.age_category ?? "";
      }
    );

    // Build accepted readers in the format the details page expects
    const acceptedReaders = (grants ?? []).map((g: { reader_id: string }) => ({
      user_id: g.reader_id,
      avatar_url: avatars[g.reader_id] ?? null,
      pen_name: penNames[g.reader_id] ?? null,
      username: usernames[g.reader_id] ?? null,
      disabled: false,
      left: false,
      suspended: false,
    }));

    // Build pending requests in the format the details page expects
    const youthSet = new Set(
      Object.entries(ages)
        .filter(([, cat]) => cat === "youth_13_17")
        .map(([uid]) => uid)
    );
    const pendingRequestsFormatted = (pendingReqs ?? []).map(
      (r: { id: string; requester_id: string; created_at: string }) => ({
        id: r.id,
        user_id: r.requester_id,
        requester_id: r.requester_id,
        created_at: r.created_at,
        name: names[r.requester_id] || "Reader",
        pen_name: penNames[r.requester_id] ?? null,
        username: usernames[r.requester_id] ?? null,
        avatar_url: avatars[r.requester_id] ?? null,
        isYouth: youthSet.has(r.requester_id),
      })
    );

    return NextResponse.json({
      manuscript,
      chapters: chapters ?? [],
      grants: grants ?? [],
      acceptedReaders,
      pendingRequests: pendingRequestsFormatted,
      chapterFeedback: chapterFeedback ?? [],
      ownerAllFeedback: ownerAllFeedback ?? [],
      allReplies: allReplies ?? [],
      replies,
      names,
      usernames,
      penNames,
      avatars,
      ages,
      parentDisabled: !!(manuscript as { parent_disabled?: boolean }).parent_disabled,
      parentDisabledReason:
        (manuscript as { parent_disabled_reason?: string | null }).parent_disabled_reason ?? null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
