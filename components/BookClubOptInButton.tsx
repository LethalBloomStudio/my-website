"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function BookClubOptInButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOptIn() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/book-club/opt-in", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleOptIn}
        disabled={loading}
        className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:opacity-60"
      >
        {loading ? "Joining..." : "Opt in to this cycle"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
