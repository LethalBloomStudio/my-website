"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { resolvePostAuthPath } from "@/lib/postAuthRedirect";

export default function SignInPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function friendlyAuthError(message: string) {
    const m = message.toLowerCase();
    if (m.includes("invalid login credentials")) {
      return "Invalid email or password. Use \"Forgot password?\" to reset if needed.";
    }
    if (m.includes("email not confirmed")) {
      return "Your email is not confirmed yet. Check your inbox for the confirmation link.";
    }
    return message;
  }

  async function handleSignIn() {
    if (loading) return;
    setMsg(null);
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setLoading(false);
      setMsg("Enter your email.");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (error) {
      setLoading(false);
      return setMsg(friendlyAuthError(error.message));
    }

    const userId = data.user?.id;
    if (userId) {
      const { data: account } = await supabase
        .from("accounts")
        .select("age_category, parental_consent")
        .eq("user_id", userId)
        .maybeSingle();
      const row = account as { age_category?: string | null; parental_consent?: boolean | null } | null;
      const isYouth = row?.age_category === "youth_13_17";
      const consented = Boolean(row?.parental_consent);
      if (isYouth && !consented) {
        await supabase.auth.signOut();
        setLoading(false);
        return setMsg("Parental authorization is still pending. Ask your parent/guardian to approve the email link.");
      }
    }

    const destination = userId ? await resolvePostAuthPath(supabase, userId) : "/profile";
    setLoading(false);
    router.replace(destination);
  }

  async function handleMagicLink() {
    if (sendingLink) return;
    setMsg(null);
    setSendingLink(true);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setSendingLink(false);
      setMsg("Enter your email.");
      return;
    }

    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    });
    setSendingLink(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg("Sign-in link sent. Check your email and open the link on this device.");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.18),transparent_50%),#0a0814] text-neutral-100">
      <div className="mx-auto grid max-w-5xl gap-6 px-6 py-14 md:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-[rgba(120,120,120,0.5)] bg-[rgba(20,20,20,0.92)] p-6 shadow-xl shadow-[rgba(120,120,120,0.18)]">
          <h1 className="text-3xl font-semibold tracking-tight">Sign In</h1>
          <p className="mt-2 text-sm text-neutral-300">
            Welcome back. Access your writing workspace and public profile.
          </p>

          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => { e.preventDefault(); void handleSignIn(); }}
          >
            <label className="block space-y-1">
              <span className="text-sm text-neutral-300">Email</span>
              <input
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                type="email"
                required
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-neutral-300">Password</span>
              <div className="flex gap-2">
                <input
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="h-[42px] shrink-0 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 text-xs text-neutral-200 hover:bg-neutral-800"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            <div className="text-right">
              <Link href="/forgot-password" className="text-xs text-[rgba(210,210,210,1)] hover:underline">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-lg border border-[rgba(120,120,120,0.9)] bg-[#787878] font-medium text-white hover:bg-[#606060] disabled:opacity-70"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => void handleMagicLink()}
              disabled={sendingLink}
              className="h-11 w-full rounded-lg border border-neutral-700 bg-neutral-900/60 font-medium text-neutral-100 hover:bg-neutral-800 disabled:opacity-70"
            >
              {sendingLink ? "Sending link..." : "Email me a sign-in link"}
            </button>
          </form>

          {msg ? (
            <p role="alert" className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/70 p-3 text-sm text-neutral-200">{msg}</p>
          ) : null}
        </section>

        <aside className="rounded-2xl border border-[rgba(120,120,120,0.5)] bg-[rgba(20,20,20,0.92)] p-6 shadow-xl shadow-[rgba(120,120,120,0.18)]">
          <h2 className="text-xl font-semibold">New here?</h2>
          <p className="mt-2 text-sm text-neutral-300">
            Create an account to publish drafts, request feedback, and manage Bloom Coins.
          </p>
          <Link
            href="/sign-up"
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg border border-[rgba(120,120,120,0.9)] bg-[#787878] px-4 text-sm font-medium text-white hover:bg-[#606060]"
          >
            Sign up
          </Link>
          <p className="mt-4 text-xs text-neutral-500">
            After sign-in or sign-up, you’ll be redirected to your public profile.
          </p>
        </aside>
      </div>
    </main>
  );
}
