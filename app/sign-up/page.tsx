"use client";

export const dynamic = "force-dynamic";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { resolvePostAuthPath } from "@/lib/postAuthRedirect";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export default function SignUpPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [penName, setPenName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const usernameTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dob, setDob] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function handleUsernameChange(val: string) {
    const lower = val.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(lower);
    setUsernameStatus("idle");
    if (usernameTimeout.current) clearTimeout(usernameTimeout.current);
    if (!lower) return;
    if (!USERNAME_RE.test(lower)) { setUsernameStatus("invalid"); return; }
    setUsernameStatus("checking");
    usernameTimeout.current = setTimeout(async () => {
      const { data } = await supabase.from("public_profiles").select("user_id").eq("username", lower).maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 500);
  }

  function calculateAge(dobValue: string) {
    const birth = new Date(`${dobValue}T00:00:00`);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const beforeBirthday =
      now.getMonth() < birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
    if (beforeBirthday) age -= 1;
    return age;
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setMsg(null);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();
    const trimmedPenName = penName.trim();
    const trimmedUsername = username.trim().toLowerCase();
    if (!trimmedEmail) return setMsg("Enter your email.");
    if (!dob) return setMsg("Enter your date of birth.");
    if (!trimmedName) return setMsg("Enter your name.");
    if (password.length < 6) return setMsg("Password must be at least 6 characters.");
    if (trimmedUsername && !USERNAME_RE.test(trimmedUsername)) return setMsg("Username must be 3 to 20 characters: lowercase letters, numbers, and underscores only.");
    if (usernameStatus === "taken") return setMsg("That username is already taken. Please choose another.");
    if (usernameStatus === "checking") return setMsg("Still checking username availability. Please wait a moment.");

    const age = calculateAge(dob);
    if (Number.isNaN(age) || age < 13) return setMsg("You must be 13 or older to sign up.");
    if (age < 18 && !parentEmail.trim()) {
      return setMsg("Parent/guardian email is required for youth profiles.");
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          full_name: trimmedName,
          dob,
          parental_consent: age >= 18,
          age_category: age < 18 ? "youth_13_17" : "adult_18_plus",
        },
      },
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    if (data.user && data.session) {
      await supabase.from("accounts").upsert({
        user_id: data.user.id,
        full_name: trimmedName,
        email: trimmedEmail,
        dob,
        age_category: age < 18 ? "youth_13_17" : "adult_18_plus",
        parental_consent: age >= 18,
        parent_email: age < 18 ? parentEmail.trim().toLowerCase() : null,
        updated_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      });

      if (trimmedUsername || trimmedPenName) {
        await supabase.from("public_profiles").upsert({
          user_id: data.user.id,
          ...(trimmedUsername ? { username: trimmedUsername } : {}),
          ...(trimmedPenName ? { pen_name: trimmedPenName } : {}),
        });
      }

      // Auto-friend with all admin profiles
      await fetch("/api/admin/seed-friendships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: data.user.id }),
      });
    }

    if (age < 18 && data.user) {
      const consentRes = await fetch("/api/parent-consent/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          child_user_id: data.user.id,
          parent_email: parentEmail.trim().toLowerCase(),
          child_name: trimmedName,
        }),
      });
      if (!consentRes.ok) {
        const body = (await consentRes.json()) as { error?: string };
        setMsg(body.error ?? "Failed to send parent authorization email.");
        return;
      }
      await supabase.auth.signOut();
      setMsg("Parent authorization email sent. Your parent/guardian must approve before you can sign in.");
      return;
    }

    if (!data.session) {
      setMsg("Account created. Check your email to confirm, then sign in.");
      return;
    }

    const destination = await resolvePostAuthPath(supabase, data.user!.id);
    router.replace(destination);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.18),transparent_50%),#0a0814] text-neutral-100">
      <div className="mx-auto max-w-2xl px-6 py-14">
        <section className="rounded-2xl border border-[rgba(120,120,120,0.5)] bg-[rgba(20,20,20,0.92)] p-6 shadow-xl shadow-[rgba(120,120,120,0.18)]">
          <h1 className="text-3xl font-semibold tracking-tight">Join Now</h1>

          <p className="mt-2 text-sm text-neutral-300">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-[rgba(210,210,210,1)] hover:underline">
              Sign in
            </Link>
          </p>

          <form onSubmit={handleSignUp} className="mt-6 space-y-3">
            <label className="block space-y-1">
              <span className="text-sm text-neutral-300">Name <span className="text-neutral-500 text-xs">(private, not shown publicly)</span></span>
              <input
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                type="text"
                placeholder="Your real name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-neutral-300">Display name / Pen name <span className="text-neutral-500 text-xs">(optional, shown publicly)</span></span>
              <input
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                type="text"
                placeholder="e.g. J. Doe or your pen name"
                value={penName}
                onChange={(e) => setPenName(e.target.value)}
                autoComplete="off"
              />
              <span className="text-xs text-neutral-500">This is the name others will see on your profile. If left blank, your @username will be used.</span>
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-neutral-300">Username <span className="text-neutral-500 text-xs">(optional, your public @handle)</span></span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500 select-none">@</span>
                <input
                  className={`w-full rounded-lg border px-3 py-2 pl-7 bg-neutral-900 ${
                    usernameStatus === "available" ? "border-emerald-700" :
                    usernameStatus === "taken" || usernameStatus === "invalid" ? "border-red-700" :
                    "border-neutral-800"
                  }`}
                  type="text"
                  placeholder="yourhandle"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  autoComplete="off"
                  maxLength={20}
                />
              </div>
              {usernameStatus === "checking" && <span className="text-xs text-neutral-500">Checking availability…</span>}
              {usernameStatus === "available" && <span className="text-xs text-emerald-400">@{username} is available</span>}
              {usernameStatus === "taken" && <span className="text-xs text-red-400">@{username} is already taken</span>}
              {usernameStatus === "invalid" && <span className="text-xs text-red-400">3 to 20 characters: lowercase letters, numbers, underscores only</span>}
              {usernameStatus === "idle" && <span className="text-xs text-neutral-500">3 to 20 characters: letters, numbers, underscores. Can be set later.</span>}
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-neutral-300">Email</span>
              <input
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-neutral-300">Date of birth (private)</span>
              <input
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                required
              />
            </label>

            {dob && calculateAge(dob) < 18 ? (
              <label className="block space-y-1">
                <span className="text-sm text-neutral-300">Parent/guardian email</span>
                <input
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                  type="email"
                  placeholder="parent@example.com"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <span className="text-xs text-neutral-500">
                  We will send an authorization link to this email. Youth accounts stay locked until approved.
                </span>
              </label>
            ) : null}

            <label className="block space-y-1">
              <span className="text-sm text-neutral-300">Password</span>
              <div className="flex gap-2">
                <input
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="h-[42px] shrink-0 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 text-xs text-neutral-200 hover:bg-neutral-800"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-lg border border-[rgba(120,120,120,0.9)] bg-[#787878] font-medium text-white hover:bg-[#606060] disabled:opacity-60"
            >
              {loading ? "Creating..." : "Create account"}
            </button>
          </form>

          {msg ? (
            <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/70 p-3 text-sm text-neutral-200">{msg}</p>
          ) : null}


        </section>
      </div>
    </main>
  );
}
