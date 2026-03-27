import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import { consequenceFromStrike, consequenceMessage, evaluateMessageTriggers } from "@/lib/messagePolicy";

type AccountRow = {
  age_category: string | null;
  manuscript_conduct_strikes: number | null;
  manuscript_blacklisted: boolean | null;
  manuscript_suspended_until: string | null;
  manuscript_lifetime_suspension_count: number | null;
};

type Body = {
  feedback_id?: string;
  body?: string;
};

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = (await req.json()) as Body;
    const replyBody = String(payload.body ?? "").trim();
    const feedbackId = payload.feedback_id;

    if (!replyBody || !feedbackId) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const { data: accountData } = await supabase
      .from("accounts")
      .select("age_category, manuscript_conduct_strikes, manuscript_blacklisted, manuscript_suspended_until, manuscript_lifetime_suspension_count")
      .eq("user_id", userId)
      .maybeSingle();
    const account = (accountData as AccountRow | null) ?? null;

    if (account?.manuscript_blacklisted) {
      return NextResponse.json({ error: "Your manuscript privileges are blacklisted. You cannot submit replies." }, { status: 403 });
    }

    if (account?.manuscript_suspended_until) {
      const until = new Date(account.manuscript_suspended_until);
      if (until.getTime() > Date.now()) {
        return NextResponse.json(
          { error: `Feedback privileges suspended until ${until.toLocaleString()}.` },
          { status: 403 }
        );
      }
    }

    const admin = supabaseAdmin();

    // Look up the parent feedback to get reader_id and manuscript info
    const { data: feedbackRow } = await supabase
      .from("line_feedback")
      .select("manuscript_id, reader_id")
      .eq("id", feedbackId)
      .maybeSingle();
    const feedbackRowTyped = feedbackRow as { manuscript_id?: string; reader_id?: string } | null;
    const manuscriptId = feedbackRowTyped?.manuscript_id ?? null;
    const feedbackReaderId = feedbackRowTyped?.reader_id ?? null;

    // Fetch reader's age_category via admin (bypasses RLS — anon client can't read other users' accounts)
    let readerAgeCategory: string | null = null;
    if (feedbackReaderId) {
      const { data: readerAcct } = await admin
        .from("accounts")
        .select("age_category")
        .eq("user_id", feedbackReaderId)
        .maybeSingle();
      readerAgeCategory = (readerAcct as { age_category?: string } | null)?.age_category ?? null;
    }

    // Block adults from replying to youth feedback
    const senderAge = account?.age_category ?? null;
    if (senderAge === "adult_18_plus" && readerAgeCategory === "youth_13_17") {
      return NextResponse.json(
        { error: "Adults cannot reply to feedback from youth profiles." },
        { status: 403 }
      );
    }

    let manuscriptOwnerId: string | null = null;
    if (manuscriptId) {
      const { data: msRow } = await supabase
        .from("manuscripts")
        .select("owner_id")
        .eq("id", manuscriptId)
        .maybeSingle();
      manuscriptOwnerId = (msRow as { owner_id?: string } | null)?.owner_id ?? null;
    }

    // Block youth from replying on adult-owned manuscripts — adults can never reply to youth
    // feedback, so there is no valid back-and-forth for a youth to participate in.
    if (manuscriptOwnerId && senderAge === "youth_13_17") {
      const { data: ownerAcct } = await admin
        .from("accounts")
        .select("age_category")
        .eq("user_id", manuscriptOwnerId)
        .maybeSingle();
      const ownerAge = (ownerAcct as { age_category?: string } | null)?.age_category ?? null;
      if (ownerAge === "adult_18_plus") {
        return NextResponse.json(
          { error: "Youth profiles cannot reply to feedback on adult-owned manuscripts." },
          { status: 403 }
        );
      }
    }

    const triggers = evaluateMessageTriggers(replyBody, account?.age_category ?? null);
    if (triggers.length > 0) {
      const nextStrike = (account?.manuscript_conduct_strikes ?? 0) + 1;
      const consequence = consequenceFromStrike(nextStrike);

      const updates: Record<string, unknown> = {
        manuscript_conduct_strikes: nextStrike,
        updated_at: new Date().toISOString(),
      };
      if (consequence === "suspended_3_days") {
        const until = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
        updates.manuscript_suspended_until = until;
        updates.manuscript_lifetime_suspension_count = (account?.manuscript_lifetime_suspension_count ?? 0) + 1;
      }
      if (consequence === "blacklisted") {
        updates.manuscript_blacklisted = true;
      }
      await supabase.from("accounts").update(updates).eq("user_id", userId);

      await admin.from("message_moderation_flags").insert({
        sender_id: userId,
        receiver_id: manuscriptOwnerId ?? null,
        content_excerpt: replyBody.slice(0, 500),
        triggers,
        consequence,
        status: "pending_owner_review",
      });

      return NextResponse.json(
        { error: consequenceMessage(consequence), triggers, consequence },
        { status: 403 }
      );
    }

    const { data: inserted, error } = await supabase
      .from("line_feedback_replies")
      .insert({ feedback_id: feedbackId, replier_id: userId, body: replyBody })
      .select("id, feedback_id, replier_id, body, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, reply: inserted });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to submit reply.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
