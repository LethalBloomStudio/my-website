import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import { isOwnerEmail } from "@/lib/ownerAccess";
import { requestAppeal, updateAccount } from "./actions";
import BlockedUsersPanel from "@/components/BlockedUsersPanel";
import ThemeToggle from "@/components/ThemeToggle";
import AccountDangerZone from "./AccountDangerZone";
import SignOutButton from "./SignOutButton";

type AccountData = {
  account_name: string | null;
  full_name: string | null;
  dob: string | null;
  email: string | null;
  subscription_status: string | null;
  age_category: string | null;
  parental_consent: boolean | null;
  conduct_strikes: number | null;
  messaging_suspended_until: string | null;
  blacklisted: boolean | null;
  appeal_requested: boolean | null;
  is_deactivated: boolean | null;
} | null;

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; error?: string; appeal?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");

  const { data } = await supabase
    .from("accounts")
    .select(
      "account_name, full_name, dob, email, subscription_status, age_category, parental_consent, conduct_strikes, messaging_suspended_until, blacklisted, appeal_requested, is_deactivated"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  // For youth accounts, fetch the parent link (use admin to bypass RLS)
  const admin = supabaseAdmin();
  const { data: youthLink } = await admin
    .from("youth_links")
    .select("child_name, parent_user_id")
    .eq("child_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const youthLinkRow = youthLink as { child_name?: string; parent_user_id?: string } | null;
  const parentEnteredName = youthLinkRow?.child_name ?? null;
  const parentUserId = youthLinkRow?.parent_user_id ?? null;

  // Fetch parent's public profile for display
  let parentProfile: { pen_name: string | null; username: string | null } | null = null;
  if (parentUserId) {
    const { data: pp } = await admin
      .from("public_profiles")
      .select("pen_name, username")
      .eq("user_id", parentUserId)
      .maybeSingle();
    parentProfile = (pp as { pen_name: string | null; username: string | null } | null) ?? null;
  }

  // Count linked youth accounts (for danger zone cascade warning)
  const { data: youthChildren } = await admin
    .from("youth_links")
    .select("child_user_id")
    .eq("parent_user_id", user.id)
    .eq("status", "active");
  const linkedYouthCount = (youthChildren ?? []).length;

  const { data: ownerAdmin } = await supabase
    .from("owner_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const account = data as AccountData;
  const metadata = (user.user_metadata ?? {}) as Record<string, string | boolean | undefined>;
  const metadataDob = typeof metadata.dob === "string" ? metadata.dob : null;
  const metadataName = typeof metadata.full_name === "string" ? metadata.full_name : null;
  const metadataConsent = typeof metadata.parental_consent === "boolean" ? metadata.parental_consent : false;

  if (!account) {
    await supabase.from("accounts").upsert({
      user_id: user.id,
      full_name: metadataName ?? "",
      email: user.email ?? "",
      dob: metadataDob,
      parental_consent: metadataConsent,
      updated_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    });
  }

  const name = account?.full_name?.trim() || account?.account_name?.trim() || "-";
  const email = account?.email?.trim() || user.email || "-";
  const dobRaw = account?.dob ?? metadataDob;
  const status = account?.subscription_status?.trim() || "free";
  const ageCategory = account?.age_category ?? "-";
  const parentalConsent = account?.parental_consent ?? metadataConsent;
  const strikes = account?.conduct_strikes ?? 0;
  const blacklisted = !!account?.blacklisted;
  const appealRequested = !!account?.appeal_requested;
  const isDeactivated = !!account?.is_deactivated;
  const suspendedUntil = account?.messaging_suspended_until ? new Date(account.messaging_suspended_until) : null;
  const hasSuspension = !!suspendedUntil;
  const isOwner = Boolean(ownerAdmin) || isOwnerEmail(user.email);
  const calculateAge = (dob: string | null) => {
    if (!dob) return null;
    const birth = new Date(`${dob}T00:00:00`);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const beforeBirthday =
      now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
    if (beforeBirthday) age -= 1;
    return Number.isNaN(age) ? null : age;
  };

  const derivedAge = calculateAge(dobRaw ?? null);
  const derivedCategory =
    derivedAge === null
      ? null
      : derivedAge < 13
      ? "under_13"
      : derivedAge < 18
      ? "youth_13_17"
      : "adult_18_plus";
  const effectiveAgeCategory = ageCategory && ageCategory !== "-" ? ageCategory : derivedCategory ?? "-";
  const ageCategoryLabel =
    effectiveAgeCategory === "youth_13_17"
      ? "Youth (13-17)"
      : effectiveAgeCategory === "adult_18_plus"
      ? "Adult (18+)"
      : "-";
  const messagingLabel = blacklisted
    ? "Blacklisted"
    : hasSuspension && suspendedUntil
    ? `Suspended until ${suspendedUntil.toLocaleString()}`
    : "Active";
  const requiresParentalApproval = effectiveAgeCategory === "youth_13_17" && !parentalConsent;
  const baseCard = "rounded-xl border px-4 py-3";
  const purpleBorder = "rgba(120,120,120,0.55)";
  const purpleBg = "rgba(120,120,120,0.08)";
  const purpleText = "rgba(255,210,210,0.95)";
  const neutralCard = `${baseCard} border-[${purpleBorder}] bg-[${purpleBg}] text-[${purpleText}]`;
  const strikesCardClass =
    strikes > 0
      ? `${baseCard} border-[${purpleBorder}] bg-[${purpleBg}] text-[${purpleText}]`
      : neutralCard;
  const messagingCardClass = neutralCard;

  const errorMsg =
    params.error === "email_required"
      ? "Email is required."
      : params.error === "dob_required"
      ? "Date of birth is required."
      : params.error === "age_restricted"
      ? "This platform is limited to users 13 and older."
      : params.error === "parental_consent_required"
      ? "Parent/guardian approval is required for youth profiles."
      : params.error
      ? decodeURIComponent(params.error)
      : null;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
        <p className="mt-3 text-neutral-400">Your private account details (not shown on your public profile).</p>

        {params.saved ? (
          <div className="mt-6 rounded-xl border border-emerald-900 bg-emerald-950/40 p-4 text-sm text-emerald-200">
            Account saved.
          </div>
        ) : null}

        {errorMsg ? (
          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
            {errorMsg}
          </div>
        ) : null}

        {params.appeal === "requested" ? (
          <div className="mt-6 rounded-xl border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.15)] p-4 text-sm text-white">
            Appeal submitted. The owner will review your case.
          </div>
        ) : null}

        {requiresParentalApproval ? (
          <div className="mt-8 rounded-xl border border-amber-900 bg-amber-950/30 p-6 space-y-4">
            <p className="text-lg font-semibold text-amber-50">Parental approval required</p>
            <p className="text-sm text-amber-100/90 leading-relaxed">
              This youth account is locked until a parent or guardian links and confirms it from their account. Ask your parent or guardian to log into their Lethal Bloom Studio account, go to <strong className="text-amber-50">Manage Youth</strong>, and add you using the email address you signed up with.
            </p>
            <p className="text-sm text-amber-100/70">
              Once they link your account, you will have full access to the platform.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <SignOutButton />
              <Link
                href="/help"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-amber-800/50 px-4 text-sm text-amber-200 hover:text-amber-50 transition"
              >
                Get help
              </Link>
            </div>
          </div>
        ) : null}

        {!requiresParentalApproval ? (
          <form action={updateAccount} className="mt-8 space-y-5 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-6">
          {effectiveAgeCategory === "youth_13_17" && parentEnteredName ? (
            <div className="block">
              <div className="text-sm text-neutral-400">Name</div>
              <div className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/20 px-4 py-3 text-sm text-neutral-300">
                {parentEnteredName}
              </div>
              <p className="mt-2 text-xs text-neutral-500">Name is set by your parent or guardian and cannot be changed.</p>
            </div>
          ) : (
            <label className="block">
              <div className="text-sm text-neutral-400">Name</div>
              <input
                name="full_name"
                defaultValue={name === "-" ? "" : name}
                className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3"
                placeholder="Your name"
              />
            </label>
          )}

          <label className="block">
            <div className="text-sm text-neutral-400">Email (private)</div>
            <input
              name="email"
              type="email"
              defaultValue={email === "-" ? "" : email}
              className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3"
              placeholder="you@example.com"
            />
          </label>

          <div className="block">
            <div className="text-sm text-neutral-400">Date of birth (private)</div>
            <div className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/20 px-4 py-3 text-sm text-neutral-300">
              {dobRaw ? new Date(`${dobRaw}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—"}
            </div>
            <p className="mt-2 text-xs text-neutral-500">Date of birth cannot be changed after sign-up.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className={neutralCard}>
              <div className="text-xs uppercase tracking-wide text-neutral-500">Age category</div>
              <div className="mt-2 text-base font-medium">{ageCategoryLabel}</div>
            </div>
            <div className={neutralCard}>
              <div className="text-xs uppercase tracking-wide text-neutral-500">Subscription</div>
              <div className="mt-2 text-base font-medium capitalize">{status}</div>
            </div>
            <div className={strikesCardClass}>
              <div className="text-xs uppercase tracking-wide text-neutral-500">Conduct strikes</div>
              <div className="mt-2 text-base font-semibold">{strikes}</div>
              <p className="mt-1 text-xs opacity-80">{strikes > 0 ? "Resolve with good behavior." : "Clean record."}</p>
            </div>
            <div className={messagingCardClass}>
              <div className="text-xs uppercase tracking-wide text-neutral-500">Messaging status</div>
              <div className="mt-2 text-base font-semibold">{messagingLabel}</div>
            </div>
          </div>

          {effectiveAgeCategory === "youth_13_17" && parentProfile && (
            <div className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.08)] px-4 py-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Parent / Guardian Account</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-sm text-neutral-200">
                  {parentProfile.pen_name || (parentProfile.username ? `@${parentProfile.username}` : "Parent account")}
                  {parentProfile.username && parentProfile.pen_name && (
                    <span className="ml-2 text-xs text-neutral-500">@{parentProfile.username}</span>
                  )}
                </p>
                {parentProfile.username && (
                  <Link
                    href={`/u/${parentProfile.username}`}
                    className="shrink-0 text-xs text-neutral-400 hover:text-neutral-200 underline underline-offset-2 transition"
                  >
                    View profile
                  </Link>
                )}
              </div>
              <p className="mt-2 text-xs text-neutral-500">This account manages your subscription and Bloom Coins. It cannot be changed.</p>
            </div>
          )}

          {blacklisted || hasSuspension ? (
            <div className="rounded-xl border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] p-4">
              <p className="text-sm text-white">
                Consequence active: {blacklisted ? "blacklisted" : "3-day suspension"}.
              </p>
              {appealRequested ? (
                <p className="mt-2 text-xs text-neutral-300">Appeal already requested.</p>
              ) : (
                <form action={requestAppeal} className="mt-3">
                  <button className="inline-flex h-10 items-center justify-center rounded-lg border border-[rgba(120,120,120,0.8)] bg-[rgba(120,120,120,0.2)] px-4 text-sm text-white hover:bg-[rgba(120,120,120,0.3)]">
                    Request Appeal
                  </button>
                </form>
              )}
            </div>
          ) : null}

          <button className="inline-flex h-12 items-center justify-center rounded-lg bg-neutral-100 px-6 text-sm font-medium text-neutral-950 transition hover:bg-neutral-200">
            Save account
          </button>
        </form>
        ) : null}

        <BlockedUsersPanel />

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/settings/profile"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-100 px-4 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
          >
            Edit Public Profile
          </Link>
          <Link
            href="/wallet"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.14)] px-4 text-sm text-white hover:bg-[rgba(120,120,120,0.24)]"
          >
            Open Wallet
          </Link>
          {isOwner ? (
            <Link
              href="/moderation"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.14)] px-4 text-sm text-white hover:bg-[rgba(120,120,120,0.24)]"
            >
              Moderation Inbox
            </Link>
          ) : null}
        </div>

        {/* Appearance */}
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-neutral-100">Appearance</h2>
          <p className="mt-1 text-sm text-neutral-400">Choose between Night Shift (dark) and Day Shift (light) color schemes.</p>
          <div className="mt-4 flex items-center gap-4 rounded-xl border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.07)] px-5 py-4">
            <ThemeToggle />
            <span className="text-sm text-neutral-200">Toggle color scheme</span>
          </div>
        </div>

        <AccountDangerZone
          isDeactivated={isDeactivated}
          isYouth={effectiveAgeCategory === "youth_13_17"}
          linkedYouthCount={linkedYouthCount}
        />
      </div>
    </main>
  );
}
