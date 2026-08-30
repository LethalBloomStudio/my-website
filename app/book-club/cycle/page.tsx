import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import BookClubSlateForm from "@/components/BookClubSlateForm";
import BookClubVoteBallot from "@/components/BookClubVoteBallot";
import BookClubTieBreakPanel from "@/components/BookClubTieBreakPanel";
import BookClubQuestionnaireEditor from "@/components/BookClubQuestionnaireEditor";
import BookClubWeekSection from "@/components/BookClubWeekSection";
import BookClubCheckInButton from "@/components/BookClubCheckInButton";
import BookClubWeeklyProgress from "@/components/BookClubWeeklyProgress";
import BookClubParticipantAvatars from "@/components/BookClubParticipantAvatars";

export const dynamic = "force-dynamic";

// The "inside" view -- everything opting in actually unlocks. Reached from
// the /book-club landing summary's "Enter Book Club" link; redirects back
// there if there's nothing to enter yet (no cycle, still forming a host)
// or the viewer hasn't opted in (RLS would hide all the data here anyway,
// but redirecting is a clearer experience than a page full of empty states).
export default async function BookClubCyclePage() {
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

  if (!isAdult && !isAdmin) redirect("/discover");

  if (!isAdmin && process.env.NEXT_PUBLIC_BOOK_CLUB_ENABLED !== "true") {
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("is_enabled")
      .eq("name", "book_club")
      .maybeSingle();
    if (!flag?.is_enabled) redirect("/discover");
  }

  const { data: cycle } = await supabase
    .from("book_club_cycles")
    .select("id, status, host_user_id, tie_pending, voting_closes_at, winning_book_option_id")
    .neq("status", "completed")
    .maybeSingle();

  if (!cycle || !["slate_building", "voting", "active"].includes(cycle.status)) {
    redirect("/book-club");
  }

  const { data: participant } = await supabase
    .from("book_club_participants")
    .select("id")
    .eq("cycle_id", cycle.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!participant) redirect("/book-club");

  const isHost = cycle.host_user_id === user.id;

  let bookOptions: { id: string; book_title: string; book_author: string }[] = [];
  let myVoteBookOptionId: string | null = null;
  let tiedOptions: { id: string; book_title: string; book_author: string }[] = [];

  if (cycle.status === "slate_building" || cycle.status === "voting") {
    const { data: options } = await supabase
      .from("book_club_book_options")
      .select("id, book_title, book_author")
      .eq("cycle_id", cycle.id)
      .order("slot_number");
    bookOptions = options ?? [];
  }

  if (cycle.status === "voting") {
    const { data: myVote } = await supabase
      .from("book_club_book_votes")
      .select("book_option_id")
      .eq("cycle_id", cycle.id)
      .eq("voter_id", user.id)
      .maybeSingle();
    myVoteBookOptionId = myVote?.book_option_id ?? null;

    if (isHost && cycle.tie_pending) {
      const { data: tiedIds } = await supabase.rpc("book_club_my_tied_options", { p_cycle_id: cycle.id });
      const ids = (tiedIds as string[] | null) ?? [];
      tiedOptions = bookOptions.filter((o) => ids.includes(o.id));
    }
  }

  let winningBook: { book_title: string; book_author: string } | null = null;
  let hostName: string | null = null;
  let participants: { user_id: string; username: string | null; pen_name: string | null; avatar_url: string | null }[] = [];
  let questions: { id: string; week_number: number; prompt: string; source: "custom" | "preset"; preset_id: string | null }[] = [];
  let currentWeek: number | null = null;
  let myEarnedWeeks: number[] = [];
  let myResponsesByQuestionId: Record<string, string> = {};
  let otherResponsesByQuestionId: Record<string, { id: string; author_name: string; created_at: string; body: string }[]> = {};
  let alreadyCheckedInThisWeek = false;

  if (cycle.status === "active") {
    if (cycle.winning_book_option_id) {
      const { data: won } = await supabase
        .from("book_club_book_options")
        .select("book_title, book_author")
        .eq("id", cycle.winning_book_option_id)
        .maybeSingle();
      winningBook = won ?? null;
    }

    if (cycle.host_user_id) {
      const { data: hostProfile } = await supabase
        .from("public_profiles")
        .select("username, pen_name")
        .eq("user_id", cycle.host_user_id)
        .maybeSingle();
      hostName = hostProfile?.pen_name || hostProfile?.username || "Member";
    }

    // book_club_participants_select_cycle (added alongside the participant
    // avatar row) is what makes this return every participant instead of
    // just the caller's own row.
    const { data: participantRows } = await supabase
      .from("book_club_participants")
      .select("user_id")
      .eq("cycle_id", cycle.id);
    const participantIds = (participantRows ?? []).map((r) => r.user_id);
    if (participantIds.length > 0) {
      const { data: participantProfiles } = await supabase
        .from("public_profiles")
        .select("user_id, username, pen_name, avatar_url")
        .in("user_id", participantIds);
      participants = participantProfiles ?? [];
    }

    // RLS already scopes this correctly per viewer: the host sees every
    // week they've authored (including ones not unlocked yet), everyone
    // else only sees weeks that have actually started.
    const { data: qs } = await supabase
      .from("book_club_questionnaire_questions")
      .select("id, week_number, prompt, source, preset_id")
      .eq("cycle_id", cycle.id)
      .order("week_number");
    questions = qs ?? [];

    const { data: weekNum } = await supabase.rpc("book_club_current_week_number", { p_cycle_id: cycle.id });
    currentWeek = (weekNum as number | null) ?? null;

    const { data: checkmarks } = await supabase
      .from("book_club_weekly_checkmarks")
      .select("week_number")
      .eq("cycle_id", cycle.id)
      .eq("user_id", user.id);
    myEarnedWeeks = (checkmarks ?? []).map((c) => c.week_number);

    if (currentWeek) {
      const { data: checkin } = await supabase
        .from("book_club_check_ins")
        .select("id")
        .eq("cycle_id", cycle.id)
        .eq("user_id", user.id)
        .eq("week_number", currentWeek)
        .maybeSingle();
      alreadyCheckedInThisWeek = !!checkin;
    }

    // Started weeks only -- RLS already hides responses to weeks that
    // haven't unlocked yet, but we only want to render a discussion feed
    // for weeks the viewer can actually answer/read.
    const startedQuestionIds = questions
      .filter((q) => currentWeek !== null && q.week_number <= currentWeek)
      .map((q) => q.id);

    if (startedQuestionIds.length > 0) {
      const { data: responses } = await supabase
        .from("book_club_question_responses")
        .select("id, question_id, user_id, body, created_at")
        .in("question_id", startedQuestionIds)
        .order("created_at");
      const responseRows = (responses ?? []) as { id: string; question_id: string; user_id: string; body: string; created_at: string }[];

      const authorIds = [...new Set(responseRows.map((r) => r.user_id))];
      const { data: profiles } = authorIds.length > 0
        ? await supabase.from("public_profiles").select("user_id, username, pen_name").in("user_id", authorIds)
        : { data: [] };
      const nameMap = new Map(((profiles ?? []) as { user_id: string; username: string | null; pen_name: string | null }[]).map((p) => [p.user_id, p.pen_name || p.username || "Member"]));

      for (const r of responseRows) {
        if (r.user_id === user.id) {
          myResponsesByQuestionId[r.question_id] = r.body;
        } else {
          (otherResponsesByQuestionId[r.question_id] ??= []).push({
            id: r.id,
            author_name: nameMap.get(r.user_id) ?? "Member",
            created_at: r.created_at,
            body: r.body,
          });
        }
      }
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-4 pt-6 pb-32 lg:px-6 lg:py-16 space-y-6">
        <header className="space-y-2">
          <Link href="/book-club" className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-200 transition">
            ← Book Club
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Book Club</h1>
        </header>

        {cycle.status === "slate_building" && (
          <section className="space-y-4">
            <p className="text-sm text-neutral-400">
              {isHost
                ? "Fill in some or all of the slate yourself, or leave slots for participants."
                : "Add a book to the slate (one per person)."}
            </p>
            <BookClubSlateForm />
            {bookOptions.length > 0 && (
              <ul className="space-y-2">
                {bookOptions.map((o) => (
                  <li key={o.id} className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm">
                    <span className="font-medium text-neutral-100">{o.book_title}</span>{" "}
                    <span className="text-neutral-400">by {o.book_author}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {cycle.status === "voting" && (
          <section className="space-y-4">
            {isHost && cycle.tie_pending && tiedOptions.length > 0 && (
              <BookClubTieBreakPanel cycleId={cycle.id} tiedOptions={tiedOptions} />
            )}
            <p className="text-sm text-neutral-400">
              Voting closes {cycle.voting_closes_at ? new Date(cycle.voting_closes_at).toLocaleString() : "soon"}.
            </p>
            <BookClubVoteBallot cycleId={cycle.id} options={bookOptions} myVoteBookOptionId={myVoteBookOptionId} />
          </section>
        )}

        {cycle.status === "active" && (
          <section className="space-y-4">
            {winningBook && (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">This cycle&apos;s book</p>
                <p className="mt-1 text-lg font-medium text-neutral-100">{winningBook.book_title}</p>
                <p className="text-sm text-neutral-400">by {winningBook.book_author}</p>
                {hostName && <p className="mt-2 text-xs text-neutral-500">Hosted by {hostName}</p>}
              </div>
            )}

            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
              <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Who&apos;s reading along</p>
              <BookClubParticipantAvatars participants={participants} />
            </div>

            {isHost && (
              <BookClubQuestionnaireEditor cycleId={cycle.id} existingQuestions={questions} currentWeek={currentWeek} />
            )}

            <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Your weekly progress</p>
              <BookClubWeeklyProgress earnedWeeks={myEarnedWeeks} />
            </div>

            <div className="space-y-3">
              {questions.map((q) => {
                const started = currentWeek !== null && q.week_number <= currentWeek;
                const closed = started && currentWeek !== null && q.week_number < currentWeek;
                return (
                  <BookClubWeekSection
                    key={q.id}
                    cycleId={cycle.id}
                    currentUserId={user.id}
                    weekNumber={q.week_number}
                    prompt={q.prompt}
                    started={started}
                    closed={closed}
                    defaultOpen={q.week_number === currentWeek}
                    questionId={started ? q.id : null}
                    myResponseBody={myResponsesByQuestionId[q.id] ?? ""}
                    otherResponses={otherResponsesByQuestionId[q.id] ?? []}
                  />
                );
              })}
            </div>

            {currentWeek !== null && (
              <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                <p className="text-xs text-neutral-500">
                  Plus one more thing this week to earn your checkmark -- comment below or:
                </p>
                <BookClubCheckInButton cycleId={cycle.id} alreadyCheckedInThisWeek={alreadyCheckedInThisWeek} />
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
