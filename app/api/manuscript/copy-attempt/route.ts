import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import { consequenceFromStrike, consequenceMessage } from "@/lib/messagePolicy";

type AccountRow = {
  manuscript_conduct_strikes: number | null;
  manuscript_blacklisted: boolean | null;
  manuscript_suspended_until: string | null;
  manuscript_lifetime_suspension_count: number | null;
};

type Body = {
  manuscript_id?: string;
  manuscript_title?: string;
};

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { manuscript_id, manuscript_title } = (await req.json()) as Body;

    const { data: accountData } = await supabase
      .from("accounts")
      .select("manuscript_conduct_strikes, manuscript_blacklisted, manuscript_suspended_until, manuscript_lifetime_suspension_count")
      .eq("user_id", userId)
      .maybeSingle();
    const account = (accountData as AccountRow | null) ?? null;

    if (account?.manuscript_blacklisted) {
      return NextResponse.json({ error: "Your manuscript privileges are blacklisted." }, { status: 403 });
    }

    if (account?.manuscript_suspended_until) {
      const until = new Date(account.manuscript_suspended_until);
      if (until.getTime() > Date.now()) {
        return NextResponse.json(
          { error: `Manuscript access suspended until ${until.toLocaleString()}.` },
          { status: 403 }
        );
      }
    }

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

    // Moderation flag for admin
    let ownerId: string | null = null;
    if (manuscript_id) {
      const { data: ms } = await supabase
        .from("manuscripts")
        .select("owner_id")
        .eq("id", manuscript_id)
        .maybeSingle();
      ownerId = (ms as { owner_id: string } | null)?.owner_id ?? null;
    }

    const admin = supabaseAdmin();
    await admin.from("message_moderation_flags").insert({
      sender_id: userId,
      receiver_id: ownerId,
      content_excerpt: `Manuscript copy attempt: ${manuscript_title ?? manuscript_id ?? "unknown"}`,
      triggers: ["copy_attempt"],
      consequence,
      status: "pending_owner_review",
    });

    return NextResponse.json({
      ok: true,
      consequence,
      message: consequenceMessage(consequence),
      strike: nextStrike,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to log copy attempt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
