"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type BookOption = { id: string; book_title: string; book_author: string };

export default function BookClubTieBreakPanel({
  cycleId,
  tiedOptions,
}: {
  cycleId: string;
  tiedOptions: BookOption[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(bookOptionId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/book-club/resolve-tie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycle_id: cycleId, book_option_id: bookOptionId }),
      });
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
    <div className="space-y-3 rounded-xl border border-amber-700/50 bg-amber-950/20 p-4">
      <p className="text-sm text-amber-300">
        The vote is tied. As host, pick the winner (or wait, and one will be chosen at random if you
        don&apos;t decide in time).
      </p>
      <div className="space-y-2">
        {tiedOptions.map((option) => (
          <div key={option.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
            <div>
              <p className="text-sm font-medium text-neutral-100">{option.book_title}</p>
              <p className="text-xs text-neutral-400">{option.book_author}</p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => handlePick(option.id)}
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:opacity-60"
            >
              Choose
            </button>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
