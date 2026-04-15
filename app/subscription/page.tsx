import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import SubscriptionClient from "./SubscriptionClient";

export const dynamic = "force-dynamic";

type YouthLink = {
  id: string;
  child_name: string;
  subscription_tier: "free" | "unlimited";
  status: string;
};

export default async function SubscriptionPage() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");

  const { data } = await supabase
    .from("accounts")
    .select("subscription_status, age_category, active_promotion_id, promotion_expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const account = data as { subscription_status: string | null; age_category: string | null; active_promotion_id: string | null; promotion_expires_at: string | null } | null;
  const baseStatus = account?.subscription_status?.trim() || "free";
  const onActivePromo = !!(account?.active_promotion_id && account?.promotion_expires_at && new Date(account.promotion_expires_at) > new Date());
  const status = onActivePromo && baseStatus === "free" ? "lethal" : baseStatus;
  const isYouth = account?.age_category === "youth_13_17";
  const admin = supabaseAdmin();

  // For youth: fetch parent info
  let parentUsername: string | null = null;
  if (isYouth) {
    const { data: link } = await admin
      .from("youth_links")
      .select("parent_user_id")
      .eq("child_user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const parentId = (link as { parent_user_id?: string } | null)?.parent_user_id ?? null;
    if (parentId) {
      const { data: pp } = await admin
        .from("public_profiles")
        .select("username")
        .eq("user_id", parentId)
        .maybeSingle();
      parentUsername = (pp as { username?: string } | null)?.username ?? null;
    }
  }

  // For parent accounts: fetch linked youth (use admin to bypass RLS)
  let youthLinks: YouthLink[] = [];
  if (!isYouth) {
    const { data: links } = await admin
      .from("youth_links")
      .select("id, child_name, subscription_tier, status")
      .eq("parent_user_id", user.id)
      .eq("status", "active");
    youthLinks = (links as YouthLink[] | null) ?? [];
  }

  // Billing breakdown
  const isLethal = status === "lethal" || status === "lethal_annual" || status === "lethal_member" || status === "lethal_member_annual";
  const isAnnual = status === "lethal_annual" || status === "lethal_member_annual";
  const baseMonthly = isLethal ? (isAnnual ? 100 : 10) : 0;
  const unlimitedYouth = youthLinks.filter((l) => l.subscription_tier === "unlimited");
  const youthAddonMonthly = unlimitedYouth.length * 5;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-2xl px-6 py-16 space-y-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Subscription</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Manage your Lethal Bloom Studio membership.
          </p>
        </header>

        {isYouth ? (
          /* Youth accounts cannot manage their own subscription */
          <div className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] px-6 py-6 space-y-3">
            <p className="text-sm font-medium text-neutral-200">
              Subscription managed by your parent or guardian
            </p>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Your subscription tier is controlled by your linked parent account. To change or upgrade
              your plan, ask your parent to visit their Manage Youth page.
            </p>
            <div className="flex gap-3 pt-1">
              {parentUsername && (
                <Link
                  href={`/u/${parentUsername}`}
                  className="inline-flex h-9 items-center rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.14)] px-4 text-sm text-neutral-200 hover:bg-[rgba(120,120,120,0.24)] transition"
                >
                  View parent profile
                </Link>
              )}
              <Link
                href="/account"
                className="inline-flex h-9 items-center rounded-lg border border-[rgba(120,120,120,0.4)] bg-transparent px-4 text-sm text-neutral-400 hover:text-neutral-200 transition"
              >
                Back to account
              </Link>
            </div>
          </div>
        ) : (
          <>
            <SubscriptionClient currentStatus={status} />

            {/* Billing summary - always visible */}
            <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
                  Billing Summary
                </h2>
                <div className="rounded-xl border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.07)] overflow-hidden">
                  {/* Base plan row */}
                  <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-[rgba(120,120,120,0.15)]">
                    <div>
                      <p className="text-sm text-neutral-200">
                        {isLethal
                          ? isAnnual
                            ? "Lethal Member - Annual"
                            : "Lethal Member - Monthly"
                          : "Bloom Member"}
                      </p>
                      <p className="text-xs text-neutral-500">{isLethal ? "Subscription" : "Base plan"}</p>
                    </div>
                    <span className="text-sm font-medium text-neutral-200 shrink-0">
                      {isLethal ? (isAnnual ? "$100/yr" : "$10/mo") : "Free"}
                    </span>
                  </div>

                  {/* Youth add-on rows */}
                  {youthLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between gap-4 px-5 py-3 border-b border-[rgba(120,120,120,0.15)]"
                    >
                      <div>
                        <p className="text-sm text-neutral-200">{link.child_name}</p>
                        <p className="text-xs text-neutral-500">
                          Youth account &middot;{" "}
                          {link.subscription_tier === "unlimited"
                            ? "Unlimited add-on"
                            : "Bloom Member"}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-neutral-200 shrink-0">
                        {link.subscription_tier === "unlimited" ? "$5/mo" : "$0/mo"}
                      </span>
                    </div>
                  ))}

                  {/* Total */}
                  <div className="flex items-center justify-between gap-4 px-5 py-3 bg-[rgba(120,120,120,0.05)]">
                    <p className="text-sm font-semibold text-neutral-100">
                      Estimated total
                      {isAnnual && youthAddonMonthly > 0 && (
                        <span className="ml-1.5 text-xs font-normal text-neutral-500">
                          (annual base + monthly add-ons)
                        </span>
                      )}
                    </p>
                    <span className="text-sm font-bold text-neutral-100 shrink-0">
                      {isAnnual && youthAddonMonthly > 0
                        ? `$100/yr + $${youthAddonMonthly}/mo`
                        : isAnnual
                        ? "$100/yr"
                        : `$${baseMonthly + youthAddonMonthly}/mo`}
                    </span>
                  </div>
                </div>

                {youthLinks.length > 0 && (
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    Youth account add-ons are billed monthly and added to your subscription.
                    Manage youth tiers from your{" "}
                    <Link
                      href="/manage-youth"
                      className="text-neutral-400 underline underline-offset-2 hover:text-neutral-200 transition"
                    >
                      Manage Youth
                    </Link>{" "}
                    page.
                  </p>
                )}
              </section>
          </>
        )}

        <div className="border-t border-[rgba(120,120,120,0.2)] pt-6 flex flex-wrap gap-3">
          <Link
            href="/pricing"
            className="text-sm text-neutral-500 hover:text-neutral-300 underline underline-offset-2 transition"
          >
            View full pricing details
          </Link>
          <span className="text-neutral-400">·</span>
          <Link
            href="/account"
            className="text-sm text-neutral-500 hover:text-neutral-300 underline underline-offset-2 transition"
          >
            Back to account
          </Link>
        </div>
      </div>
    </main>
  );
}
