import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type ReadEntry = { key: string; readAt: number };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return NextResponse.json({ keys: [] });

  const { data } = await supabase
    .from("accounts")
    .select("notification_read_keys")
    .eq("user_id", userId)
    .maybeSingle();

  const raw = (data as { notification_read_keys?: ReadEntry[] } | null)?.notification_read_keys ?? [];
  const now = Date.now();
  const active = raw.filter((e) => now - e.readAt < THIRTY_DAYS_MS);
  return NextResponse.json({ keys: active.map((e) => e.key) });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json()) as { entries: ReadEntry[] };
  const now = Date.now();
  // Prune entries older than 30 days before saving
  const pruned = (body.entries ?? []).filter((e) => now - e.readAt < THIRTY_DAYS_MS);

  await supabase
    .from("accounts")
    .update({ notification_read_keys: pruned })
    .eq("user_id", userId);

  return NextResponse.json({ ok: true });
}
