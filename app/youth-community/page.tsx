import { Suspense } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import UploadCarousel from "../community/UploadCarousel";
import CommunityFeed from "../community/CommunityFeed";
import DiscussionBoard from "../community/DiscussionBoard";

export const dynamic = "force-dynamic";

export default async function YouthCommunityPage() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");

  const { data } = await supabase
    .from("accounts")
    .select("age_category, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  const account = data as { age_category: string | null; is_admin?: boolean } | null;
  const isYouth = account?.age_category === "youth_13_17";
  const isAdmin = !!account?.is_admin;

  if (!isYouth && !isAdmin) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-2xl px-6 py-16 space-y-6">
          <header>
            <h1 className="text-3xl font-semibold tracking-tight">Youth Community</h1>
          </header>
          <div className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] px-6 py-6 space-y-3">
            <p className="text-sm font-medium text-neutral-200">Access restricted</p>
            <p className="text-sm text-neutral-400 leading-relaxed">
              The Youth Community page is available to youth accounts only.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-[1400px] px-6 py-16 space-y-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Youth Community</h1>
          <p className="mt-2 text-sm text-neutral-400">Connect with fellow young authors and readers.</p>
        </header>

        {/* ── Recent Uploads carousel ── */}
        <div className="space-y-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Recent Uploads</h2>
          <UploadCarousel audience="youth" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">

          {/* ── Discussion Board ── */}
          <section>
            <Suspense>
              <DiscussionBoard currentUserId={user.id} community="youth" />
            </Suspense>
          </section>

          {/* ── Community Feed ── */}
          <section className="space-y-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Community Feed</h2>
            <CommunityFeed viewerId={user.id} audience="youth" />
          </section>

        </div>
      </div>
    </main>
  );
}
