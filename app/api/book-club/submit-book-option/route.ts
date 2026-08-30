import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type Body = { cycle_id?: string; book_title?: string; book_author?: string; cover_image_url?: string | null };

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
  const coverImageUrl = raw.cover_image_url ? String(raw.cover_image_url).trim() : null;
  if (!cycleId || !bookTitle || !bookAuthor) {
    return NextResponse.json({ error: "Cycle, book title, and author are required." }, { status: 400 });
  }

  const { data: participant } = await supabase
    .from("book_club_participants")
    .select("id")
    .eq("cycle_id", cycleId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!participant) {
    return NextResponse.json({ error: "Opt in to this month's Book Club before adding to the slate." }, { status: 403 });
  }

  const { data: cycle } = await supabase
    .from("book_club_cycles")
    .select("id, status, host_user_id, voting_opens_at")
    .eq("id", cycleId)
    .maybeSingle();
  if (!cycle) {
    return NextResponse.json({ error: "Cycle not found." }, { status: 404 });
  }

  // Slot 5 is reserved for the host -- only fillable by them, only in a
  // 48h window right after voting opens (host selection and voting-open
  // happen in the same engine step, so there's no earlier moment to give
  // them). Everyone else fills slots 1-4 during host_pending.
  if (cycle.status === "voting") {
    const isHost = cycle.host_user_id === userId;
    const graceExpired = !cycle.voting_opens_at || Date.now() >= new Date(cycle.voting_opens_at).getTime() + 48 * 60 * 60 * 1000;
    if (!isHost) {
      return NextResponse.json({ error: "Only the host can add a book once voting has opened." }, { status: 403 });
    }
    if (graceExpired) {
      return NextResponse.json({ error: "The host's 48-hour window to add a book has closed." }, { status: 403 });
    }

    const { data: existingSlotFive } = await supabase
      .from("book_club_book_options")
      .select("id")
      .eq("cycle_id", cycleId)
      .eq("slot_number", 5)
      .maybeSingle();
    if (existingSlotFive) {
      return NextResponse.json({ error: "You've already added your reserved pick for this cycle." }, { status: 400 });
    }

    const { error } = await supabase.from("book_club_book_options").insert({
      cycle_id: cycle.id,
      slot_number: 5,
      submitted_by: userId,
      book_title: bookTitle,
      book_author: bookAuthor,
      cover_image_url: coverImageUrl,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (cycle.status !== "host_pending") {
    return NextResponse.json({ error: "The book slate isn't open right now." }, { status: 400 });
  }

  const { data: existingOptions } = await supabase
    .from("book_club_book_options")
    .select("slot_number, submitted_by")
    .eq("cycle_id", cycle.id)
    .lte("slot_number", 4);
  const options = existingOptions ?? [];

  if (options.length >= 4) {
    return NextResponse.json({ error: "The open slate slots are full -- one slot is reserved for the host." }, { status: 400 });
  }
  if (options.some((o) => o.submitted_by === userId)) {
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
    cover_image_url: coverImageUrl,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
