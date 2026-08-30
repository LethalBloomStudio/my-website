"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import BookClubCoverThumb from "@/components/BookClubCoverThumb";

type BookOption = { id: string; book_title: string; book_author: string; cover_image_url: string | null };

export default function BookClubVoteBallot({
  cycleId,
  options,
  myVoteBookOptionId,
}: {
  cycleId: string;
  options: BookOption[];
  myVoteBookOptionId: string | null;
}) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [tally, setTally] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(myVoteBookOptionId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTally() {
      const { data } = await supabase.rpc("book_club_vote_tally", { p_cycle_id: cycleId });
      if (!cancelled && data) {
        const counts: Record<string, number> = {};
        for (const row of data as { book_option_id: string; vote_count: number }[]) {
          counts[row.book_option_id] = Number(row.vote_count);
        }
        setTally(counts);
      }
    }
    void loadTally();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  async function handleVote(bookOptionId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/book-club/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_option_id: bookOptionId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setSelected(bookOptionId);
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {options.map((option) => (
        <div
          key={option.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <BookClubCoverThumb coverUrl={option.cover_image_url} title={option.book_title} width={40} height={56} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-100">{option.book_title}</p>
              <p className="text-xs text-neutral-400">{option.book_author}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500">{tally[option.id] ?? 0} votes</span>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleVote(option.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
                selected === option.id
                  ? "bg-emerald-500 text-neutral-950"
                  : "bg-neutral-100 text-neutral-900 hover:bg-white"
              }`}
            >
              {selected === option.id ? "Voted" : "Vote"}
            </button>
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
