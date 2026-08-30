"use client";

import { useState } from "react";
import BookClubQuestionResponseForm from "@/components/BookClubQuestionResponseForm";
import BookClubComments from "@/components/BookClubComments";

type OtherResponse = {
  id: string;
  author_name: string;
  created_at: string;
  body: string;
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

// One collapsible section per week: the question, your own answer,
// everyone else's answers as a read-only feed, and -- reusing
// BookClubComments rather than building a separate thread widget -- a
// week-scoped discussion underneath for actual back-and-forth. A closed
// week (its 7-day window has fully elapsed) stays expandable and fully
// readable, it just greys out and drops the response form / comment
// composer -- cycleId, currentUserId, closed determine that.
export default function BookClubWeekSection({
  cycleId,
  currentUserId,
  weekNumber,
  prompt,
  started,
  closed,
  defaultOpen,
  questionId,
  myResponseBody,
  otherResponses,
}: {
  cycleId: string;
  currentUserId: string;
  weekNumber: number;
  prompt: string;
  started: boolean;
  closed: boolean;
  defaultOpen: boolean;
  questionId: string | null;
  myResponseBody: string;
  otherResponses: OtherResponse[];
}) {
  const [open, setOpen] = useState(defaultOpen);

  const statusLabel = !started ? "Not started yet" : closed ? "Closed" : "In progress";

  return (
    <div className={`rounded-xl border transition ${closed ? "border-neutral-800/60 bg-neutral-900/30" : "border-neutral-800 bg-neutral-900/60"}`}>
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
          <span className={`text-xs text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </span>
      </button>

      {open && (
        <div className={`space-y-3 border-t border-neutral-800 px-4 pb-4 pt-3 ${closed ? "opacity-60" : ""}`}>
          <p className="text-sm text-neutral-200">{prompt}</p>

          {!started && <p className="text-xs text-neutral-600">This week hasn&apos;t started yet.</p>}

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
              ) : (
                <BookClubQuestionResponseForm questionId={questionId} initialBody={myResponseBody} />
              )}

              {otherResponses.length > 0 && (
                <div className="space-y-3 border-t border-neutral-800 pt-3">
                  {otherResponses.map((r) => (
                    <div key={r.id} className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-neutral-800 text-[11px] text-neutral-400">
                        {r.author_name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs font-semibold text-neutral-200">{r.author_name}</span>
                          <span className="text-[10px] text-neutral-500">{timeAgo(r.created_at)}</span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">{r.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-neutral-800 pt-3">
                <p className="mb-2 text-[10px] uppercase tracking-wide text-neutral-600">Discussion</p>
                <BookClubComments cycleId={cycleId} weekNumber={weekNumber} currentUserId={currentUserId} canPost={!closed} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
