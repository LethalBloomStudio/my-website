import Link from "next/link";
import Image from "next/image";
import { redirect, notFound } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import BookClubSlateForm from "@/components/BookClubSlateForm";
import BookClubVoteBallot from "@/components/BookClubVoteBallot";
import BookClubTieBreakPanel from "@/components/BookClubTieBreakPanel";
import BookClubQuestionnaireEditor from "@/components/BookClubQuestionnaireEditor";
import BookClubWeekSection from "@/components/BookClubWeekSection";
import BookClubWeeklyProgress from "@/components/BookClubWeeklyProgress";
import BookClubParticipantAvatars from "@/components/BookClubParticipantAvatars";
import BookClubComments from "@/components/BookClubComments";

export const dynamic = "force-dynamic";

// The "inside" view for one specific upcoming/active cycle -- reached from
// /book-club's active card or one of its up-to-3 upcoming cards. Several
// non-completed cycles can exist at once now (the rolling pipeline), so
// this is keyed by cycleId instead of resolving "the" cycle. A completed
// cycle has nothing here any more -- its RLS-enforced lockout means every
// query below just comes back empty/null for one, so it 404s rather than
// rendering a blank shell.
export default async function BookClubCyclePage({ params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await params;
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
    .select("id, status, host_user_id, tie_pending, voting_closes_at, winning_book_option_id, planned_starts_at")
    .eq("id", cycleId)
    .maybeSingle();

  if (!cycle || cycle.status === "completed") {
    notFound();
  }
  if (!["host_pending", "voting", "questions_pending", "active"].includes(cycle.status)) {
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

  let bookOptions: { id: string; book_title: string; book_author: string; cover_image_url: string | null }[] = [];
  let myVoteBookOptionId: string | null = null;
  let tiedOptions: { id: string; book_title: string; book_author: string; cover_image_url: string | null }[] = [];

  if (cycle.status === "host_pending" || cycle.status === "voting") {
    const { data: options } = await supabase
      .from("book_club_book_options")
      .select("id, book_title, book_author, cover_image_url")
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
  const myResponsesByQuestionId: Record<string, string> = {};
  const myResponseIdByQuestionId: Record<string, string> = {};
  const myResponseRepliesByQuestionId: Record<string, { id: string; author_name: string; created_at: string; body: string }[]> = {};
  const otherResponsesByQuestionId: Record<string, { id: string; author_name: string; created_at: string; body: string; replies: { id: string; author_name: string; created_at: string; body: string }[] }[]> = {};

  if (cycle.status === "questions_pending" || cycle.status === "active") {
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
  }

  if (cycle.status === "questions_pending" && isHost) {
    const { data: qs } = await supabase
      .from("book_club_questionnaire_questions")
      .select("id, week_number, prompt, source, preset_id")
      .eq("cycle_id", cycle.id)
      .order("week_number");
    questions = qs ?? [];
  }

  if (cycle.status === "active") {
    // book_club_participants_select_cycle only opens this up once the
    // cycle is active/completed -- host_pending/voting/questions_pending
    // stay opt-in-only, matching the slate's own visibility.
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

      // Replies to any of this week's answers -- shown under both "your
      // answer" (replies you received) and each of the others' answers
      // (replies to those, plus your own reply affordance).
      const responseIds = responseRows.map((r) => r.id);
      const repliesByResponseId: Record<string, { id: string; author_name: string; created_at: string; body: string }[]> = {};
      if (responseIds.length > 0) {
        const { data: replyRows } = await supabase
          .from("book_club_response_replies")
          .select("id, response_id, author_id, body, created_at")
          .in("response_id", responseIds)
          .order("created_at");
        const replies = (replyRows ?? []) as { id: string; response_id: string; author_id: string; body: string; created_at: string }[];
        const replyAuthorIds = [...new Set(replies.map((r) => r.author_id))];
        const { data: replyProfiles } = replyAuthorIds.length > 0
          ? await supabase.from("public_profiles").select("user_id, username, pen_name").in("user_id", replyAuthorIds)
          : { data: [] };
        const replyNameMap = new Map(((replyProfiles ?? []) as { user_id: string; username: string | null; pen_name: string | null }[]).map((p) => [p.user_id, p.pen_name || p.username || "Member"]));
        for (const r of replies) {
          (repliesByResponseId[r.response_id] ??= []).push({
            id: r.id,
            author_name: r.author_id === user.id ? "You" : replyNameMap.get(r.author_id) ?? "Member",
            created_at: r.created_at,
            body: r.body,
          });
        }
      }

      for (const r of responseRows) {
        if (r.user_id === user.id) {
          myResponsesByQuestionId[r.question_id] = r.body;
          myResponseIdByQuestionId[r.question_id] = r.id;
          myResponseRepliesByQuestionId[r.question_id] = repliesByResponseId[r.id] ?? [];
        } else {
          (otherResponsesByQuestionId[r.question_id] ??= []).push({
            id: r.id,
            author_name: nameMap.get(r.user_id) ?? "Member",
            created_at: r.created_at,
            body: r.body,
            replies: repliesByResponseId[r.id] ?? [],
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

        {cycle.status === "host_pending" && (
          <section className="space-y-4">
            <p className="text-sm text-neutral-400">
              Host selection for this month happens closer to launch. In the meantime, add a book to the slate
              (one per person -- whoever&apos;s picked as host may fill several).
            </p>
            <BookClubSlateForm cycleId={cycle.id} />
            {bookOptions.length > 0 && (
              <ul className="space-y-2">
                {bookOptions.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm">
                    {o.cover_image_url ? (
                      <Image src={o.cover_image_url} alt={o.book_title} width={32} height={44} className="h-11 w-8 shrink-0 rounded object-cover" />
                    ) : null}
                    <span>
                      <span className="font-medium text-neutral-100">{o.book_title}</span>{" "}
                      <span className="text-neutral-400">by {o.book_author}</span>
                    </span>
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

        {cycle.status === "questions_pending" && (
          <section className="space-y-4">
            {winningBook && (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Next month&apos;s book</p>
                <p className="mt-1 text-lg font-medium text-neutral-100">{winningBook.book_title}</p>
                <p className="text-sm text-neutral-400">by {winningBook.book_author}</p>
                {hostName && <p className="mt-2 text-xs text-neutral-500">Hosted by {hostName}</p>}
              </div>
            )}
            {isHost ? (
              <>
                <p className="text-sm text-neutral-400">
                  Final week before launch -- finalize the discussion questions for all 4 weeks.
                </p>
                <BookClubQuestionnaireEditor cycleId={cycle.id} existingQuestions={questions} currentWeek={null} />
              </>
            ) : (
              <p className="text-sm text-neutral-400">
                The book&apos;s decided -- {hostName ?? "the host"} is finalizing this month&apos;s discussion questions.
                This month launches automatically once that&apos;s done.
              </p>
            )}
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

            <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Your weekly progress</p>
              <BookClubWeeklyProgress earnedWeeks={myEarnedWeeks} />
            </div>

            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, i) => i + 1).map((weekNumber) => {
                const q = questions.find((question) => question.week_number === weekNumber);
                const started = currentWeek !== null && weekNumber <= currentWeek;
                const closed = started && currentWeek !== null && weekNumber < currentWeek;
                return (
                  <BookClubWeekSection
                    key={weekNumber}
                    cycleId={cycle.id}
                    currentUserId={user.id}
                    isHost={isHost}
                    weekNumber={weekNumber}
                    prompt={q?.prompt ?? ""}
                    started={started}
                    closed={closed}
                    defaultOpen={weekNumber === currentWeek}
                    questionId={started && q ? q.id : null}
                    myResponseId={q ? myResponseIdByQuestionId[q.id] ?? null : null}
                    myResponseBody={q ? myResponsesByQuestionId[q.id] ?? "" : ""}
                    myResponseReplies={q ? myResponseRepliesByQuestionId[q.id] ?? [] : []}
                    otherResponses={q ? otherResponsesByQuestionId[q.id] ?? [] : []}
                  />
                );
              })}
            </div>

            <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Group Thoughts and Discussion</p>
              <p className="text-xs text-neutral-500">
                Anything about the book, on your mind -- not tied to a specific week&apos;s question.
              </p>
              <BookClubComments cycleId={cycle.id} weekNumber={0} currentUserId={user.id} canPost={true} />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
