import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import BookClubHostSignupButton from "@/components/BookClubHostSignupButton";
import BookClubOptInButton from "@/components/BookClubOptInButton";
import BookClubClosedMonthCard from "@/components/BookClubClosedMonthCard";
import BookClubStarRating from "@/components/BookClubStarRating";
import BookClubCoverThumb from "@/components/BookClubCoverThumb";

export const dynamic = "force-dynamic";

const CLOSED_MONTHS_SHOWN = 12;

type Participant = { user_id: string; username: string | null; pen_name: string | null; avatar_url: string | null };

function monthLabel(dateStr: string | null) {
  return dateStr ? new Date(dateStr).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : null;
}

export default async function BookClubPage() {
  const supabase = await supabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");

  const { data: account } = await supabase
    .from("accounts")
    .select("age_category, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  const acc = account as { age_category?: string | null; is_admin?: boolean } | null;
  const isAdult = acc?.age_category === "adult_18_plus";
  const isAdmin = !!acc?.is_admin;

  // Silent redirect for non-adults, matching app/bloom-circle/page.tsx.
  if (!isAdult && !isAdmin) redirect("/discover");

  if (!isAdmin && process.env.NEXT_PUBLIC_BOOK_CLUB_ENABLED !== "true") {
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("is_enabled")
      .eq("name", "book_club")
      .maybeSingle();
    if (!flag?.is_enabled) redirect("/discover");
  }

  // -- Active month --
  const { data: activeCycle } = await supabase
    .from("book_club_cycles")
    .select("id, host_user_id, cycle_starts_at, winning_book_option_id")
    .eq("status", "active")
    .maybeSingle();

  let activeIsParticipant = false;
  let activeHostName: string | null = null;
  let activeWinningBook: { book_title: string; book_author: string; cover_image_url: string | null } | null = null;
  let activeMemberCount = 0;
  let activeRatingCount = 0;
  let activeAverageRating: number | null = null;
  if (activeCycle) {
    const [{ data: participant }, { data: hostProfile }, { data: memberCount }, { data: ratingStatsRows }] = await Promise.all([
      supabase.from("book_club_participants").select("id").eq("cycle_id", activeCycle.id).eq("user_id", user.id).maybeSingle(),
      activeCycle.host_user_id
        ? supabase.from("public_profiles").select("username, pen_name").eq("user_id", activeCycle.host_user_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.rpc("book_club_cycle_member_count", { p_cycle_id: activeCycle.id }),
      supabase.rpc("book_club_cycle_rating_stats", { p_cycle_id: activeCycle.id }),
    ]);
    activeIsParticipant = !!participant;
    activeHostName = hostProfile?.pen_name || hostProfile?.username || null;
    activeMemberCount = Number(memberCount ?? 0);
    const ratingRow = (ratingStatsRows as { rating_count: number; average_rating: number | null }[] | null)?.[0];
    activeRatingCount = Number(ratingRow?.rating_count ?? 0);
    activeAverageRating = ratingRow?.average_rating != null ? Number(ratingRow.average_rating) : null;
    if (activeCycle.winning_book_option_id) {
      const { data: won } = await supabase
        .from("book_club_book_options")
        .select("book_title, book_author, cover_image_url")
        .eq("id", activeCycle.winning_book_option_id)
        .maybeSingle();
      activeWinningBook = won ?? null;
    }
  }

  // -- Upcoming months (rolling signup pipeline, up to 3) --
  const { data: upcomingRows } = await supabase
    .from("book_club_cycles")
    .select("id, status, host_user_id, planned_starts_at, winning_book_option_id, tie_pending")
    .in("status", ["host_pending", "voting", "questions_pending"])
    .order("planned_starts_at", { ascending: true })
    .limit(3);

  const upcoming = [];
  for (const row of upcomingRows ?? []) {
    const [{ data: signup }, { data: participant }] = await Promise.all([
      row.status === "host_pending"
        ? supabase.from("book_club_host_signups").select("id").eq("cycle_id", row.id).eq("user_id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("book_club_participants").select("id").eq("cycle_id", row.id).eq("user_id", user.id).maybeSingle(),
    ]);

    let hostName: string | null = null;
    if (row.host_user_id) {
      const { data: hostProfile } = await supabase
        .from("public_profiles")
        .select("username, pen_name")
        .eq("user_id", row.host_user_id)
        .maybeSingle();
      hostName = hostProfile?.pen_name || hostProfile?.username || "Member";
    }

    // Public once decided, same carve-out as the active cycle's book --
    // visible pre-opt-in during questions_pending.
    let winningBook: { book_title: string; book_author: string } | null = null;
    if (row.winning_book_option_id) {
      const { data: won } = await supabase
        .from("book_club_book_options")
        .select("book_title, book_author")
        .eq("id", row.winning_book_option_id)
        .maybeSingle();
      winningBook = won ?? null;
    }

    // The candidate slate itself -- visible to any adult once voting opens
    // (book_club_book_options_select's status='voting' carve-out) or to
    // participants during host_pending (already opted-in, so
    // book_club_is_participant already covers them), so people can see
    // what's up for a vote / already been suggested before deciding
    // whether to opt in. Voting itself stays participant-gated, untouched.
    let slateOptions: { id: string; book_title: string; book_author: string; cover_image_url: string | null }[] = [];
    if (row.status === "voting" || (row.status === "host_pending" && !!participant)) {
      const { data: options } = await supabase
        .from("book_club_book_options")
        .select("id, book_title, book_author, cover_image_url")
        .eq("cycle_id", row.id)
        .order("slot_number");
      slateOptions = options ?? [];
    }

    // Voting opens exactly 14 days before planned_starts_at -- and since the
    // rolling pipeline seeds each new host_pending cycle's planned_starts_at
    // as the previous cycle's planned_starts_at + 28 days (no gaps by
    // design), that's mathematically the same instant the previous cycle's
    // cycle_ends_at lands. No need to look up the previous cycle directly.
    const votingOpensAtLabel = row.planned_starts_at
      ? new Date(new Date(row.planned_starts_at).getTime() - 14 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric" })
      : null;

    upcoming.push({
      id: row.id,
      status: row.status as "host_pending" | "voting" | "questions_pending",
      plannedStartsAt: row.planned_starts_at as string | null,
      votingOpensAtLabel,
      alreadySignedUpToHost: !!signup,
      isParticipant: !!participant,
      isHost: row.host_user_id === user.id,
      hostName,
      winningBook,
      slateOptions,
    });
  }

  // -- Closed months (summary cards only) --
  const { data: closedRows } = await supabase
    .from("book_club_cycles")
    .select("id, winning_book_option_id, host_user_id, cycle_ends_at")
    .eq("status", "completed")
    .order("cycle_ends_at", { ascending: false })
    .limit(CLOSED_MONTHS_SHOWN);

  const closed = [];
  for (const row of closedRows ?? []) {
    const [{ data: won }, { data: hostProfile }, { data: participantRows }, { data: statsRows }, { data: ratingStatsRows }, { data: myParticipant }, { data: myRating }] = await Promise.all([
      row.winning_book_option_id
        ? supabase.from("book_club_book_options").select("book_title, book_author, cover_image_url").eq("id", row.winning_book_option_id).maybeSingle()
        : Promise.resolve({ data: null }),
      row.host_user_id
        ? supabase.from("public_profiles").select("username, pen_name").eq("user_id", row.host_user_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("book_club_participants").select("user_id").eq("cycle_id", row.id),
      supabase.rpc("book_club_cycle_completion_stats", { p_cycle_id: row.id }),
      supabase.rpc("book_club_cycle_rating_stats", { p_cycle_id: row.id }),
      supabase.from("book_club_participants").select("id").eq("cycle_id", row.id).eq("user_id", user.id).maybeSingle(),
      supabase.from("book_club_ratings").select("id").eq("cycle_id", row.id).eq("user_id", user.id).maybeSingle(),
    ]);

    const participantIds = ((participantRows ?? []) as { user_id: string }[]).map((r) => r.user_id);
    let participants: Participant[] = [];
    if (participantIds.length > 0) {
      const { data } = await supabase
        .from("public_profiles")
        .select("user_id, username, pen_name, avatar_url")
        .in("user_id", participantIds);
      participants = data ?? [];
    }

    const statsRow = (statsRows as { participant_count: number; full_sweep_count: number }[] | null)?.[0];
    const stats = statsRow
      ? { participantCount: Number(statsRow.participant_count), fullSweepCount: Number(statsRow.full_sweep_count) }
      : null;
    const ratingRow = (ratingStatsRows as { rating_count: number; average_rating: number | null }[] | null)?.[0];

    const ratingDeadline = row.cycle_ends_at ? new Date(row.cycle_ends_at).getTime() + 7 * 24 * 60 * 60 * 1000 : null;

    closed.push({
      id: row.id,
      bookTitle: won?.book_title ?? null,
      bookAuthor: won?.book_author ?? null,
      coverImageUrl: won?.cover_image_url ?? null,
      hostName: hostProfile?.pen_name || hostProfile?.username || null,
      participants,
      stats,
      ratingCount: Number(ratingRow?.rating_count ?? 0),
      averageRating: ratingRow?.average_rating != null ? Number(ratingRow.average_rating) : null,
      needsRating: !!myParticipant && !myRating,
      ratingDeadlineLabel: ratingDeadline
        ? new Date(ratingDeadline).toLocaleDateString("en-US", { month: "long", day: "numeric" })
        : null,
      ratingDeadlinePassed: ratingDeadline !== null && new Date() > new Date(ratingDeadline),
    });
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-4 pt-6 pb-32 lg:px-6 lg:py-16 space-y-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Forged &amp; Fatal Book Club</h1>
          <p className="mt-2 text-sm italic text-neutral-400">
            In collaboration with one of our founding members, Erika Tritz, Lethal Bloom Studio presents our brand new monthly book club.
          </p>
          <p className="mt-2 text-sm text-neutral-400">
            One book, one host, one month-long discussion at a time.
          </p>
        </header>

        {/* -- Active month -- */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">This month</h2>
          {!activeCycle && (
            <p className="text-sm text-neutral-400">No Book Club month is running right now.</p>
          )}
          {activeCycle && (
            <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  {activeWinningBook && (
                    <BookClubCoverThumb coverUrl={activeWinningBook.cover_image_url} title={activeWinningBook.book_title} width={48} height={68} />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">
                      {monthLabel(activeCycle.cycle_starts_at) ?? "This month"}
                    </p>
                    {activeWinningBook ? (
                      <>
                        <p className="mt-1 text-lg font-medium text-neutral-100">{activeWinningBook.book_title}</p>
                        <p className="text-sm text-neutral-400">by {activeWinningBook.book_author}</p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-neutral-400">The book is being decided.</p>
                    )}
                    {activeHostName && <p className="mt-2 text-xs text-neutral-500">Hosted by {activeHostName}</p>}
                  </div>
                </div>
                <div className="shrink-0 text-right space-y-1">
                  <p className="text-xs text-neutral-500">{activeMemberCount} member{activeMemberCount === 1 ? "" : "s"}</p>
                  <BookClubStarRating ratingCount={activeRatingCount} averageRating={activeAverageRating} />
                </div>
              </div>

              {activeIsParticipant ? (
                <Link href={`/book-club/cycle/${activeCycle.id}`} className="bookclub-btn">
                  Enter Book Club →
                </Link>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-neutral-400">Opt in to join the discussion.</p>
                  <BookClubOptInButton cycleId={activeCycle.id} />
                </div>
              )}
            </div>
          )}
        </section>

        {/* -- Upcoming months -- */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Upcoming</h2>
          {upcoming.length === 0 && (
            <p className="text-sm text-neutral-500">Nothing queued up yet.</p>
          )}
          <div className="space-y-3">
            {upcoming.map((c) => (
              <div key={c.id} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                  {monthLabel(c.plannedStartsAt) ?? "Next up"}
                </p>

                {c.status === "host_pending" && (
                  <>
                    <p className="text-sm text-neutral-300">Host signup is open for this month.</p>
                    {c.votingOpensAtLabel && (
                      <p className="text-xs text-neutral-500">Voting opens {c.votingOpensAtLabel}.</p>
                    )}
                    <BookClubHostSignupButton cycleId={c.id} initiallySignedUp={c.alreadySignedUpToHost} />

                    {c.slateOptions.length > 0 && (
                      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {c.slateOptions.map((o) => (
                          <div key={o.id} className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg border bookclub-divider bg-neutral-900/40 p-2 text-center">
                            <BookClubCoverThumb coverUrl={o.cover_image_url} title={o.book_title} width={56} height={78} />
                            <p className="w-full truncate text-[10px] font-medium text-neutral-300">{o.book_title}</p>
                            <p className="w-full truncate text-[9px] text-neutral-500">{o.book_author}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {c.isParticipant ? (
                      <Link href={`/book-club/cycle/${c.id}`} className="block text-sm text-neutral-300 underline underline-offset-2 hover:text-white transition">
                        Help build the book slate →
                      </Link>
                    ) : (
                      <div className="border-t border-neutral-800 pt-3">
                        <BookClubOptInButton cycleId={c.id} />
                      </div>
                    )}
                  </>
                )}

                {c.status === "voting" && (
                  <>
                    <p className="text-sm text-neutral-300">Voting on the book slate is underway.</p>
                    {c.hostName && <p className="text-xs text-neutral-500">Hosted by {c.hostName}</p>}

                    {c.slateOptions.length > 0 && (
                      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {c.slateOptions.map((o) => (
                          <div key={o.id} className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg border bookclub-divider bg-neutral-900/40 p-2 text-center">
                            <BookClubCoverThumb coverUrl={o.cover_image_url} title={o.book_title} width={56} height={78} />
                            <p className="w-full truncate text-[10px] font-medium text-neutral-300">{o.book_title}</p>
                            <p className="w-full truncate text-[9px] text-neutral-500">{o.book_author}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {c.isParticipant ? (
                      <Link href={`/book-club/cycle/${c.id}`} className="bookclub-btn">
                        Vote now →
                      </Link>
                    ) : (
                      <div className="space-y-1.5 border-t border-neutral-800 pt-3">
                        <p className="text-xs text-neutral-500">Opt in to vote.</p>
                        <BookClubOptInButton cycleId={c.id} />
                      </div>
                    )}
                  </>
                )}

                {c.status === "questions_pending" && (
                  <>
                    {c.winningBook ? (
                      <>
                        <p className="text-sm font-medium text-neutral-100">{c.winningBook.book_title}</p>
                        <p className="text-xs text-neutral-400">by {c.winningBook.book_author}</p>
                      </>
                    ) : (
                      <p className="text-sm text-neutral-300">The book&apos;s been decided.</p>
                    )}
                    {c.hostName && <p className="text-xs text-neutral-500">Hosted by {c.hostName}</p>}
                    <p className="text-xs text-neutral-500">
                      {c.isHost ? "Finalize this month's discussion questions before launch." : "Questions are being finalized before launch."}
                    </p>
                    {c.isParticipant ? (
                      c.isHost && (
                        <Link href={`/book-club/cycle/${c.id}`} className="block text-sm text-neutral-300 underline underline-offset-2 hover:text-white transition">
                          Finalize questions →
                        </Link>
                      )
                    ) : (
                      <div className="space-y-1.5 border-t border-neutral-800 pt-3">
                        <p className="text-xs text-neutral-500">Opt in to follow along.</p>
                        <BookClubOptInButton cycleId={c.id} />
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* -- Closed months -- */}
        {closed.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Closed</h2>
            <div className="space-y-3">
              {closed.map((c) => (
                <BookClubClosedMonthCard
                  key={c.id}
                  bookTitle={c.bookTitle}
                  bookAuthor={c.bookAuthor}
                  coverImageUrl={c.coverImageUrl}
                  hostName={c.hostName}
                  participants={c.participants}
                  stats={c.stats}
                  ratingCount={c.ratingCount}
                  averageRating={c.averageRating}
                  cycleId={c.id}
                  needsRating={c.needsRating}
                  ratingDeadlineLabel={c.ratingDeadlineLabel}
                  ratingDeadlinePassed={c.ratingDeadlinePassed}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
