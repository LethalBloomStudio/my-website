import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type Body = {
  suggestions?: string[];
  custom_text?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const suggestions = Array.isArray(body.suggestions) ? body.suggestions : [];
    const customText = typeof body.custom_text === "string" ? body.custom_text.trim() : null;

    if (suggestions.length === 0 && !customText) {
      return NextResponse.json({ error: "Please select at least one option or add your own feedback." }, { status: 400 });
    }

    // Get user id if logged in (optional - anon feedback is allowed)
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id ?? null;

    const admin = supabaseAdmin();

    await admin.from("user_feedback").insert({
      user_id: userId,
      suggestions,
      custom_text: customText || null,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to submit feedback.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  // Admin only - returns all feedback entries
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: acct } = await supabase
    .from("accounts")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();

  if (!(acct as { is_admin?: boolean } | null)?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("user_feedback")
    .select("id, user_id, suggestions, custom_text, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with username for logged-in submitters
  const userIds = [...new Set((data ?? []).map((r) => r.user_id).filter(Boolean) as string[])];
  const usernameMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, username, full_name")
      .in("user_id", userIds);
    for (const p of profiles ?? []) {
      usernameMap[p.user_id] = p.username || p.full_name || p.user_id.slice(0, 8);
    }
  }

  const enriched = (data ?? []).map((r) => ({
    ...r,
    username: r.user_id ? (usernameMap[r.user_id] ?? r.user_id.slice(0, 8) + "…") : null,
  }));

  return NextResponse.json({ feedback: enriched });
}
