"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import BookClubChecklistItem from "@/components/BookClubChecklistItem";

const CYCLE_LENGTH_WEEKS = 4;
const REPLY_WEEKLY_CAP = 5;
const REPLY_REWARD_COINS = 2;

// Member-facing equivalent of BookClubHostChecklist: which weeks you've
// answered (weekly-checkmark coins, escrowed, released at rating), plus
// the optional reply-to-others reward for the current week (also escrowed
// as of this session -- previously paid out immediately). Answered-weeks
// come from a plain prop (page.tsx already refetches it via router.refresh()
// after every response submit); only the reply count needs its own
// realtime subscription, since replying happens in a sibling component
// that doesn't trigger a full page refresh.
export default function BookClubMemberChecklist({
  cycleId,
  currentUserId,
  currentWeek,
  earnedWeeks,
  initialReplyCount,
  cycleEndsAtLabel,
}: {
  cycleId: string;
  currentUserId: string;
  currentWeek: number | null;
  earnedWeeks: number[];
  initialReplyCount: number;
  cycleEndsAtLabel: string | null;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [replyCount, setReplyCount] = useState(initialReplyCount);

  useEffect(() => {
    if (currentWeek === null) return;

    async function refresh() {
      const { count } = await supabase
        .from("book_club_reply_rewards")
        .select("id", { count: "exact", head: true })
        .eq("cycle_id", cycleId)
        .eq("week_number", currentWeek as number)
        .eq("author_id", currentUserId);
      setReplyCount(count ?? 0);
    }

    const channel = supabase
      .channel(`book-club-member-checklist-${cycleId}-${currentWeek}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "book_club_reply_rewards", filter: `cycle_id=eq.${cycleId}` }, () => void refresh())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [supabase, cycleId, currentUserId, currentWeek]);

  const earned = new Set(earnedWeeks);
  const cappedReplyCount = Math.min(replyCount, REPLY_WEEKLY_CAP);

  return (
    <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Your checklist</p>
      <div className="space-y-1.5 pt-1">
        {Array.from({ length: CYCLE_LENGTH_WEEKS }, (_, i) => i + 1).map((week) => (
          <BookClubChecklistItem key={week} done={earned.has(week)} label={`Week ${week} answered`} />
        ))}
        <BookClubChecklistItem
          done={cappedReplyCount >= REPLY_WEEKLY_CAP}
          label="Replies to other members (optional)"
          sub={`${cappedReplyCount}/${REPLY_WEEKLY_CAP} · ${cappedReplyCount * REPLY_REWARD_COINS}/${REPLY_WEEKLY_CAP * REPLY_REWARD_COINS} coins this week`}
        />
        {cycleEndsAtLabel && (
          <BookClubChecklistItem done={false} label={`Rate book within 7 days of ${cycleEndsAtLabel}`} />
        )}
      </div>
    </div>
  );
}
