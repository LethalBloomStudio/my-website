import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

const PAGE_SIZE = 1000;

export async function GET() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return NextResponse.json({ keys: [] });

  const keys: string[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("notification_read_keys")
      .select("notification_key")
      .eq("user_id", userId)
      .range(from, from + PAGE_SIZE - 1);

    const page = (data as { notification_key: string }[] | null) ?? [];
    keys.push(...page.map((r) => r.notification_key));
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return NextResponse.json({ keys });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json()) as { keys: string[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];

  if (keys.length > 0) {
    await supabase
      .from("notification_read_keys")
      .upsert(
        keys.map((key) => ({ user_id: userId, notification_key: key })),
        { onConflict: "user_id,notification_key", ignoreDuplicates: true }
      );
  }

  return NextResponse.json({ ok: true });
}
