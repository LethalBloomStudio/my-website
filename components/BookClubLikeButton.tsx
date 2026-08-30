"use client";

import { useState } from "react";

type TargetType = "response" | "reply" | "comment";

function Heart({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#fb7185" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

// Pure reaction -- no reward for the liker, so this is a simple optimistic
// toggle with no server round-trip blocking the UI. Counts toward the
// host's own reward gate happen server-side on insert; nothing about that
// is visible here.
export default function BookClubLikeButton({
  cycleId,
  targetType,
  targetId,
  initialLiked,
  initialCount,
  disabled,
}: {
  cycleId: string;
  targetType: TargetType;
  targetId: string;
  initialLiked: boolean;
  initialCount: number;
  disabled?: boolean;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  // Your own post -- shown as a plain count so received likes stay
  // visible, just not clickable (enforced server-side too, this is only
  // the friendly UI half).
  if (disabled) {
    return (
      <span
        title="You can't like your own post"
        className="flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium bookclub-chip opacity-60 cursor-default"
      >
        <Heart filled={false} />
        {count > 0 && <span>{count}</span>}
      </span>
    );
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((c) => c + (nextLiked ? 1 : -1));

    const res = await fetch("/api/book-club/toggle-like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cycle_id: cycleId, target_type: targetType, target_id: targetId }),
    });
    if (!res.ok) {
      // Revert on failure.
      setLiked(!nextLiked);
      setCount((c) => c + (nextLiked ? -1 : 1));
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-60 bookclub-chip ${liked ? "bookclub-chip-liked" : ""}`}
    >
      <Heart filled={liked} />
      {count > 0 && <span>{count}</span>}
    </button>
  );
}
