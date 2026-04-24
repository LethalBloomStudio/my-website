"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";

type Props = {
  email: string;
};

export default function ChangePasswordCard({ email }: Props) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("We couldn't verify your account email. Please refresh and try again.");
      return;
    }
    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Choose a new password that is different from your current password.");
      return;
    }

    setLoading(true);

    const { data: verifyData, error: verifyError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: currentPassword,
    });

    if (verifyError || !verifyData.user) {
      setError("Current password is incorrect.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccess("Password updated successfully.");
    setLoading(false);
  }

  return (
    <section className="mt-8 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.12)] p-6">
      <h2 className="text-lg font-semibold text-neutral-100">Change Password</h2>
      <p className="mt-2 text-sm text-neutral-400">
        Update your password here without using the forgot-password flow.
      </p>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <div className="text-sm text-neutral-400">Current password</div>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3"
            placeholder="Current password"
          />
        </label>

        <label className="block">
          <div className="text-sm text-neutral-400">New password</div>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3"
            placeholder="New password"
          />
        </label>

        <label className="block">
          <div className="text-sm text-neutral-400">Confirm new password</div>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3"
            placeholder="Repeat new password"
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-xl border border-emerald-900 bg-emerald-950/40 p-4 text-sm text-emerald-200">
            {success}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-neutral-100 px-5 text-sm font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Updating password..." : "Update password"}
        </button>
      </form>
    </section>
  );
}
