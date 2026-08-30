"use client";

import { useState } from "react";
import BookClubLikeButton from "@/components/BookClubLikeButton";

const REPLY_MIN_WORDS_TO_QUALIFY = 100;

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type Reply = { id: string; author_name: string; created_at: string; body: string; likeCount: number; likedByMe: boolean };

// Replies to one specific response (someone's actual weekly answer), not
// the general per-week comment thread below it -- a reply here is what
// earns the reply-to-answer coin reward once it clears the word minimum.
// Immutable once posted (no edit here, matching the table having no
// update policy), so this only ever appends.
export default function BookClubResponseReplies({
  cycleId,
  responseId,
  canReply,
  initialReplies,
}: {
  cycleId: string;
  responseId: string;
  canReply: boolean;
  initialReplies: Reply[];
}) {
  const [replies, setReplies] = useState(initialReplies);
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQualified, setLastQualified] = useState<boolean | null>(null);

  const words = countWords(draft);

  async function handleSubmit() {
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    setLastQualified(null);

    const res = await fetch("/api/book-club/submit-response-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_id: responseId, body: draft }),
    });
    const data = (await res.json()) as { ok?: boolean; reply?: { id: string; body: string; created_at: string }; qualified?: boolean; error?: string };

    if (!res.ok || !data.ok || !data.reply) {
      setError(data.error ?? "Failed to post reply.");
      setSubmitting(false);
      return;
    }

    setReplies((prev) => [...prev, { id: data.reply!.id, author_name: "You", created_at: data.reply!.created_at, body: data.reply!.body, likeCount: 0, likedByMe: false }]);
    setLastQualified(!!data.qualified);
    setSubmitting(false);
    setDraft("");
    setReplying(false);
  }

  return (
    <div className="mt-1.5 ml-8 space-y-1.5">
      {replies.length > 0 && (
        <div className="space-y-1.5 border-l border-[rgba(120,120,120,0.15)] pl-3">
          {replies.map((r) => (
            <div key={r.id}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-semibold text-neutral-300">{r.author_name}</span>
                <span className="text-[10px] text-neutral-500">{timeAgo(r.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-neutral-400">{r.body}</p>
              <BookClubLikeButton cycleId={cycleId} targetType="reply" targetId={r.id} initialLiked={r.likedByMe} initialCount={r.likeCount} />
            </div>
          ))}
        </div>
      )}

      {canReply && !replying && (
        <button type="button" onClick={() => setReplying(true)} className="text-[11px] text-neutral-500 hover:text-neutral-300 transition">
          Reply
        </button>
      )}

      {canReply && replying && (
        <div className="space-y-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Reply to this answer..."
            className="w-full resize-none rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-[11px] text-neutral-200 placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className={`text-[10px] ${words >= REPLY_MIN_WORDS_TO_QUALIFY ? "text-emerald-400" : "text-neutral-600"}`}>
              {words}/{REPLY_MIN_WORDS_TO_QUALIFY} words to earn coins
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting || !draft.trim()}
                className="rounded-md border border-neutral-700 bg-[rgba(120,120,120,0.12)] px-2 py-0.5 text-[11px] text-neutral-200 hover:bg-[rgba(120,120,120,0.22)] disabled:opacity-40 transition"
              >
                {submitting ? "Posting..." : "Post"}
              </button>
              <button
                type="button"
                onClick={() => { setReplying(false); setDraft(""); }}
                disabled={submitting}
                className="rounded-md border border-neutral-800 px-2 py-0.5 text-[11px] text-neutral-500 hover:text-neutral-300 transition disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {lastQualified === true && <p className="text-[10px] text-emerald-400">Reply posted -- you earned Bloom Coins for this one.</p>}
      {lastQualified === false && <p className="text-[10px] text-neutral-600">Reply posted.</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
