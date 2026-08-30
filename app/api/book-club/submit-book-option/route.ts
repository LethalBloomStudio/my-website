import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type Body = { cycle_id?: string; book_title?: string; book_author?: string };

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await supabase
    .from("accounts")
    .select("age_category")
    .eq("user_id", userId)
    .maybeSingle();
  if ((account as { age_category?: string } | null)?.age_category !== "adult_18_plus") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const raw = (await req.json()) as Body;
  const cycleId = String(raw.cycle_id ?? "").trim();
  const bookTitle = String(raw.book_title ?? "").trim();
  const bookAuthor = String(raw.book_author ?? "").trim();
  if (!cycleId || !bookTitle || !bookAuthor) {
    return NextResponse.json({ error: "Cycle, book title, and author are required." }, { status: 400 });
  }

  // Slate submissions happen during host_pending now (open as soon as a
  // cycle is queued up, not a dedicated slate_building phase) -- multiple
  // upcoming cycles can be host_pending at once, so this is scoped to the
  // specific cycle_id the client is submitting into.
  const { data: cycle } = await supabase
    .from("book_club_cycles")
    .select("id, host_user_id")
    .eq("id", cycleId)
    .eq("status", "host_pending")
    .maybeSingle();
  if (!cycle) {
    return NextResponse.json({ error: "The book slate isn't open right now." }, { status: 400 });
  }

  const isHost = cycle.host_user_id === userId;

  const { data: existingOptions } = await supabase
    .from("book_club_book_options")
    .select("slot_number, submitted_by")
    .eq("cycle_id", cycle.id);
  const options = existingOptions ?? [];

  if (options.length >= 5) {
    return NextResponse.json({ error: "The slate is already full." }, { status: 400 });
  }
  // Host may fill multiple slots; everyone else gets one submission per cycle.
  if (!isHost && options.some((o) => o.submitted_by === userId)) {
    return NextResponse.json({ error: "You've already submitted a book for this cycle." }, { status: 400 });
  }

  const taken = new Set(options.map((o) => o.slot_number));
  let slot = 1;
  while (taken.has(slot)) slot++;

  const { error } = await supabase.from("book_club_book_options").insert({
    cycle_id: cycle.id,
    slot_number: slot,
    submitted_by: userId,
    book_title: bookTitle,
    book_author: bookAuthor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
