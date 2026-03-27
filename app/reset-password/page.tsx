"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/Supabase/browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState<string | null>("Validating reset link...");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        setReady(false);
        setMsg("Invalid or expired reset link. Request a new one.");
        return;
      }
      setReady(true);
      setMsg(null);
    })();
  }, [supabase]);

  async function submit() {
    if (!ready || loading) return;
    setMsg(null);
    if (password.length < 6) {
      setMsg("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg("Password updated. Redirecting to sign in...");
    setTimeout(() => router.replace("/sign-in"), 900);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.18),transparent_50%),#0a0814] text-neutral-100">
      <div className="mx-auto max-w-xl px-6 py-20">
        <section className="rounded-2xl border border-[rgba(120,120,120,0.5)] bg-[rgba(20,20,20,0.92)] p-6 shadow-xl shadow-[rgba(120,120,120,0.18)]">
          <h1 className="text-2xl font-semibold tracking-tight">Set New Password</h1>
          <p className="mt-2 text-sm text-neutral-300">Create a new password for this account.</p>

          <div className="mt-6 space-y-3">
            <div className="flex gap-2">
              <input
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                type={showPassword ? "text" : "password"}
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                disabled={!ready}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="h-[42px] shrink-0 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 text-xs text-neutral-200 hover:bg-neutral-800"
                disabled={!ready}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <button
              onClick={submit}
              disabled={!ready || loading}
              className="h-11 w-full rounded-lg border border-[rgba(120,120,120,0.9)] bg-[#787878] font-medium text-white hover:bg-[#606060] disabled:opacity-70"
            >
              {loading ? "Updating..." : "Update password"}
            </button>
          </div>

          {msg ? (
            <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/70 p-3 text-sm text-neutral-200">{msg}</p>
          ) : null}

          <p className="mt-4 text-xs text-neutral-400">
            <Link href="/forgot-password" className="text-[rgba(210,210,210,1)] hover:underline">
              Request another reset link
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
