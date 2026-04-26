import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import {
  consequenceFromStrike,
  consequenceMessage,
  evaluateMessageTriggers,
} from "@/lib/messagePolicy";

type AccountRow = {
  age_category: string | null;
  conduct_strikes: number | null;
  messaging_suspended_until: string | null;
  blacklisted: boolean | null;
  parent_report_restricted: boolean | null;
  lifetime_suspension_count?: number | null;
};

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
  return { conversation_id: groupId, joined_at: joinedAt, left_at: null as string | null };
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const senderId = auth?.user?.id;
  if (!senderId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { to_user_id?: string; group_id?: string; content?: string };
  const toUserId = String(body.to_user_id ?? "").trim();
  const groupId = String(body.group_id ?? "").trim();
  const content = String(body.content ?? "").trim();
  if ((!toUserId && !groupId) || !content) {
    return NextResponse.json({ error: "Missing recipient or message." }, { status: 400 });
  }
  if (toUserId && groupId) {
    return NextResponse.json({ error: "Choose either a direct chat or a group chat." }, { status: 400 });
  }
  if (toUserId === senderId) {
    return NextResponse.json({ error: "You cannot message yourself." }, { status: 400 });
  }

  const { data: senderAccount } = await supabase
    .from("accounts")
    .select("age_category, conduct_strikes, messaging_suspended_until, blacklisted, parent_report_restricted")
    .eq("user_id", senderId)
    .maybeSingle();
  const account = (senderAccount as AccountRow | null) ?? null;
  const senderAge = account?.age_category;
  if (senderAge === "youth_13_17") {
    return NextResponse.json(
      { error: "Messaging is unavailable for youth profiles." },
      { status: 403 }
    );
  }

  if (account?.parent_report_restricted) {
    return NextResponse.json(
      { error: "Messaging is temporarily restricted following a parent report. An admin will review the report." },
      { status: 403 }
    );
  }

  if (account?.blacklisted) {
    return NextResponse.json(
      { error: "Messaging is blocked. You are blacklisted and must request an appeal." },
      { status: 403 }
    );
  }

  if (account?.messaging_suspended_until) {
    const suspendedUntil = new Date(account.messaging_suspended_until);
    if (suspendedUntil.getTime() > Date.now()) {
      return NextResponse.json(
        { error: `Messaging suspended until ${suspendedUntil.toLocaleString()}.` },
        { status: 403 }
      );
    }
  }

  const triggers = evaluateMessageTriggers(content, account?.age_category ?? null);
  if (triggers.length > 0) {
    const nextStrike = (account?.conduct_strikes ?? 0) + 1;
    const consequence = consequenceFromStrike(nextStrike);
    // Strike + suspension/blacklist update - must always succeed
    const strikeUpdates: Record<string, unknown> = {
      conduct_strikes: nextStrike,
      updated_at: new Date().toISOString(),
    };
    if (consequence === "suspended_3_days") {
      const until = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      strikeUpdates.messaging_suspended_until = until;
      strikeUpdates.feedback_suspended_until = until;
      strikeUpdates.lifetime_suspension_count = (account?.lifetime_suspension_count ?? 0) + 1;
    }
    if (consequence === "blacklisted") {
      strikeUpdates.blacklisted = true;
    }
    await supabase.from("accounts").update(strikeUpdates).eq("user_id", senderId);

    // Acknowledgment flag - separate update so a missing column never blocks the strike above
    await supabase.from("accounts").update({ has_unacknowledged_violation: true }).eq("user_id", senderId);

    await supabase.from("message_moderation_flags").insert({
      sender_id: senderId,
      receiver_id: toUserId || null,
      conversation_id: groupId || null,
      content_excerpt: content.slice(0, 500),
      triggers,
      consequence,
      status: "pending_owner_review",
    });

    return NextResponse.json(
      {
        error: consequenceMessage(consequence),
        triggers,
        consequence,
      },
      { status: 403 }
    );
  }

  if (groupId) {
    let { data: membership } = await supabase
      .from("group_message_members")
      .select("conversation_id, joined_at, left_at")
      .eq("conversation_id", groupId)
      .eq("user_id", senderId)
      .maybeSingle();

    if (!membership) {
      membership = await ensureCreatorMembership(groupId, senderId);
    }

    if (!membership || membership.left_at) {
      return NextResponse.json({ error: "You are no longer a member of this group chat." }, { status: 403 });
    }

    const { data: memberRows } = await supabase
      .from("group_message_members")
      .select("user_id")
      .eq("conversation_id", groupId)
      .is("left_at", null);

    const memberIds = ((memberRows ?? []) as Array<{ user_id: string }>).map((row) => row.user_id);
    if (memberIds.length === 0) {
      return NextResponse.json({ error: "This group chat has no active members." }, { status: 400 });
    }

    const { data: memberAccounts } = await supabase
      .from("accounts")
      .select("user_id, age_category")
      .in("user_id", memberIds);

    const hasYouthMember = ((memberAccounts ?? []) as Array<{ user_id: string; age_category: string | null }>)
      .some((row) => row.age_category === "youth_13_17");
    if (hasYouthMember) {
      return NextResponse.json(
        { error: "Group messaging with youth profiles is locked for safety." },
        { status: 403 }
      );
    }

    const { data: inserted, error } = await supabase
      .from("group_messages")
      .insert({
        conversation_id: groupId,
        sender_id: senderId,
        body: content,
      })
      .select("id, conversation_id, sender_id, body, created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase
      .from("group_message_members")
      .update({ last_read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("conversation_id", groupId)
      .eq("user_id", senderId);

    await supabase
      .from("group_message_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", groupId);

    await supabase.from("accounts").update({ last_active_at: new Date().toISOString() }).eq("user_id", senderId);

    const admin = supabaseAdmin();
    const [{ data: senderProfile }, { data: conversation }] = await Promise.all([
      admin
        .from("public_profiles")
        .select("pen_name, username, avatar_url")
        .eq("user_id", senderId)
        .maybeSingle(),
      admin
        .from("group_message_conversations")
        .select("title")
        .eq("id", groupId)
        .maybeSingle(),
    ]);

    const senderName =
      (senderProfile as { pen_name?: string | null; username?: string | null } | null)?.pen_name?.trim()
      || (senderProfile as { pen_name?: string | null; username?: string | null } | null)?.username
      || "Someone";
    const preview = content.length > 80 ? `${content.slice(0, 80)}...` : content;
    const conversationTitle =
      ((conversation as { title?: string | null } | null)?.title ?? "").trim() || "group chat";

    for (const memberId of memberIds.filter((id) => id !== senderId)) {
      const dedupeKey = `group-thread-${groupId}-${memberId}`;
      const { data: existing } = await admin
        .from("system_notifications")
        .select("id")
        .eq("user_id", memberId)
        .eq("dedupe_key", dedupeKey)
        .maybeSingle();

      const payload = {
        title: `New group message in ${conversationTitle}`,
        body: `${senderName}: ${preview}`,
        is_read: false,
        read_at: null,
        created_at: new Date().toISOString(),
        category: "messages" as const,
      };

      if (existing) {
        await admin.from("system_notifications").update(payload).eq("id", (existing as { id: string }).id);
      } else {
        await admin.from("system_notifications").insert({
          user_id: memberId,
          category: "messages",
          title: payload.title,
          body: payload.body,
          severity: "info",
          metadata: { group_id: groupId, link: `/messages?group=${groupId}` },
          dedupe_key: dedupeKey,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      message: {
        ...inserted,
        sender_name: senderName,
        sender_avatar_url: (senderProfile as { avatar_url?: string | null } | null)?.avatar_url ?? null,
      },
    });
  }

  const { data: receiverAccount } = await supabase
    .from("accounts")
    .select("age_category")
    .eq("user_id", toUserId)
    .maybeSingle();
  const receiver = (receiverAccount as Pick<AccountRow, "age_category"> | null) ?? null;

  const receiverAge = receiver?.age_category ?? null;
  const crossAge =
    (senderAge === "youth_13_17" && receiverAge === "adult_18_plus") ||
    (senderAge === "adult_18_plus" && receiverAge === "youth_13_17");
  if (crossAge) {
    return NextResponse.json(
      { error: "Direct messaging between youth and adult profiles is locked for safety." },
      { status: 403 }
    );
  }

  const { data: inserted, error } = await supabase.from("direct_messages").insert({
    sender_id: senderId,
    receiver_id: toUserId,
    body: content,
    status: "sent",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("accounts").update({ last_active_at: new Date().toISOString() }).eq("user_id", senderId);

  // Notify receiver (use admin client to write to another user's row)
  const admin = supabaseAdmin();
  const { data: senderProfile } = await admin
    .from("public_profiles")
    .select("pen_name, username")
    .eq("user_id", senderId)
    .maybeSingle();
  const senderName = (senderProfile as { pen_name?: string | null; username?: string | null } | null)?.pen_name?.trim()
    || (senderProfile as { pen_name?: string | null; username?: string | null } | null)?.username
    || "Someone";
  // One notification per conversation thread - upsert so repeated messages
  // update the preview instead of stacking separate notifications.
  const preview = content.length > 80 ? content.slice(0, 80) + "…" : content;
  const dedupeKey = `dm-thread-${senderId}-${toUserId}`;
  const { data: existing } = await admin
    .from("system_notifications")
    .select("id")
    .eq("user_id", toUserId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (existing) {
    await admin
      .from("system_notifications")
      .update({ title: `New message from ${senderName}`, body: preview, is_read: false, read_at: null, created_at: new Date().toISOString(), category: "messages" })
      .eq("id", (existing as { id: string }).id);
  } else {
    await admin.from("system_notifications").insert({
      user_id: toUserId,
      category: "messages",
      title: `New message from ${senderName}`,
      body: preview,
      severity: "info",
      metadata: { sender_id: senderId, link: `/messages?with=${senderId}` },
      dedupe_key: dedupeKey,
    });
  }

  return NextResponse.json({ ok: true, message: inserted });
}
