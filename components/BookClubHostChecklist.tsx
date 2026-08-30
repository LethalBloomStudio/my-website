"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";

const CYCLE_LENGTH_WEEKS = 4;

type Progress = {
  replyCount: number;
  likeCount: number;
  groupPostCount: number;
  questionCount: number;
  repliesNeeded: number;
  likesNeeded: number;
  groupPostsNeeded: number;
  questionsNeeded: number;
  alreadyReleased: boolean;
};

function ChecklistItem({ done, label, sub }: { done: boolean; label: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold bookclub-chip ${done ? "bookclub-chip-active" : ""}`}>
        {done && <span className="text-emerald-400">✓</span>}
      </span>
      <span className={done ? "text-neutral-300" : "text-neutral-500"}>{label}</span>
      {sub && <span className="ml-auto text-[10px] text-neutral-600">{sub}</span>}
    </div>
  );
}

// Host-only checklist of everything that has to happen before the flat
// 250-coin month-end reward pays out (released via book_club_submit_rating
// like everyone else's coins). Every item is a live count against a
// threshold, not a stored flag, so it un-checks itself automatically if a
// like/reply/question is later removed -- same "counts, not flags" shape
// as the rest of Book Club's reward mechanics. Subscribes to realtime
// changes on the four source tables so the checklist updates immediately
// as the host acts, without needing a page refresh.
export default function BookClubHostChecklist({
  cycleId,
  currentUserId,
  initial,
  initialQuestionWeeks,
}: {
  cycleId: string;
  currentUserId: string;
  initial: Progress;
  initialQuestionWeeks: number[];
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [progress, setProgress] = useState(initial);
  const [questionWeeks, setQuestionWeeks] = useState(new Set(initialQuestionWeeks));

  useEffect(() => {
    async function refresh() {
      const [{ data: rows }, { data: qRows }] = await Promise.all([
        supabase.rpc("book_club_host_reward_progress", { p_cycle_id: cycleId }),
        supabase
          .from("book_club_questionnaire_questions")
          .select("week_number")
          .eq("cycle_id", cycleId)
          .gte("week_number", 1)
          .lte("week_number", CYCLE_LENGTH_WEEKS),
      ]);
      const row = (rows as {
        reply_count: number; like_count: number; group_post_count: number; question_count: number;
        replies_needed: number; likes_needed: number; group_posts_needed: number; questions_needed: number;
        already_released: boolean;
      }[] | null)?.[0];
      if (row) {
        setProgress({
          replyCount: Number(row.reply_count), likeCount: Number(row.like_count),
          groupPostCount: Number(row.group_post_count), questionCount: Number(row.question_count),
          repliesNeeded: row.replies_needed, likesNeeded: row.likes_needed,
          groupPostsNeeded: row.group_posts_needed, questionsNeeded: row.questions_needed,
          alreadyReleased: row.already_released,
        });
      }
      setQuestionWeeks(new Set(((qRows ?? []) as { week_number: number }[]).map((q) => q.week_number)));
    }

    const channel = supabase
      .channel(`book-club-host-checklist-${cycleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "book_club_response_replies", filter: `cycle_id=eq.${cycleId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "book_club_likes", filter: `cycle_id=eq.${cycleId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "book_club_comments", filter: `cycle_id=eq.${cycleId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "book_club_questionnaire_questions", filter: `cycle_id=eq.${cycleId}` }, () => void refresh())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [supabase, cycleId, currentUserId]);

  if (progress.alreadyReleased) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Host reward</p>
        <p className="mt-1 text-sm text-emerald-400">Released.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">
        <span className="font-bold">Host reward:</span> 250 Bloom Coins at month end
      </p>
      <p className="text-[11px] text-neutral-600">Check every box by the time the month closes, released when you rate the book.</p>
      <div className="space-y-1.5 pt-1">
        {Array.from({ length: CYCLE_LENGTH_WEEKS }, (_, i) => i + 1).map((week) => (
          <ChecklistItem key={week} done={questionWeeks.has(week)} label={`Week ${week} question set`} />
        ))}
        <ChecklistItem
          done={progress.replyCount >= progress.repliesNeeded}
          label="Replies to members' answers"
          sub={`${Math.min(progress.replyCount, progress.repliesNeeded)}/${progress.repliesNeeded}`}
        />
        <ChecklistItem
          done={progress.likeCount >= progress.likesNeeded}
          label="Likes given"
          sub={`${Math.min(progress.likeCount, progress.likesNeeded)}/${progress.likesNeeded}`}
        />
        <ChecklistItem
          done={progress.groupPostCount >= progress.groupPostsNeeded}
          label="Group Thoughts posts"
          sub={`${Math.min(progress.groupPostCount, progress.groupPostsNeeded)}/${progress.groupPostsNeeded}`}
        />
      </div>
    </div>
  );
}
