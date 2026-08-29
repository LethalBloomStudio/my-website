"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function BookClubCheckInButton({
  cycleId,
  alreadyCheckedInThisWeek,
}: {
  cycleId: string;
  alreadyCheckedInThisWeek: boolean;
}) {
  const router = useRouter();
  const [checkedIn, setCheckedIn] = useState(alreadyCheckedInThisWeek);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckIn() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/book-club/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycle_id: cycleId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setCheckedIn(true);
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (checkedIn) {
    return <p className="text-xs text-emerald-400">Checked in for this week.</p>;
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleCheckIn}
        disabled={loading}
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-60"
      >
        {loading ? "Checking in..." : "Check in for this week"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
