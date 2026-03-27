import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const childUserId = url.searchParams.get("child_user_id");
    if (!childUserId) {
      return NextResponse.json({ error: "Missing child_user_id." }, { status: 400 });
    }

    // Identify the calling user from their session cookie
    const cookieStore = await cookies();
    const supabaseServer = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );

    const {
      data: { user },
    } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const supabase = supabaseAdmin();

    // Verify the caller is an active parent of this child
    const { data: link } = await supabase
      .from("youth_links")
      .select("id")
      .eq("parent_user_id", user.id)
      .eq("child_user_id", childUserId)
      .eq("status", "active")
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    // Fetch the child's manuscripts (read-only view)
    const { data: manuscripts } = await supabase
      .from("manuscripts")
      .select("id, title, created_at, genre, parent_disabled, parent_disabled_reason")
      .eq("owner_id", childUserId)
      .order("created_at", { ascending: false });

    return NextResponse.json({ manuscripts: manuscripts ?? [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
