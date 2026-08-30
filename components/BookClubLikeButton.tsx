"use client";

import { useState } from "react";

type TargetType = "response" | "reply" | "comment";

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
}: {
  cycleId: string;
  targetType: TargetType;
  targetId: string;
  initialLiked: boolean;
  initialCount: number;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

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
      className={`inline-flex items-center gap-1 text-[11px] transition disabled:opacity-60 ${liked ? "text-rose-400" : "text-neutral-500 hover:text-neutral-300"}`}
    >
      <span>{liked ? "♥" : "♡"}</span>
      {count > 0 && <span>{count}</span>}
    </button>
  );
}
