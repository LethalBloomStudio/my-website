import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import BookClubHostSignupButton from "@/components/BookClubHostSignupButton";
import BookClubOptInButton from "@/components/BookClubOptInButton";

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

  // Admin-controlled kill switch (admin dashboard's Feature Flags tab).
  // Admins always bypass it so they can preview/test regardless of the
  // toggle state; NEXT_PUBLIC_BOOK_CLUB_ENABLED=true in .env.local is a
  // local-only convenience so testing doesn't depend on which account
  // you're signed in as (local dev hits the same remote DB as production).
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
    .select("id, status, host_user_id, grace_window_deadline, cycle_starts_at, winning_book_option_id")
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

  // Both readable by any adult regardless of opt-in status -- the decided
  // host and book are the public "here's what's happening" announcement;
  // the slate/votes that led to it stay opt-in-gated (see
  // 20260829040024_book_club_public_winning_book.sql for the book side).
  let hostName: string | null = null;
  let winningBook: { book_title: string; book_author: string } | null = null;
  if (cycle?.host_user_id) {
    const { data: hostProfile } = await supabase
      .from("public_profiles")
      .select("username, pen_name")
      .eq("user_id", cycle.host_user_id)
      .maybeSingle();
    hostName = hostProfile?.pen_name || hostProfile?.username || "Member";
  }
  if (cycle?.winning_book_option_id) {
    const { data: won } = await supabase
      .from("book_club_book_options")
      .select("book_title, book_author")
      .eq("id", cycle.winning_book_option_id)
      .maybeSingle();
    winningBook = won ?? null;
  }

  const monthLabel = cycle?.cycle_starts_at
    ? new Date(cycle.cycle_starts_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

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

        {cycle && ["slate_building", "voting", "active"].includes(cycle.status) && (
          <section className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                {monthLabel ? `${monthLabel} Book Club` : "This cycle's Book Club"}
              </p>
              {winningBook ? (
                <>
                  <p className="mt-1 text-lg font-medium text-neutral-100">{winningBook.book_title}</p>
                  <p className="text-sm text-neutral-400">by {winningBook.book_author}</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-neutral-400">
                  {cycle.status === "slate_building" ? "The host is building the book slate." : "Voting is underway."}
                </p>
              )}
              {hostName && <p className="mt-2 text-xs text-neutral-500">Hosted by {hostName}</p>}
            </div>

            {isParticipant ? (
              <Link href="/book-club/cycle" className="bookclub-btn">
                Enter Book Club →
              </Link>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-neutral-400">
                  Opt in to see the book slate, vote, and join the discussion.
                </p>
                <BookClubOptInButton />
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
