"use client";

export const dynamic = "force-dynamic";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/Supabase/browser";

type InviteData = {
  child_name: string;
  child_email: string;
  child_dob: string;
  subscription_tier: string;
  parent_name: string;
};

export default function YouthInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(
        `/api/manage-youth/invite-info?token=${encodeURIComponent(token)}`
      );
      const json = (await res.json()) as { invite?: InviteData; error?: string };
      if (json.invite) setInvite(json.invite);
      else setInviteError(json.error ?? "Invalid or expired invite link.");
      setLoading(false);
    }
    void load();
  }, [token]);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!username.trim()) return setMsg("Please choose a username.");
    if (!/^[a-z0-9_]{3,24}$/.test(username.trim()))
      return setMsg(
        "Username must be 3–24 characters: lowercase letters, numbers, and underscores only."
      );
    if (password.length < 8) return setMsg("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setMsg("Passwords do not match.");
    if (!invite) return;

    setSubmitting(true);
    try {
      // Create the Supabase auth user
      const { data, error } = await supabase.auth.signUp({
        email: invite.child_email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { full_name: invite.child_name },
        },
      });

      if (error) return setMsg(error.message);
      const user = data.user;
      if (!user) return setMsg("Sign-up failed. Please try again.");

      // Create account and profile records
      await supabase.from("accounts").upsert({
        user_id: user.id,
        age_category: "youth_13_17",
        parental_consent: true,
        dob: invite.child_dob,
        updated_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      });

      await supabase.from("public_profiles").upsert({
        user_id: user.id,
        username: username.trim().toLowerCase(),
        pen_name: invite.child_name,
        updated_at: new Date().toISOString(),
      });

      // Link to parent account
      await fetch("/api/manage-youth/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, child_user_id: user.id }),
      });

      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-lg px-6 py-16 text-sm text-neutral-400">
          Verifying invite…
        </div>
      </main>
    );
  }

  if (inviteError) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-lg px-6 py-16">
          <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-8 space-y-3">
            <h1 className="text-xl font-semibold text-red-300">Invite Not Found</h1>
            <p className="text-sm text-neutral-300">{inviteError}</p>
            <p className="text-sm text-neutral-400">
              If you believe this is an error, ask your parent or guardian to resend the invite
              from their account.
            </p>
            <Link
              href="/help"
              className="inline-block text-sm text-white underline underline-offset-2"
            >
              Get help
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-lg px-6 py-16">
          <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-8 space-y-4">
            <h1 className="text-xl font-semibold text-emerald-300">Account Created!</h1>
            <p className="text-sm text-neutral-300">
              Your account has been set up and linked to{" "}
              <strong className="text-neutral-100">{invite?.parent_name}</strong>&apos;s profile.
            </p>
            <p className="text-sm text-neutral-400">
              Check your email at{" "}
              <strong className="text-neutral-200">{invite?.child_email}</strong> to confirm your
              address, then sign in to start writing.
            </p>
            <Link
              href="/sign-in"
              className="inline-block rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.18)] px-5 py-2 text-sm font-medium text-neutral-100 hover:bg-[rgba(120,120,120,0.28)] transition"
            >
              Sign In
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-lg px-6 py-16">
        <div className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.14)] p-8 space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Youth Account Invite
            </p>
            <h1 className="mt-1 text-2xl font-semibold">
              Welcome, {invite!.child_name}!
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              <strong className="text-neutral-200">{invite!.parent_name}</strong> has set up a
              youth account for you on Lethal Bloom Studio - a platform for writers to share
              their work and get real feedback. Finish setting up your account below.
            </p>
          </div>

          {/* Account summary */}
          <div className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3 space-y-1 text-xs text-neutral-400">
            <p>
              <span className="text-neutral-300">Email: </span>
              {invite!.child_email}{" "}
              <span className="text-neutral-600">(set by your parent)</span>
            </p>
            <p>
              <span className="text-neutral-300">Account type: </span>Youth member · linked to{" "}
              {invite!.parent_name}
            </p>
            <p>
              <span className="text-neutral-300">Plan: </span>
              {invite!.subscription_tier === "lethal_standalone"
                ? "Youth Lethal Member · $10/mo (own billing)"
                : invite!.subscription_tier === "unlimited"
                ? "Unlimited (gifted by parent)"
                : "Free Bloom Member"}
            </p>
          </div>

          {msg && (
            <p className="rounded-lg border border-red-700/50 bg-red-950/20 px-3 py-2 text-sm text-red-300">
              {msg}
            </p>
          )}

          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Choose a Username</label>
              <input
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                }
                placeholder="e.g. alex_writes"
                maxLength={24}
                className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-[rgba(120,120,120,0.8)]"
              />
              <p className="mt-1 text-[11px] text-neutral-600">
                3–24 characters. Lowercase letters, numbers, and underscores only.
              </p>
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-[rgba(120,120,120,0.8)]"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-[rgba(120,120,120,0.8)]"
              />
            </div>

            <p className="text-xs text-neutral-500 leading-relaxed">
              By creating an account you agree to the platform guidelines. Youth accounts have
              messaging disabled and can only access YA and MG content. Your parent or guardian
              will be notified when you publish.
            </p>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.18)] py-2.5 text-sm font-medium text-neutral-100 hover:bg-[rgba(120,120,120,0.28)] disabled:opacity-50 transition"
            >
              {submitting ? "Creating account…" : "Create My Account"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
