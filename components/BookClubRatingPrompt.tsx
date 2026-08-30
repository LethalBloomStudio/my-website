"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Shown on a closed month's summary card for a participant who hasn't
// rated yet. Submitting releases that participant's own escrowed coins for
// the month (book_club_submit_rating()) -- doesn't affect anyone else's.
export default function BookClubRatingPrompt({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(value: number) {
    setRating(value);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/book-club/submit-rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycle_id: cycleId, rating: value }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setSubmitted(true);
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return <p className="text-xs text-emerald-400">Thanks for rating -- your coins for this month are in your wallet.</p>;
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-neutral-400">Rate this book to collect your coins for the month:</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={loading}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => void handleSubmit(star)}
            className="text-xl leading-none transition disabled:opacity-60"
            aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
          >
            <span className={(hovered || rating) >= star ? "text-amber-400" : "text-neutral-700"}>★</span>
          </button>
        ))}
      </div>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
