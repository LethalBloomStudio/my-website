import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

type AccountRow = {
  user_id: string;
  age_category: string | null;
};

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { title?: string; user_ids?: string[] };
  const requestedIds = Array.isArray(body.user_ids) ? body.user_ids.map((value) => String(value).trim()).filter(Boolean) : [];
  const participantIds = Array.from(new Set(requestedIds.filter((value) => value !== userId)));

  if (participantIds.length < 2) {
    return NextResponse.json({ error: "Choose at least two other users to start a group chat." }, { status: 400 });
  }

  const allMemberIds = [userId, ...participantIds];
  const { data: accounts } = await admin
    .from("accounts")
    .select("user_id, age_category")
    .in("user_id", allMemberIds);

  const accountRows = (accounts ?? []) as AccountRow[];
  if (accountRows.length !== allMemberIds.length) {
    return NextResponse.json({ error: "One or more selected users could not be found." }, { status: 404 });
  }

  if (accountRows.some((row) => row.age_category === "youth_13_17")) {
    return NextResponse.json({ error: "Group messaging with youth profiles is locked for safety." }, { status: 403 });
  }

  const { data: memberProfiles } = await admin
    .from("public_profiles")
    .select("user_id, pen_name, username")
    .in("user_id", participantIds);

  const labelMap = new Map(
    ((memberProfiles ?? []) as Array<{ user_id: string; pen_name: string | null; username: string | null }>).map((profile) => [
      profile.user_id,
      profile.pen_name || (profile.username ? `@${profile.username}` : "User"),
    ])
  );

  const title =
    String(body.title ?? "").trim() ||
    Array.from(new Set(participantIds.map((id) => labelMap.get(id) ?? "User"))).slice(0, 3).join(", ");

  const { data: conversation, error: conversationError } = await admin
    .from("group_message_conversations")
    .insert({
      created_by: userId,
      title: title || "New group chat",
    })
    .select("id, title")
    .single();

  if (conversationError || !conversation) {
    return NextResponse.json({ error: conversationError?.message ?? "Failed to create group chat." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: membersError } = await admin.from("group_message_members").insert(
    allMemberIds.map((memberId) => ({
      conversation_id: conversation.id,
      user_id: memberId,
      joined_at: now,
      last_read_at: memberId === userId ? now : null,
      updated_at: now,
    }))
  );

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 400 });
  }

  const { data: participants } = await admin
    .from("public_profiles")
    .select("user_id, pen_name, username, avatar_url")
    .in("user_id", allMemberIds);

  return NextResponse.json({
    ok: true,
    conversation: {
      id: conversation.id,
      title: conversation.title,
      participants: ((participants ?? []) as Array<{ user_id: string; pen_name: string | null; username: string | null; avatar_url: string | null }>)
        .map((profile) => ({
          user_id: profile.user_id,
          label: profile.pen_name || (profile.username ? `@${profile.username}` : "User"),
          avatar_url: profile.avatar_url ?? null,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    },
  });
}
