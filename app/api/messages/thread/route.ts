import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";

const PAGE_SIZE = 50;

async function ensureCreatorMembership(groupId: string, userId: string) {
  const admin = supabaseAdmin();
  const { data: conversation } = await admin
    .from("group_message_conversations")
    .select("id, created_by, created_at")
    .eq("id", groupId)
    .maybeSingle();

  const convo = (conversation as { id: string; created_by: string; created_at: string } | null) ?? null;
  if (!convo || convo.created_by !== userId) return null;

  const joinedAt = convo.created_at ?? new Date().toISOString();
  const { error } = await admin
    .from("group_message_members")
    .upsert(
      {
        conversation_id: groupId,
        user_id: userId,
        joined_at: joinedAt,
        left_at: null,
        last_read_at: joinedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id,user_id" }
    );

  if (error) return null;
  return { joined_at: joinedAt, left_at: null as string | null };
}

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const withUser = url.searchParams.get("with") ?? "";
  const groupId = url.searchParams.get("group") ?? "";
  const before = url.searchParams.get("before") ?? ""; // ISO timestamp cursor for pagination
  if (!withUser && !groupId) {
    return NextResponse.json({ error: "Missing recipient" }, { status: 400 });
  }

  if (withUser && groupId) {
    return NextResponse.json({ error: "Choose either a direct chat or a group chat." }, { status: 400 });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("age_category")
    .eq("user_id", userId)
    .maybeSingle();
  const ageCategory = (account as { age_category?: string | null } | null)?.age_category ?? null;
  if (ageCategory === "youth_13_17") {
    return NextResponse.json({ error: "Messaging is unavailable for youth profiles." }, { status: 403 });
  }

  if (groupId) {
    let { data: membership } = await supabase
      .from("group_message_members")
      .select("joined_at, left_at")
      .eq("conversation_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      membership = await ensureCreatorMembership(groupId, userId);
    }

    if (!membership) {
      return NextResponse.json({ error: "Group chat not found." }, { status: 404 });
    }

    let query = supabase
      .from("group_messages")
      .select("id, conversation_id, sender_id, body, created_at")
      .eq("conversation_id", groupId)
      .gte("created_at", membership.joined_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (membership.left_at) {
      query = query.lte("created_at", membership.left_at);
    }

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = data ?? [];
    const hasMore = rows.length > PAGE_SIZE;
    const messages = rows.slice(0, PAGE_SIZE).reverse();

    const senderIds = Array.from(new Set(messages.map((message) => message.sender_id)));
    const { data: senderProfiles } = senderIds.length
      ? await supabase
          .from("public_profiles")
          .select("user_id, pen_name, username, avatar_url")
          .in("user_id", senderIds)
      : { data: [] as Array<{ user_id: string; pen_name: string | null; username: string | null; avatar_url: string | null }> };

    const senderMap = new Map(
      ((senderProfiles ?? []) as Array<{ user_id: string; pen_name: string | null; username: string | null; avatar_url: string | null }>).map((profile) => [
        profile.user_id,
        {
          sender_name: profile.pen_name || (profile.username ? `@${profile.username}` : "User"),
          sender_avatar_url: profile.avatar_url ?? null,
        },
      ])
    );

    const { data: conversation } = await supabase
      .from("group_message_conversations")
      .select("id, title")
      .eq("id", groupId)
      .maybeSingle();

    const { data: memberRows } = await supabase
      .from("group_message_members")
      .select("user_id, left_at")
      .eq("conversation_id", groupId);

    const activeMemberIds = ((memberRows ?? []) as Array<{ user_id: string; left_at: string | null }>)
      .filter((row) => !row.left_at)
      .map((row) => row.user_id);

    const { data: memberProfiles } = activeMemberIds.length
      ? await supabase
          .from("public_profiles")
          .select("user_id, pen_name, username, avatar_url")
          .in("user_id", activeMemberIds)
      : { data: [] as Array<{ user_id: string; pen_name: string | null; username: string | null; avatar_url: string | null }> };

    const participants = ((memberProfiles ?? []) as Array<{ user_id: string; pen_name: string | null; username: string | null; avatar_url: string | null }>)
      .map((profile) => ({
        user_id: profile.user_id,
        label: profile.pen_name || (profile.username ? `@${profile.username}` : "User"),
        avatar_url: profile.avatar_url ?? null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    if (!before && !membership.left_at) {
      await supabase
        .from("group_message_members")
        .update({ last_read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("conversation_id", groupId)
        .eq("user_id", userId);
    }

    return NextResponse.json({
      messages: messages.map((message) => ({
        ...message,
        ...senderMap.get(message.sender_id),
      })),
      hasMore,
      conversation: conversation ?? null,
      participants,
      hasLeft: !!membership.left_at,
      leftAt: membership.left_at ?? null,
    });
  }

  const { data: receiverAccount } = await supabase
    .from("accounts")
    .select("age_category")
    .eq("user_id", withUser)
    .maybeSingle();
  const receiverAge = (receiverAccount as { age_category?: string | null } | null)?.age_category ?? null;
  if (receiverAge === "youth_13_17" || ageCategory === "youth_13_17") {
    return NextResponse.json({ error: "Direct messaging between youth and adult profiles is locked for safety." }, { status: 403 });
  }

  // Fetch PAGE_SIZE+1 rows so we can tell if there are older messages without a separate count query
  let query = supabase
    .from("direct_messages")
    .select("id, sender_id, receiver_id, body, status, created_at")
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${withUser}),and(sender_id.eq.${withUser},receiver_id.eq.${userId})`)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1);

  // Cursor: only fetch messages older than this timestamp
  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  // Drop the extra probe row, then reverse so client receives oldest-first order
  const messages = rows.slice(0, PAGE_SIZE).reverse();

  // Only mark as read on initial load (no cursor)
  if (!before) {
    await supabase
      .from("direct_messages")
      .update({ status: "read" })
      .eq("receiver_id", userId)
      .eq("sender_id", withUser)
      .eq("status", "sent");
  }

  return NextResponse.json({ messages, hasMore });
}
