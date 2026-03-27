"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";

export default function ForgotPasswordPage() {
  const supabase = supabaseBrowser();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (loading) return;
    setMsg(null);
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setLoading(false);
      setMsg("Enter your email.");
      return;
    }

    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });

    setLoading(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg("Password reset link sent. Check your email.");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.18),transparent_50%),#0a0814] text-neutral-100">
      <div className="mx-auto max-w-xl px-6 py-20">
        <section className="rounded-2xl border border-[rgba(120,120,120,0.5)] bg-[rgba(20,20,20,0.92)] p-6 shadow-xl shadow-[rgba(120,120,120,0.18)]">
          <h1 className="text-2xl font-semibold tracking-tight">Reset Password</h1>
          <p className="mt-2 text-sm text-neutral-300">Enter your account email to receive a reset link.</p>

          <div className="mt-6 space-y-3">
            <input
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <button
              onClick={submit}
              disabled={loading}
              className="h-11 w-full rounded-lg border border-[rgba(120,120,120,0.9)] bg-[#787878] font-medium text-white hover:bg-[#606060] disabled:opacity-70"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </div>

          {msg ? (
            <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/70 p-3 text-sm text-neutral-200">{msg}</p>
          ) : null}

          <p className="mt-4 text-xs text-neutral-400">
            <Link href="/sign-in" className="text-[rgba(210,210,210,1)] hover:underline">
              Back to sign in
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
