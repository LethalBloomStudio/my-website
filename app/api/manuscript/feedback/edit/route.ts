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
  comment_text?: string;
  manuscript_owner_id?: string;
};

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    const commentText = String(body.comment_text ?? "").trim();
    const feedbackId = String(body.feedback_id ?? "").trim();

    if (!commentText || !feedbackId) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const { data: accountData } = await supabase
      .from("accounts")
      .select("age_category, manuscript_conduct_strikes, manuscript_blacklisted, manuscript_suspended_until, manuscript_lifetime_suspension_count")
      .eq("user_id", userId)
      .maybeSingle();
    const account = (accountData as AccountRow | null) ?? null;

    if (account?.manuscript_blacklisted) {
      return NextResponse.json({ error: "Your manuscript privileges are blacklisted. You cannot edit feedback." }, { status: 403 });
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

    const triggers = evaluateMessageTriggers(commentText, account?.age_category ?? null);
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

      const admin = supabaseAdmin();
      await admin.from("message_moderation_flags").insert({
        sender_id: userId,
        receiver_id: body.manuscript_owner_id ?? null,
        content_excerpt: commentText.slice(0, 500),
        triggers,
        consequence,
        status: "pending_owner_review",
      });

      return NextResponse.json(
        { error: consequenceMessage(consequence), triggers, consequence },
        { status: 403 }
      );
    }

    const wordCount = commentText.split(/\s+/).filter(Boolean).length;
    const { error } = await supabase
      .from("line_feedback")
      .update({ comment_text: commentText, word_count: wordCount })
      .eq("id", feedbackId)
      .eq("reader_id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, comment_text: commentText, word_count: wordCount });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to edit feedback.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
