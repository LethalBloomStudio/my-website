"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/Supabase/browser";

type Author = { user_id: string; username: string | null; pen_name: string | null; avatar_url: string | null };
type Comment = {
  id: string;
  author_id: string;
  parent_comment_id: string | null;
  week_number: number;
  body: string;
  created_at: string;
  updated_at: string;
  author: Author | null;
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

// Same 5s buffer as BloomCircleComments' wasEdited() -- created_at and
// updated_at both default to the same now() on insert, so a small buffer
// avoids flagging normal insert-time clock skew as an edit.
function wasEdited(comment: Comment) {
  return new Date(comment.updated_at).getTime() - new Date(comment.created_at).getTime() > 5000;
}

function Avatar({ url, name, size = 24 }: { url: string | null; name: string; size?: number }) {
  return url ? (
    <Image src={url} alt={name} width={size} height={size}
      className="rounded-full object-cover shrink-0 border border-[rgba(120,120,120,0.3)]"
      style={{ width: size, height: size }} />
  ) : (
    <span className="flex items-center justify-center rounded-full bg-[rgba(120,120,120,0.15)] text-neutral-400 shrink-0 border border-[rgba(120,120,120,0.2)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function CommentRow({
  comment, isOwn, onReply, isReplying, onSaveEdit, canReply,
}: {
  comment: Comment;
  isOwn: boolean;
  onReply: () => void;
  isReplying: boolean;
  onSaveEdit: (newBody: string) => Promise<void>;
  canReply: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const name = comment.author?.pen_name || comment.author?.username || "Member";
  const username = comment.author?.username;

  async function handleSave() {
    if (!draft.trim()) return;
    setSaving(true);
    await onSaveEdit(draft.trim());
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="flex items-start gap-2">
      {username ? (
        <Link href={`/u/${username}`} className="shrink-0 mt-0.5"><Avatar url={comment.author?.avatar_url ?? null} name={name} /></Link>
      ) : (
        <div className="mt-0.5"><Avatar url={comment.author?.avatar_url ?? null} name={name} /></div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          {username ? (
            <Link href={`/u/${username}`} className="text-xs font-semibold text-neutral-200 hover:text-white transition">{name}</Link>
          ) : (
            <span className="text-xs font-semibold text-neutral-200">{name}</span>
          )}
          <span className="text-[10px] text-neutral-400">{timeAgo(comment.created_at)}{wasEdited(comment) ? " · (edited)" : ""}</span>
        </div>

        {editing ? (
          <div className="mt-1 space-y-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              autoFocus
              className="w-full resize-none rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.55)] focus:outline-none"
            />
            <div className="flex gap-1.5">
              <button onClick={() => void handleSave()} disabled={saving || !draft.trim()}
                className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-2.5 py-0.5 text-[11px] text-white hover:bg-[rgba(120,120,120,0.22)] disabled:opacity-40 transition">
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditing(false)} disabled={saving}
                className="rounded-lg border border-[rgba(120,120,120,0.25)] bg-transparent px-2.5 py-0.5 text-[11px] text-neutral-400 hover:text-neutral-200 transition">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-xs text-neutral-300 leading-relaxed break-words whitespace-pre-wrap">{comment.body}</p>
        )}

        {!editing && (
          <div className="mt-1.5 flex items-center gap-1.5">
            {canReply && (
              <button onClick={onReply}
                className={`rounded-lg border px-2 py-0.5 text-[11px] font-medium transition ${isReplying
                  ? "border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.15)] text-neutral-200"
                  : "border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.06)] text-neutral-300 hover:border-[rgba(120,120,120,0.45)] hover:text-white"}`}>
                Reply
              </button>
            )}
            {isOwn && (
              <button onClick={() => { setDraft(comment.body); setEditing(true); }}
                className="rounded-lg border border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.06)] px-2 py-0.5 text-[11px] text-neutral-400 hover:border-[rgba(120,120,120,0.45)] hover:text-white transition">
                Edit
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReplyInput({ replyToName, value, onChange, onSubmit, onCancel, submitting }: {
  replyToName: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  return (
    <div className="ml-8 space-y-1.5">
      <p className="text-[11px] text-neutral-500">↩ Replying to <span className="text-neutral-300">{replyToName}</span></p>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} autoFocus rows={2}
        placeholder={`Reply to ${replyToName}…`}
        className="w-full resize-none rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-xs text-neutral-200 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.55)] focus:outline-none" />
      <div className="flex gap-2">
        <button onClick={onSubmit} disabled={!value.trim() || submitting}
          className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-[rgba(120,120,120,0.22)] disabled:opacity-40 transition">
          {submitting ? "Posting…" : "Reply"}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.06)] px-3 py-1 text-xs text-neutral-500 hover:text-neutral-300 transition">Cancel</button>
      </div>
    </div>
  );
}

export default function BookClubComments({ cycleId, weekNumber, currentUserId, canPost }: { cycleId: string; weekNumber: number; currentUserId: string | null; canPost: boolean }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; authorName: string } | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase
        .from("book_club_comments")
        .select("id, author_id, parent_comment_id, week_number, body, created_at, updated_at")
        .eq("cycle_id", cycleId)
        .eq("week_number", weekNumber)
        .order("created_at", { ascending: true });
      const list = (rows ?? []) as Omit<Comment, "author">[];
      const authorIds = [...new Set(list.map((c) => c.author_id))];
      const { data: profiles } = authorIds.length > 0
        ? await supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").in("user_id", authorIds)
        : { data: [] };
      const profileMap = new Map(((profiles ?? []) as Author[]).map((p) => [p.user_id, p]));
      if (cancelled) return;
      setComments(list.map((c) => ({ ...c, author: profileMap.get(c.author_id) ?? null })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase, cycleId, weekNumber]);

  async function post(body: string, parentCommentId: string | null) {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/book-club/submit-comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cycle_id: cycleId, body, parent_comment_id: parentCommentId, general: weekNumber === 0 }),
    });
    const data = (await res.json()) as { ok?: boolean; comment?: Omit<Comment, "author">; error?: string };

    if (!res.ok || !data.ok || !data.comment) {
      setError(data.error ?? "Failed to post comment.");
      setSubmitting(false);
      return;
    }

    let author: Author | null = null;
    if (currentUserId) {
      const { data: prof } = await supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").eq("user_id", currentUserId).maybeSingle();
      author = prof as Author | null;
    }
    setComments((prev) => [...prev, { ...data.comment!, author }]);
    setSubmitting(false);
    setDraft("");
    setReplyDraft("");
    setReplyingTo(null);
  }

  async function saveEdit(commentId: string, newBody: string) {
    const res = await fetch("/api/book-club/edit-comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment_id: commentId, body: newBody }),
    });
    const data = (await res.json()) as { ok?: boolean; comment?: { id: string; body: string; updated_at: string }; error?: string };
    if (!res.ok || !data.ok || !data.comment) return;
    setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, body: data.comment!.body, updated_at: data.comment!.updated_at } : c));
  }

  const topLevel = comments.filter((c) => !c.parent_comment_id);
  const repliesByParent: Record<string, Comment[]> = {};
  for (const c of comments) {
    if (c.parent_comment_id) {
      (repliesByParent[c.parent_comment_id] ??= []).push(c);
    }
  }

  if (loading) return <p className="text-xs text-neutral-600">Loading comments…</p>;

  return (
    <div className="space-y-4">
      {topLevel.length === 0 && <p className="text-xs text-neutral-600">No comments yet. Be the first!</p>}

      {topLevel.map((comment) => {
        const replies = repliesByParent[comment.id] ?? [];
        const authorName = comment.author?.pen_name || comment.author?.username || "Member";
        const isReplyingHere = replyingTo?.commentId === comment.id || replies.some((r) => replyingTo?.commentId === r.id);
        return (
          <div key={comment.id} className="space-y-2">
            <CommentRow comment={comment} isOwn={currentUserId === comment.author_id}
              onReply={() => setReplyingTo(replyingTo?.commentId === comment.id ? null : { commentId: comment.id, authorName })}
              isReplying={replyingTo?.commentId === comment.id}
              onSaveEdit={(body) => saveEdit(comment.id, body)}
              canReply={canPost} />

            {replies.length > 0 && (
              <div className="ml-8 pl-3 border-l border-[rgba(120,120,120,0.15)] space-y-2">
                {replies.map((reply) => {
                  const replyAuthorName = reply.author?.pen_name || reply.author?.username || "Member";
                  return (
                    <CommentRow key={reply.id} comment={reply} isOwn={currentUserId === reply.author_id}
                      onReply={() => setReplyingTo(replyingTo?.commentId === reply.id ? null : { commentId: reply.id, authorName: replyAuthorName })}
                      isReplying={replyingTo?.commentId === reply.id}
                      onSaveEdit={(body) => saveEdit(reply.id, body)}
                      canReply={canPost} />
                  );
                })}
              </div>
            )}

            {canPost && isReplyingHere && replyingTo && (
              <ReplyInput
                replyToName={replyingTo.authorName}
                value={replyDraft}
                onChange={setReplyDraft}
                onSubmit={() => void post(replyDraft, replyingTo.commentId)}
                onCancel={() => { setReplyingTo(null); setReplyDraft(""); }}
                submitting={submitting}
              />
            )}
          </div>
        );
      })}

      {error && <p className="rounded-lg border border-red-500/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">{error}</p>}

      {canPost && !replyingTo && (
        <div className="pt-1 border-t border-[rgba(120,120,120,0.1)]">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a comment…" rows={2}
            className="w-full resize-none rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-xs text-neutral-200 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.55)] focus:outline-none" />
          <div className="mt-1.5 flex justify-end">
            <button onClick={() => void post(draft, null)} disabled={!draft.trim() || submitting}
              className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-[rgba(120,120,120,0.22)] disabled:opacity-40 transition">
              {submitting ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
