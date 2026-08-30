"use client";

import { useState } from "react";
import Link from "next/link";
import BookClubQuestionResponseForm from "@/components/BookClubQuestionResponseForm";
import BookClubResponseReplies from "@/components/BookClubResponseReplies";
import BookClubLikeButton from "@/components/BookClubLikeButton";

type Reply = { id: string; author_name: string; created_at: string; body: string; likeCount: number; likedByMe: boolean };

type OtherResponse = {
  id: string;
  author_name: string;
  created_at: string;
  body: string;
  replies: Reply[];
  likeCount: number;
  likedByMe: boolean;
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// One collapsible section per week: the question, your own answer, and
// everyone else's answers as a chat-style feed -- only actual answers to
// this week's question belong here (general chatter has its own home in
// the cycle-level "Group Thoughts and Discussion" section instead, so
// there's no second freeform thread competing for the same space). A
// closed week (its 7-day window has fully elapsed) stays expandable and
// fully readable, it just greys out and drops the response form.
export default function BookClubWeekSection({
  cycleId,
  isHost,
  weekNumber,
  prompt,
  started,
  closed,
  defaultOpen,
  questionId,
  myResponseId,
  myResponseBody,
  myResponseReplies,
  myResponseLikeCount,
  myResponseLikedByMe,
  otherResponses,
}: {
  cycleId: string;
  isHost: boolean;
  weekNumber: number;
  prompt: string;
  started: boolean;
  closed: boolean;
  defaultOpen: boolean;
  questionId: string | null;
  myResponseId: string | null;
  myResponseBody: string;
  myResponseReplies: Reply[];
  myResponseLikeCount: number;
  myResponseLikedByMe: boolean;
  otherResponses: OtherResponse[];
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Starts in the form if there's nothing saved yet; once answered, defaults
  // to showing it as a card (matching everyone else's answers) instead of
  // leaving the raw textarea open forever -- Edit reopens the form.
  const [editingMyAnswer, setEditingMyAnswer] = useState(!myResponseBody);

  const statusLabel = !started ? "Not started yet" : closed ? "Closed" : "In progress";
  // Replies (and their reward) are only open on the current week -- same
  // "started && !closed" window everything else in this component uses.
  const canReplyToAnswers = started && !closed;

  return (
    <div className={`overflow-hidden rounded-xl border transition ${closed ? "border-neutral-800/60 bg-neutral-900/30" : "border-neutral-800 bg-neutral-900/60"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className={`text-sm font-semibold uppercase tracking-wide ${closed ? "text-neutral-500" : "text-neutral-200"}`}>
          Week {weekNumber}
        </span>
        <span className="flex items-center gap-2">
          <span className={`text-[11px] ${closed ? "text-neutral-600" : started ? "text-emerald-400" : "text-neutral-500"}`}>
            {statusLabel}
          </span>
          {isHost && !started && (
            <Link
              href={`/book-club/cycle/${cycleId}/questions/${weekNumber}`}
              onClick={(e) => e.stopPropagation()}
              className="rounded-md border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:text-white hover:border-neutral-500 transition"
            >
              Edit
            </Link>
          )}
          <span className={`text-xs text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </span>
      </button>

      {open && (
        <div className={`space-y-3 border-t border-neutral-800 px-4 pb-4 pt-3 ${closed ? "opacity-60" : ""}`}>
          {prompt && <p className="text-base font-bold text-neutral-100">{prompt}</p>}

          {!started && (
            <p className="text-xs text-neutral-600">
              {prompt ? "This week hasn't started yet." : "No question set yet."}
            </p>
          )}

          {started && questionId && (
            <>
              {closed ? (
                myResponseBody ? (
                  <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-600">Your answer</p>
                    <p className="whitespace-pre-wrap text-xs text-neutral-400">{myResponseBody}</p>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-600">You didn&apos;t answer this week&apos;s question before it closed.</p>
                )
              ) : myResponseBody && !editingMyAnswer ? (
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-neutral-800 text-[11px] text-neutral-400">
                    Y
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-neutral-200">You</span>
                    <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">{myResponseBody}</p>
                  </div>
                </div>
              ) : (
                <BookClubQuestionResponseForm
                  questionId={questionId}
                  initialBody={myResponseBody}
                  onSaved={() => setEditingMyAnswer(false)}
                  onCancel={myResponseBody ? () => setEditingMyAnswer(false) : undefined}
                />
              )}
              {myResponseId && myResponseBody && !editingMyAnswer && (
                <BookClubResponseReplies
                  cycleId={cycleId}
                  responseId={myResponseId}
                  canReply={false}
                  initialReplies={myResponseReplies}
                  extraButton={
                    <button type="button" onClick={() => setEditingMyAnswer(true)}
                      className="rounded-lg border px-2 py-0.5 text-[11px] font-medium transition bookclub-chip">
                      Edit
                    </button>
                  }
                  likeButton={<BookClubLikeButton cycleId={cycleId} targetType="response" targetId={myResponseId} initialLiked={myResponseLikedByMe} initialCount={myResponseLikeCount} disabled />}
                />
              )}

              {otherResponses.map((r) => (
                <div key={r.id} className="flex items-start gap-2 border-t bookclub-divider pt-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-neutral-800 text-[11px] text-neutral-400">
                    {r.author_name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-neutral-200">{r.author_name}</span>
                      <span className="text-[10px] text-neutral-500">{timeAgo(r.created_at)}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">{r.body}</p>
                    <div className="mt-1.5">
                      <BookClubResponseReplies
                        cycleId={cycleId}
                        responseId={r.id}
                        canReply={canReplyToAnswers}
                        initialReplies={r.replies}
                        likeButton={<BookClubLikeButton cycleId={cycleId} targetType="response" targetId={r.id} initialLiked={r.likedByMe} initialCount={r.likeCount} />}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
