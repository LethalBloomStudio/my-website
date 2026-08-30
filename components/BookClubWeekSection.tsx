import BookClubQuestionResponseForm from "@/components/BookClubQuestionResponseForm";

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

// One section per week: the question, your own answer, and everyone else's
// answers laid out like a discussion feed rather than a bare list -- this
// is a read-only feed (no nested replies here), the free-form
// back-and-forth belongs to the overall BookClubComments thread below it.
export default function BookClubWeekSection({
  weekNumber,
  prompt,
  started,
  questionId,
  myResponseBody,
  otherResponses,
}: {
  weekNumber: number;
  prompt: string;
  started: boolean;
  questionId: string | null;
  myResponseBody: string;
  otherResponses: OtherResponse[];
}) {
  return (
    <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Week {weekNumber}</p>
        <p className="mt-1 text-sm text-neutral-200">{prompt}</p>
      </div>

      {!started && <p className="text-xs text-neutral-600">This week hasn&apos;t started yet.</p>}

      {started && questionId && (
        <>
          <BookClubQuestionResponseForm questionId={questionId} initialBody={myResponseBody} />

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
        </>
      )}
    </div>
  );
}
