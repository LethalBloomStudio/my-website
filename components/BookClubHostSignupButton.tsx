"use client";

import { useState } from "react";

export default function BookClubHostSignupButton({
  initiallySignedUp,
}: {
  initiallySignedUp: boolean;
}) {
  const [signedUp, setSignedUp] = useState(initiallySignedUp);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignUp() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/book-club/host-signup", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setSignedUp(true);
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (signedUp) {
    return (
      <p className="text-sm font-medium text-emerald-400">
        You&apos;re in the running to host this cycle.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSignUp}
        disabled={loading}
        className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:opacity-60"
      >
        {loading ? "Signing up..." : "Sign up to host"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
