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
};

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const senderId = auth?.user?.id;
  if (!senderId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { to_user_id?: string; content?: string };
  const toUserId = String(body.to_user_id ?? "").trim();
  const content = String(body.content ?? "").trim();
  if (!toUserId || !content) {
    return NextResponse.json({ error: "Missing recipient or message." }, { status: 400 });
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
  const { data: receiverAccount } = await supabase
    .from("accounts")
    .select("age_category")
    .eq("user_id", toUserId)
    .maybeSingle();
  const receiver = (receiverAccount as Pick<AccountRow, "age_category"> | null) ?? null;

  const senderAge = account?.age_category;
  if (senderAge === "youth_13_17") {
    return NextResponse.json(
      { error: "Messaging is unavailable for youth profiles." },
      { status: 403 }
    );
  }

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
      strikeUpdates.lifetime_suspension_count =
        ((account as unknown as { lifetime_suspension_count?: number })?.lifetime_suspension_count ?? 0) + 1;
    }
    if (consequence === "blacklisted") {
      strikeUpdates.blacklisted = true;
    }
    await supabase.from("accounts").update(strikeUpdates).eq("user_id", senderId);

    // Acknowledgment flag - separate update so a missing column never blocks the strike above
    await supabase.from("accounts").update({ has_unacknowledged_violation: true }).eq("user_id", senderId);

    await supabase.from("message_moderation_flags").insert({
      sender_id: senderId,
      receiver_id: toUserId,
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
