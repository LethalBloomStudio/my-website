import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  evaluateMessageTriggers,
  consequenceFromStrike,
  consequenceMessage,
} from "@/lib/messagePolicy";
import { notifyAdminsConductEvent } from "@/lib/notifyAdminsConductEvent";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Body = {
  type: string;
  title: string;
  content: string | null;
  community?: string;
  poll_options?: string[];
  coin_prize?: number;
  ends_at?: string;
};

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  const { type, title, content, community, poll_options, coin_prize, ends_at } = body;

  if (!type || !title?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { data: acctRow } = await supabase
    .from("accounts")
    .select(
      "is_admin, age_category, manuscript_conduct_strikes, manuscript_suspended_until, manuscript_blacklisted, has_unacknowledged_violation, parent_report_restricted"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const acct = acctRow as {
    is_admin: boolean | null;
    age_category: string | null;
    manuscript_conduct_strikes: number | null;
    manuscript_suspended_until: string | null;
    manuscript_blacklisted: boolean | null;
    has_unacknowledged_violation: boolean | null;
    parent_report_restricted: boolean | null;
  } | null;

  const isAdmin = !!acct?.is_admin;

  if (acct?.parent_report_restricted) {
    return NextResponse.json({ error: "Your account is currently restricted by a parent report." }, { status: 403 });
  }
  if (acct?.manuscript_blacklisted) {
    return NextResponse.json({
      error: "Your community posting privileges have been permanently revoked. You may request an appeal.",
      consequence: "blacklisted",
    }, { status: 403 });
  }
  if (acct?.manuscript_suspended_until && new Date(acct.manuscript_suspended_until) > new Date()) {
    const until = new Date(acct.manuscript_suspended_until).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
    return NextResponse.json({
      error: `Your community posting privileges are suspended until ${until}.`,
      consequence: "suspended",
    }, { status: 403 });
  }
  if (acct?.has_unacknowledged_violation) {
    return NextResponse.json({ error: "You must acknowledge a pending conduct notice before posting." }, { status: 403 });
  }
  if (type === "giveaway" && !isAdmin) {
    return NextResponse.json({ error: "Only admins can create giveaway posts." }, { status: 403 });
  }

  // Evaluate post content against the same policy triggers used for discussion comments
  const combinedText = `${title} ${content ?? ""}`;
  const triggers = evaluateMessageTriggers(combinedText, acct?.age_category ?? null);

  if (triggers.length > 0) {
    const currentStrikes = Number(acct?.manuscript_conduct_strikes ?? 0);
    const nextStrike = currentStrikes + 1;
    const consequence = consequenceFromStrike(nextStrike);

    const accountUpdate: Record<string, unknown> = {
      manuscript_conduct_strikes: nextStrike,
      has_unacknowledged_violation: true,
    };
    if (consequence === "suspended_3_days") {
      accountUpdate.manuscript_suspended_until = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (consequence === "blacklisted") {
      accountUpdate.manuscript_blacklisted = true;
    }

    await supabase.from("accounts").update(accountUpdate).eq("user_id", user.id);

    if (consequence === "suspended_3_days") {
      await supabase.rpc("increment_manuscript_lifetime_suspensions", { uid: user.id });
    }

    await supabase.from("message_moderation_flags").insert({
      sender_id: user.id,
      receiver_id: user.id, // posts have no single recipient; flag is against the author
      manuscript_id: null,
      content_excerpt: combinedText.slice(0, 500),
      triggers,
      consequence,
      status: "pending_owner_review",
    });

    if (consequence === "suspended_3_days" || consequence === "blacklisted") {
      void notifyAdminsConductEvent({
        adminClient: supabase,
        violatorId: user.id,
        consequence,
        strikeNumber: nextStrike,
        triggerSource: "discussion",
        manuscriptId: null,
      });
    }

    if (acct?.age_category === "youth_13_17") {
      const { data: linkRow } = await supabase
        .from("youth_links")
        .select("parent_user_id")
        .eq("child_user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      const parentId = (linkRow as { parent_user_id: string } | null)?.parent_user_id;

      if (parentId) {
        const isSuspended = consequence === "suspended_3_days";
        const isBlacklisted = consequence === "blacklisted";

        const noticeTitle = isBlacklisted
          ? "Your youth account has been permanently banned"
          : isSuspended
          ? "Your youth account has been suspended"
          : "Your youth account received a conduct warning";

        const suspendedUntil = isSuspended
          ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, {
              month: "short", day: "numeric", year: "numeric",
            })
          : null;

        const noticeBody = isBlacklisted
          ? "The linked youth account has been permanently banned from community participation after repeated policy violations. You may submit an appeal on their behalf from their Platform Conduct Record."
          : isSuspended
          ? `The linked youth account has been suspended from community participation until ${suspendedUntil} due to a policy violation in the Youth Community discussion board.`
          : `The linked youth account posted content in the Youth Community that violated platform guidelines (strike ${nextStrike}). The post was blocked. Another violation may result in suspension.`;

        await supabase.from("system_notifications").insert({
          user_id: parentId,
          category: "safety",
          severity: isBlacklisted || isSuspended ? "warning" : "info",
          title: noticeTitle,
          body: noticeBody,
        });
      }
    }

    return NextResponse.json({
      error: consequenceMessage(consequence),
      consequence,
      triggers,
    }, { status: 403 });
  }

  const payload: Record<string, unknown> = {
    author_id: user.id,
    type,
    title: title.trim(),
    content: content?.trim() || null,
    community: community === "youth" ? "youth" : "adult",
  };
  if (type === "poll" && poll_options) payload.poll_options = poll_options;
  if (type === "giveaway") {
    payload.coin_prize = coin_prize ?? null;
    payload.ends_at = ends_at ?? null;
  }

  const { data, error } = await supabase
    .from("discussion_posts")
    .insert(payload)
    .select("id, author_id, type, title, content, poll_options, created_at, is_pinned, pinned_at, coin_prize, ends_at, winner_id, winner_drawn")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, post: data });
}
