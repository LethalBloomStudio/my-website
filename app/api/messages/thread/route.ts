import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

const PAGE_SIZE = 50;

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const withUser = url.searchParams.get("with") ?? "";
  const before = url.searchParams.get("before") ?? ""; // ISO timestamp cursor for pagination
  if (!withUser) return NextResponse.json({ error: "Missing recipient" }, { status: 400 });

  const { data: account } = await supabase
    .from("accounts")
    .select("age_category")
    .eq("user_id", userId)
    .maybeSingle();
  const ageCategory = (account as { age_category?: string | null } | null)?.age_category ?? null;
  if (ageCategory === "youth_13_17") {
    return NextResponse.json({ error: "Messaging is unavailable for youth profiles." }, { status: 403 });
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
