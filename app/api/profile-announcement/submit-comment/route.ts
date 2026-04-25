import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function getSessionUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      }
    );
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    announcement_id: string;
    content: string;
    parent_id?: string | null;
    reply_to_id?: string | null;
    reply_to_author_id?: string | null;
    post_owner_id?: string | null;
  };

  const { announcement_id, content, parent_id, reply_to_id, reply_to_author_id, post_owner_id } = body;
  if (!announcement_id) return NextResponse.json({ error: "Missing announcement_id" }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });

  const supabase = adminClient();

  const { data, error } = await supabase
    .from("profile_announcement_comments")
    .insert({
      announcement_id,
      user_id: userId,
      content: content.trim(),
      parent_id: parent_id ?? null,
      reply_to_id: reply_to_id ?? null,
      reply_to_author_id: reply_to_author_id ?? null,
    })
    .select("id, announcement_id, user_id, content, parent_id, reply_to_id, reply_to_author_id, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [{ data: commenterProfile }, { data: announcementRow }] = await Promise.all([
    supabase
      .from("public_profiles")
      .select("pen_name, username")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profile_announcements")
      .select("user_id")
      .eq("id", announcement_id)
      .maybeSingle(),
  ]);

  const profRow = commenterProfile as { pen_name: string | null; username: string | null } | null;
  const commenterName = profRow?.pen_name ?? profRow?.username ?? "Someone";
  const announcementOwnerId = (announcementRow as { user_id: string } | null)?.user_id ?? post_owner_id ?? null;

  let announcementOwnerUsername: string | null = null;
  if (announcementOwnerId) {
    const { data: ownerProfile } = await supabase
      .from("public_profiles")
      .select("username")
      .eq("user_id", announcementOwnerId)
      .maybeSingle();
    announcementOwnerUsername = (ownerProfile as { username: string | null } | null)?.username ?? null;
  }

  const fallbackProfileLink = `/profile?announcement=${encodeURIComponent(announcement_id)}&comment=${encodeURIComponent(data.id)}`;
  const announcementLink = announcementOwnerUsername
    ? `/u/${encodeURIComponent(announcementOwnerUsername)}?announcement=${encodeURIComponent(announcement_id)}&comment=${encodeURIComponent(data.id)}`
    : null;

  // Notify the post owner (if commenter is not the owner)
  if (post_owner_id && post_owner_id !== userId) {
    await supabase.from("system_notifications").insert({
      user_id: post_owner_id,
      title: "New comment on your announcement",
      body: `${commenterName} commented on your announcement.`,
      metadata: {
        announcement_id,
        announcement_comment_id: data.id,
        profile_username: announcementOwnerUsername,
        link: announcementLink ?? fallbackProfileLink,
        link_label: "View Comment",
      },
    });
  }

  // Notify the person being replied to (if different from commenter and post owner)
  if (reply_to_author_id && reply_to_author_id !== userId && reply_to_author_id !== post_owner_id) {
    await supabase.from("system_notifications").insert({
      user_id: reply_to_author_id,
      title: `${commenterName} replied to your comment`,
      body: "Open the announcement thread to read their reply.",
      metadata: {
        announcement_id,
        announcement_comment_id: data.id,
        profile_username: announcementOwnerUsername,
        link: announcementLink,
        link_label: "View Reply",
      },
    });
  }

  return NextResponse.json({ ok: true, comment: data });
}
