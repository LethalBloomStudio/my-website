import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  evaluateMessageTriggers,
  consequenceFromStrike,
  consequenceMessage,
} from "@/lib/messagePolicy";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Body = {
  post_id: string;
  content: string;
  parent_id: string | null;
  reply_to_id: string | null;
  reply_to_author_id: string | null;
  post_author_id: string; // used as the "receiver" for moderation flags
};

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  const { post_id, content, parent_id, reply_to_id, reply_to_author_id, post_author_id } = body;

  if (!post_id || !content?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Fetch sender's account for conduct status and age category
  const { data: acctRow } = await supabase
    .from("accounts")
    .select(
      "age_category, manuscript_conduct_strikes, manuscript_suspended_until, manuscript_blacklisted, has_unacknowledged_violation, parent_report_restricted"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const acct = acctRow as {
    age_category: string | null;
    manuscript_conduct_strikes: number | null;
    manuscript_suspended_until: string | null;
    manuscript_blacklisted: boolean | null;
    has_unacknowledged_violation: boolean | null;
    parent_report_restricted: boolean | null;
  } | null;

  // Block if parent-report restricted
  if (acct?.parent_report_restricted) {
    return NextResponse.json({ error: "Your account is currently restricted by a parent report." }, { status: 403 });
  }

  // Block if blacklisted from manuscript/community conduct
  if (acct?.manuscript_blacklisted) {
    return NextResponse.json({
      error: "Your community posting privileges have been permanently revoked. You may request an appeal.",
      consequence: "blacklisted",
    }, { status: 403 });
  }

  // Block if currently suspended
  if (acct?.manuscript_suspended_until && new Date(acct.manuscript_suspended_until) > new Date()) {
    const until = new Date(acct.manuscript_suspended_until).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
    return NextResponse.json({
      error: `Your community posting privileges are suspended until ${until}.`,
      consequence: "suspended",
    }, { status: 403 });
  }

  // Evaluate content against policy triggers
  const triggers = evaluateMessageTriggers(content, acct?.age_category ?? null);

  if (triggers.length > 0) {
    const currentStrikes = Number(acct?.manuscript_conduct_strikes ?? 0);
    const nextStrike = currentStrikes + 1;
    const consequence = consequenceFromStrike(nextStrike);

    // Build account update based on consequence
    const accountUpdate: Record<string, unknown> = {
      manuscript_conduct_strikes: nextStrike,
      has_unacknowledged_violation: true,
    };
    if (consequence === "suspended_3_days") {
      const suspendedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      accountUpdate.manuscript_suspended_until = suspendedUntil;
      // lifetime suspension count incremented below via RPC
    }
    if (consequence === "blacklisted") {
      accountUpdate.manuscript_blacklisted = true;
    }

    await supabase.from("accounts").update(accountUpdate).eq("user_id", user.id);

    // Increment lifetime suspension count separately if needed
    if (consequence === "suspended_3_days") {
      await supabase.rpc("increment_manuscript_lifetime_suspensions", { uid: user.id });
    }

    // Insert moderation flag for admin review
    await supabase.from("message_moderation_flags").insert({
      sender_id: user.id,
      receiver_id: post_author_id ?? user.id,
      content_excerpt: content.slice(0, 500),
      triggers,
      consequence,
      status: "pending_owner_review",
    });

    // Notify linked parent account if this is a youth profile
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

        const title = isBlacklisted
          ? "Your youth account has been permanently banned"
          : isSuspended
          ? "Your youth account has been suspended"
          : "Your youth account received a conduct warning";

        const suspendedUntil = isSuspended
          ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, {
              month: "short", day: "numeric", year: "numeric",
            })
          : null;

        const body = isBlacklisted
          ? "The linked youth account has been permanently banned from community participation after repeated policy violations. You may submit an appeal on their behalf from their Platform Conduct Record."
          : isSuspended
          ? `The linked youth account has been suspended from community participation until ${suspendedUntil} due to a policy violation in the Youth Community discussion board.`
          : `The linked youth account posted content in the Youth Community that violated platform guidelines (strike ${nextStrike}). The comment was blocked. Another violation may result in suspension.`;

        await supabase.from("system_notifications").insert({
          user_id: parentId,
          category: "safety",
          severity: isBlacklisted || isSuspended ? "warning" : "info",
          title,
          body,
        });
      }
    }

    return NextResponse.json({
      error: consequenceMessage(consequence),
      consequence,
      triggers,
    }, { status: 403 });
  }

  // Content is clean — insert the comment
  const { data, error } = await supabase
    .from("discussion_comments")
    .insert({
      post_id,
      author_id: user.id,
      content: content.trim(),
      parent_id,
      reply_to_id,
      reply_to_author_id,
    })
    .select("id, post_id, author_id, content, parent_id, reply_to_id, reply_to_author_id, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, comment: data });
}
