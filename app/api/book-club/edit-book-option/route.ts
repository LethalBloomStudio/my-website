import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type Body = { option_id?: string; book_title?: string; book_author?: string; cover_image_url?: string | null };

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (await req.json()) as Body;
  const optionId = String(raw.option_id ?? "").trim();
  const bookTitle = String(raw.book_title ?? "").trim();
  const bookAuthor = String(raw.book_author ?? "").trim();
  const coverImageUrl = raw.cover_image_url ? String(raw.cover_image_url).trim() : null;
  if (!optionId || !bookTitle || !bookAuthor) {
    return NextResponse.json({ error: "Book title and author are required." }, { status: 400 });
  }

  const { error } = await supabase.rpc("book_club_edit_book_option", {
    p_option_id: optionId,
    p_book_title: bookTitle,
    p_book_author: bookAuthor,
    p_cover_image_url: coverImageUrl,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
