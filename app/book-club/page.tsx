import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import BookClubHostSignupButton from "@/components/BookClubHostSignupButton";
import BookClubOptInButton from "@/components/BookClubOptInButton";
import BookClubSlateForm from "@/components/BookClubSlateForm";
import BookClubVoteBallot from "@/components/BookClubVoteBallot";
import BookClubTieBreakPanel from "@/components/BookClubTieBreakPanel";

export const dynamic = "force-dynamic";

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

  const { data: cycle } = await supabase
    .from("book_club_cycles")
    .select("id, status, host_user_id, grace_window_deadline, tie_pending, voting_closes_at")
    .neq("status", "completed")
    .maybeSingle();

  let alreadySignedUpToHost = false;
  let isParticipant = false;
  if (cycle) {
    const [{ data: signup }, { data: participant }] = await Promise.all([
      supabase
        .from("book_club_host_signups")
        .select("id")
        .eq("cycle_id", cycle.id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("book_club_participants")
        .select("id")
        .eq("cycle_id", cycle.id)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    alreadySignedUpToHost = !!signup;
    isParticipant = !!participant;
  }

  const isHost = !!cycle && cycle.host_user_id === user.id;

  let bookOptions: { id: string; book_title: string; book_author: string }[] = [];
  let myVoteBookOptionId: string | null = null;
  let tiedOptions: { id: string; book_title: string; book_author: string }[] = [];

  if (cycle && isParticipant && (cycle.status === "slate_building" || cycle.status === "voting")) {
    const { data: options } = await supabase
      .from("book_club_book_options")
      .select("id, book_title, book_author")
      .eq("cycle_id", cycle.id)
      .order("slot_number");
    bookOptions = options ?? [];
  }

  if (cycle && isParticipant && cycle.status === "voting") {
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

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-4 pt-6 pb-32 lg:px-6 lg:py-16 space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Book Club</h1>
          <p className="mt-2 text-sm text-neutral-400">
            One book, one host, one month-long discussion at a time.
          </p>
        </header>

        {!cycle && (
          <p className="text-sm text-neutral-400">
            Book Club is between cycles right now. Check back soon for the next host signup.
          </p>
        )}

        {cycle?.status === "host_pending" && (
          <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
            <p className="text-sm text-neutral-300">
              No one has signed up to host the next cycle yet. Sign up and you&apos;ll be selected
              as soon as the host-signup window closes.
            </p>
            <BookClubHostSignupButton initiallySignedUp={alreadySignedUpToHost} />
          </section>
        )}

        {cycle?.status === "host_grace" && (
          <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
            <p className="text-sm text-neutral-300">
              Someone has signed up to host. There&apos;s still time to join the running
              {cycle.grace_window_deadline
                ? ` before the host is picked (by ${new Date(cycle.grace_window_deadline).toLocaleString()}).`
                : "."}
            </p>
            <BookClubHostSignupButton initiallySignedUp={alreadySignedUpToHost} />
          </section>
        )}

        {cycle?.status === "slate_building" && (
          <section className="space-y-4">
            {!isParticipant && (
              <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
                <p className="text-sm text-neutral-300">
                  The host is building this cycle&apos;s book slate. Opt in to add a book or to vote
                  once the slate is ready.
                </p>
                <BookClubOptInButton />
              </div>
            )}
            {isParticipant && (
              <>
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
              </>
            )}
          </section>
        )}

        {cycle?.status === "voting" && (
          <section className="space-y-4">
            {!isParticipant && (
              <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
                <p className="text-sm text-neutral-300">
                  Voting is underway for this cycle. Opt in to join future weeks (voting itself is
                  only open to members who opted in before the vote).
                </p>
                <BookClubOptInButton />
              </div>
            )}
            {isParticipant && (
              <>
                {isHost && cycle.tie_pending && tiedOptions.length > 0 && (
                  <BookClubTieBreakPanel cycleId={cycle.id} tiedOptions={tiedOptions} />
                )}
                <p className="text-sm text-neutral-400">
                  Voting closes {cycle.voting_closes_at ? new Date(cycle.voting_closes_at).toLocaleString() : "soon"}.
                </p>
                <BookClubVoteBallot
                  cycleId={cycle.id}
                  options={bookOptions}
                  myVoteBookOptionId={myVoteBookOptionId}
                />
              </>
            )}
          </section>
        )}

        {cycle?.status === "active" && (
          <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
            <p className="text-sm text-neutral-300">
              This cycle&apos;s book has been chosen and the discussion is running.
              {!isParticipant && " Opt in to join."}
            </p>
            {!isParticipant && <BookClubOptInButton />}
            {isParticipant && (
              <p className="text-sm text-neutral-500">
                Discussion thread, questionnaire, and weekly checkmarks are coming in the next
                build phase.
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
