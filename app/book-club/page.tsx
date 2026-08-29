import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import BookClubHostSignupButton from "@/components/BookClubHostSignupButton";

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
    .select("id, status, grace_window_deadline")
    .in("status", ["host_pending", "host_grace"])
    .maybeSingle();

  let alreadySignedUp = false;
  if (cycle) {
    const { data: signup } = await supabase
      .from("book_club_host_signups")
      .select("id")
      .eq("cycle_id", cycle.id)
      .eq("user_id", user.id)
      .maybeSingle();
    alreadySignedUp = !!signup;
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
            <BookClubHostSignupButton initiallySignedUp={alreadySignedUp} />
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
            <BookClubHostSignupButton initiallySignedUp={alreadySignedUp} />
          </section>
        )}
      </div>
    </main>
  );
}
