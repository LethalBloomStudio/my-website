import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import BookClubQuestionEditForm from "@/components/BookClubQuestionEditForm";

export const dynamic = "force-dynamic";

// Dedicated page for editing one week's question, reached from that week's
// dropdown Edit link on the cycle view -- not embedded inline there, so the
// host sees the same plain week-dropdown list everyone else does. Only
// reachable for the cycle's own host, and only for a week that hasn't
// started yet (the RLS write check is the real enforcement of that; this
// redirect is the UI-level reflection of it, same "cosmetic guard, real
// boundary is server-side" pattern used throughout Book Club).
export default async function BookClubQuestionEditPage({
  params,
}: {
  params: Promise<{ cycleId: string; week: string }>;
}) {
  const { cycleId, week: weekParam } = await params;
  const weekNumber = Number(weekParam);
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

  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 4) {
    redirect(`/book-club/cycle/${cycleId}`);
  }

  const { data: cycle } = await supabase
    .from("book_club_cycles")
    .select("id, status, host_user_id")
    .eq("id", cycleId)
    .maybeSingle();

  if (!cycle || cycle.status !== "active" || cycle.host_user_id !== user.id) {
    redirect(`/book-club/cycle/${cycleId}`);
  }

  const { data: weekNum } = await supabase.rpc("book_club_current_week_number", { p_cycle_id: cycleId });
  const currentWeek = (weekNum as number | null) ?? null;
  const started = currentWeek !== null && weekNumber <= currentWeek;
  if (started) {
    redirect(`/book-club/cycle/${cycleId}`);
  }

  const { data: existing } = await supabase
    .from("book_club_questionnaire_questions")
    .select("prompt, source, preset_id")
    .eq("cycle_id", cycleId)
    .eq("week_number", weekNumber)
    .maybeSingle();

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-32 lg:px-6 lg:py-16 space-y-6">
        <header className="space-y-2">
          <Link href={`/book-club/cycle/${cycleId}`} className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-200 transition">
            ← Book Club
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Week {weekNumber} question</h1>
          <p className="text-sm text-neutral-400">This week hasn&apos;t started yet, so it&apos;s still editable.</p>
        </header>

        <BookClubQuestionEditForm
          cycleId={cycleId}
          weekNumber={weekNumber}
          initialSource={(existing?.source as "custom" | "preset") ?? "custom"}
          initialPrompt={existing?.prompt ?? ""}
          initialPresetId={existing?.preset_id ?? null}
        />
      </div>
    </main>
  );
}
