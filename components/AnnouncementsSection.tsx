"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import ReportModal from "@/components/ReportModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type AnnouncementType =
  | "update"
  | "manuscript"
  | "beta"
  | "poll"
  | "challenge"
  | "prompt"
  | "qa"
  | "recommendation";

type AuthorInfo = {
  user_id: string;
  username: string | null;
  pen_name: string | null;
  avatar_url: string | null;
};

type AnnComment = {
  id: string;
  announcement_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  reply_to_id: string | null;
  reply_to_author_id: string | null;
  created_at: string;
  like_count: number;
  user_liked: boolean;
  author: AuthorInfo | null;
  reply_to_name: string | null;
};

type Announcement = {
  id: string;
  user_id: string;
  type: AnnouncementType;
  title: string | null;
  content: string | null;
  poll_options: string[] | null;
  coin_prize: number | null;
  ends_at: string | null;
  winner_id: string | null;
  winner_drawn: boolean;
  winner_name: string | null;
  created_at: string;
  like_count: number;
  user_liked: boolean;
  comment_count: number;
  user_vote: number | null;
  poll_votes: Record<number, number>;
};

type Props = {
  profileUserId: string;
  viewerId: string | null;
  isOwner: boolean;
  ownerName?: string | null;
  ownerAvatar?: string | null;
  ownerUsername?: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: {
  type: AnnouncementType;
  label: string;
  emoji: string;
  description: string;
  placeholder: string;
}[] = [
  { type: "update",         label: "General Update",       emoji: "📢", description: "Share a personal update with your followers",              placeholder: "What's on your mind?" },
  { type: "manuscript",     label: "Manuscript Update",    emoji: "📖", description: "Share news about one of your manuscripts",                  placeholder: "Share your manuscript news…" },
  { type: "beta",           label: "Beta Reading",         emoji: "👥", description: "Post about your beta reading projects",                     placeholder: "Tell readers about your beta project…" },
  { type: "poll",           label: "Poll",                 emoji: "📊", description: "Create a poll for your followers to vote on",              placeholder: "What would you like to ask?" },
  { type: "challenge",      label: "Bloom Coin Challenge", emoji: "✿",  description: "Award Bloom Coins from your wallet to a random winner",    placeholder: "Describe the challenge…" },
  { type: "prompt",         label: "Writing Prompt",       emoji: "✍️", description: "Share a writing prompt for your readers",                   placeholder: "Write your prompt here…" },
  { type: "qa",             label: "Q&A Session",          emoji: "❓", description: "Open a Q&A — let your followers ask you anything",         placeholder: "Set the topic or theme…" },
  { type: "recommendation", label: "Recommendation",       emoji: "🌟", description: "Recommend a book or ask for suggestions",                  placeholder: "Tell us about your recommendation…" },
];

const TYPE_COLORS: Record<AnnouncementType, string> = {
  update:         "border-slate-400/60 bg-slate-700/20 text-slate-700",
  manuscript:     "border-emerald-500/60 bg-emerald-950/20 text-emerald-700",
  beta:           "border-blue-500/60 bg-blue-950/20 text-blue-700",
  poll:           "border-sky-500/60 bg-sky-950/20 text-sky-700",
  challenge:      "border-amber-400/60 bg-amber-950/20 text-amber-600",
  prompt:         "border-purple-500/60 bg-purple-950/20 text-purple-700",
  qa:             "border-rose-500/60 bg-rose-950/20 text-rose-700",
  recommendation: "border-orange-500/60 bg-orange-950/20 text-orange-700",
};

const CARD_COLORS: Record<AnnouncementType, string> = {
  update:         "border-slate-500/80 bg-gradient-to-br from-slate-700/30 via-slate-800/15 to-neutral-900/10",
  manuscript:     "border-emerald-600/80 bg-gradient-to-br from-emerald-800/30 via-emerald-900/15 to-neutral-900/10",
  beta:           "border-blue-700/80 bg-gradient-to-br from-blue-800/30 via-blue-900/15 to-neutral-900/10",
  poll:           "border-sky-600/80 bg-gradient-to-br from-sky-800/30 via-sky-900/15 to-neutral-900/10",
  challenge:      "border-amber-400/80 bg-gradient-to-br from-amber-700/30 via-amber-900/15 to-neutral-900/10",
  prompt:         "border-purple-700/80 bg-gradient-to-br from-purple-800/30 via-purple-900/15 to-neutral-900/10",
  qa:             "border-rose-700/80 bg-gradient-to-br from-rose-800/30 via-rose-900/15 to-neutral-900/10",
  recommendation: "border-orange-600/80 bg-gradient-to-br from-orange-800/30 via-orange-900/15 to-neutral-900/10",
};

const PAGE_SIZE = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Avatar({ url, name, size = 28 }: { url: string | null; name: string; size?: number }) {
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

function CatEmoji({ type, emoji, className }: { type: AnnouncementType; emoji: string; className?: string }) {
  if (type === "challenge") return <span style={{ color: "#f59e0b" }} className={className}>{emoji}</span>;
  return <span className={className}>{emoji}</span>;
}

function Heart({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#f87171" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

// ─── Comment row ──────────────────────────────────────────────────────────────

function CommentRow({ comment, currentUserId, onLike, onReply, isReplying }: {
  comment: AnnComment;
  currentUserId: string | null;
  onLike: () => void;
  onReply: () => void;
  isReplying: boolean;
}) {
  const name = comment.author?.pen_name ?? comment.author?.username ?? "Member";
  const username = comment.author?.username;
  return (
    <div className="flex items-start gap-2">
      {username ? (
        <Link href={`/u/${username}`} className="shrink-0 mt-0.5"><Avatar url={comment.author?.avatar_url ?? null} name={name} size={22} /></Link>
      ) : (
        <div className="mt-0.5"><Avatar url={comment.author?.avatar_url ?? null} name={name} size={22} /></div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          {username ? (
            <Link href={`/u/${username}`} className="text-xs font-semibold text-neutral-200 hover:text-white transition">{name}</Link>
          ) : (
            <span className="text-xs font-semibold text-neutral-200">{name}</span>
          )}
          {comment.reply_to_name && (
            <span className="text-[11px] text-neutral-600">↩ {comment.reply_to_name}</span>
          )}
          <span className="text-[10px] text-neutral-600">{timeAgo(comment.created_at)}</span>
        </div>
        <p className="mt-0.5 text-xs text-neutral-300 leading-relaxed break-words">{comment.content}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <button onClick={onLike} disabled={!currentUserId}
            className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium transition ${comment.user_liked
              ? "border-rose-700/40 bg-rose-950/20 text-rose-400 hover:bg-rose-950/30"
              : "border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.06)] text-neutral-500 hover:border-[rgba(120,120,120,0.45)] hover:text-neutral-300 disabled:cursor-default"}`}>
            <Heart filled={comment.user_liked} />
            {comment.like_count > 0 && <span>{comment.like_count}</span>}
          </button>
          {currentUserId && (
            <button onClick={onReply}
              className={`rounded-lg border px-2 py-0.5 text-[11px] font-medium transition ${isReplying
                ? "border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.15)] text-neutral-200"
                : "border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.06)] text-neutral-500 hover:border-[rgba(120,120,120,0.45)] hover:text-neutral-300"}`}>
              Reply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Reply input ──────────────────────────────────────────────────────────────

function ReplyInput({ replyToName, value, onChange, onSubmit, onCancel, submitting }: {
  replyToName: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-neutral-500">↩ Replying to <span className="text-neutral-300">{replyToName}</span></p>
      <textarea value={value} onChange={e => onChange(e.target.value)} autoFocus rows={2}
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function AnnouncementsSection({
  profileUserId,
  viewerId,
  isOwner,
  ownerName,
  ownerAvatar,
  ownerUsername,
}: Props) {
  const supabase = useMemo(() => supabaseBrowser(), []);

  // Posts
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Comments (lazy per post)
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, AnnComment[]>>({});
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<{ annId: string; commentId: string; authorName: string } | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);

  // Post creator
  const [showCreator, setShowCreator] = useState(false);
  const [creatorStep, setCreatorStep] = useState<"category" | "form">("category");
  const [creatorType, setCreatorType] = useState<AnnouncementType | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [formCoinPrize, setFormCoinPrize] = useState(50);
  const [formDuration, setFormDuration] = useState(24);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [userCoins, setUserCoins] = useState<number | null>(null);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Report
  const [reportTarget, setReportTarget] = useState<{ id: string; ownerId: string; label: string } | null>(null);
  const [reported, setReported] = useState<Set<string>>(new Set());

  // Live countdown
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Viewer profile (for display in comments)
  const [viewerProfile, setViewerProfile] = useState<AuthorInfo | null>(null);

  // ── Load posts ──
  async function loadPosts() {
    setLoading(true);

    const { data: rows } = await supabase
      .from("profile_announcements")
      .select("id, user_id, type, title, content, poll_options, coin_prize, ends_at, winner_id, winner_drawn, created_at")
      .eq("user_id", profileUserId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!rows || rows.length === 0) { setAnnouncements([]); setLoading(false); return; }

    const typedRows = rows as {
      id: string; user_id: string; type: string; title: string | null; content: string | null;
      poll_options: string[] | null; coin_prize: number | null; ends_at: string | null;
      winner_id: string | null; winner_drawn: boolean; created_at: string;
    }[];

    const ids = typedRows.map(r => r.id);
    const winnerIds = typedRows.map(r => r.winner_id).filter(Boolean) as string[];

    const [
      { data: likesData },
      { data: commentsData },
      { data: votesData },
      winnerProfilesData,
    ] = await Promise.all([
      supabase.from("profile_announcement_likes").select("announcement_id, user_id").in("announcement_id", ids),
      supabase.from("profile_announcement_comments").select("announcement_id").in("announcement_id", ids),
      supabase.from("profile_announcement_poll_votes").select("announcement_id, user_id, option_index").in("announcement_id", ids),
      winnerIds.length > 0
        ? supabase.from("public_profiles").select("user_id, pen_name, username").in("user_id", winnerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const likes = (likesData as { announcement_id: string; user_id: string }[] | null) ?? [];
    const commentsList = (commentsData as { announcement_id: string }[] | null) ?? [];
    const votes = (votesData as { announcement_id: string; user_id: string; option_index: number }[] | null) ?? [];
    const winnerProfileMap = new Map(
      ((winnerProfilesData.data as { user_id: string; pen_name: string | null; username: string | null }[] | null) ?? [])
        .map(p => [p.user_id, p])
    );

    // Fetch viewer profile if not yet loaded
    if (viewerId && !viewerProfile) {
      const { data: vp } = await supabase
        .from("public_profiles")
        .select("user_id, username, pen_name, avatar_url")
        .eq("user_id", viewerId)
        .maybeSingle();
      if (vp) setViewerProfile(vp as AuthorInfo);
    }

    const commentCountByPost: Record<string, number> = {};
    for (const c of commentsList) commentCountByPost[c.announcement_id] = (commentCountByPost[c.announcement_id] ?? 0) + 1;

    const built: Announcement[] = typedRows.map(r => {
      const postLikes = likes.filter(l => l.announcement_id === r.id);
      const postVotes = votes.filter(v => v.announcement_id === r.id);
      const pollVoteCounts: Record<number, number> = {};
      for (const v of postVotes) pollVoteCounts[v.option_index] = (pollVoteCounts[v.option_index] ?? 0) + 1;
      const winnerProf = r.winner_id ? winnerProfileMap.get(r.winner_id) : null;
      return {
        id: r.id,
        user_id: r.user_id,
        type: (r.type as AnnouncementType) || "update",
        title: r.title,
        content: r.content,
        poll_options: r.poll_options,
        coin_prize: r.coin_prize,
        ends_at: r.ends_at,
        winner_id: r.winner_id,
        winner_drawn: r.winner_drawn,
        winner_name: winnerProf ? (winnerProf.pen_name ?? winnerProf.username ?? null) : null,
        created_at: r.created_at,
        like_count: postLikes.length,
        user_liked: viewerId ? postLikes.some(l => l.user_id === viewerId) : false,
        comment_count: commentCountByPost[r.id] ?? 0,
        user_vote: viewerId ? (postVotes.find(v => v.user_id === viewerId)?.option_index ?? null) : null,
        poll_votes: pollVoteCounts,
      };
    });

    setAnnouncements(built);
    setLoading(false);
  }

  useEffect(() => { void loadPosts(); }, [profileUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load owner's coin balance when opening challenge creator ──
  async function fetchUserCoins() {
    if (!viewerId) return;
    const { data } = await supabase.from("accounts").select("bloom_coins").eq("user_id", viewerId).maybeSingle();
    const row = data as { bloom_coins: number } | null;
    setUserCoins(row?.bloom_coins ?? 0);
  }

  // ── Infinite scroll ──
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisibleCount(n => n + PAGE_SIZE); }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Load comments when post expands ──
  useEffect(() => {
    if (!expandedPostId || comments[expandedPostId]) return;
    setLoadingComments(true);
    (async () => {
      const { data: commentRows } = await supabase
        .from("profile_announcement_comments")
        .select("id, announcement_id, user_id, content, parent_id, reply_to_id, reply_to_author_id, created_at")
        .eq("announcement_id", expandedPostId)
        .order("created_at", { ascending: true });

      if (!commentRows || commentRows.length === 0) {
        setComments(prev => ({ ...prev, [expandedPostId]: [] }));
        setLoadingComments(false);
        return;
      }

      const rows = commentRows as {
        id: string; announcement_id: string; user_id: string; content: string;
        parent_id: string | null; reply_to_id: string | null; reply_to_author_id: string | null; created_at: string;
      }[];
      const authorIds = [...new Set([
        ...rows.map(r => r.user_id),
        ...rows.map(r => r.reply_to_author_id).filter(Boolean) as string[],
      ])];

      const [{ data: likesData }, { data: profileData }] = await Promise.all([
        supabase.from("profile_announcement_comment_likes").select("comment_id, user_id").in("comment_id", rows.map(r => r.id)),
        supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").in("user_id", authorIds),
      ]);

      const likes = (likesData as { comment_id: string; user_id: string }[] | null) ?? [];
      const profileMap = new Map(((profileData as AuthorInfo[] | null) ?? []).map(p => [p.user_id, p]));

      const built: AnnComment[] = rows.map(r => {
        const replyAuthor = r.reply_to_author_id ? profileMap.get(r.reply_to_author_id) : null;
        return {
          ...r,
          like_count: likes.filter(l => l.comment_id === r.id).length,
          user_liked: viewerId ? likes.some(l => l.comment_id === r.id && l.user_id === viewerId) : false,
          author: profileMap.get(r.user_id) ?? null,
          reply_to_name: replyAuthor ? (replyAuthor.pen_name ?? replyAuthor.username) : null,
        };
      });

      setComments(prev => ({ ...prev, [expandedPostId]: built }));
      setLoadingComments(false);
    })();
  }, [expandedPostId, supabase, viewerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ──

  async function toggleLike(id: string) {
    if (!viewerId) return;
    const ann = announcements.find(a => a.id === id);
    if (!ann) return;
    if (ann.user_liked) {
      await supabase.from("profile_announcement_likes").delete().eq("announcement_id", id).eq("user_id", viewerId);
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, user_liked: false, like_count: a.like_count - 1 } : a));
    } else {
      await supabase.from("profile_announcement_likes").insert({ announcement_id: id, user_id: viewerId });
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, user_liked: true, like_count: a.like_count + 1 } : a));
    }
  }

  async function votePoll(annId: string, optionIndex: number) {
    if (!viewerId) return;
    const ann = announcements.find(a => a.id === annId);
    if (!ann || ann.user_vote !== null) return;
    await supabase.from("profile_announcement_poll_votes").insert({ announcement_id: annId, user_id: viewerId, option_index: optionIndex });
    setAnnouncements(prev => prev.map(a => a.id === annId ? {
      ...a, user_vote: optionIndex,
      poll_votes: { ...a.poll_votes, [optionIndex]: (a.poll_votes[optionIndex] ?? 0) + 1 },
    } : a));
  }

  async function toggleCommentLike(annId: string, commentId: string) {
    if (!viewerId) return;
    const c = (comments[annId] ?? []).find(c => c.id === commentId);
    if (!c) return;
    if (c.user_liked) {
      await supabase.from("profile_announcement_comment_likes").delete().eq("comment_id", commentId).eq("user_id", viewerId);
    } else {
      await supabase.from("profile_announcement_comment_likes").insert({ comment_id: commentId, user_id: viewerId });
    }
    setComments(prev => ({
      ...prev,
      [annId]: (prev[annId] ?? []).map(x => x.id === commentId
        ? { ...x, user_liked: !x.user_liked, like_count: x.like_count + (x.user_liked ? -1 : 1) }
        : x),
    }));
  }

  async function submitComment(annId: string) {
    if (!viewerId) return;
    const draftKey = replyingTo ? `reply:${replyingTo.commentId}` : annId;
    const content = (commentDrafts[draftKey] ?? "").trim();
    if (!content) return;
    setSubmittingComment(true);

    let parentId: string | null = null;
    let replyToId: string | null = null;
    let replyToAuthorId: string | null = null;
    let replyToName: string | null = null;

    if (replyingTo) {
      const target = (comments[annId] ?? []).find(c => c.id === replyingTo.commentId);
      parentId = target?.parent_id ?? replyingTo.commentId;
      replyToId = replyingTo.commentId;
      replyToAuthorId = target?.user_id ?? null;
      replyToName = replyingTo.authorName;
    }

    const ann = announcements.find(a => a.id === annId);

    const res = await fetch("/api/profile-announcement/submit-comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        announcement_id: annId,
        content,
        parent_id: parentId,
        reply_to_id: replyToId,
        reply_to_author_id: replyToAuthorId,
        post_owner_id: ann?.user_id ?? profileUserId,
      }),
    });

    const json = await res.json() as { ok?: boolean; comment?: { id: string; announcement_id: string; user_id: string; content: string; parent_id: string | null; reply_to_id: string | null; reply_to_author_id: string | null; created_at: string }; error?: string };

    if (!res.ok || !json.ok) {
      setSubmittingComment(false);
      return;
    }

    const row = json.comment!;
    const newComment: AnnComment = {
      ...row,
      like_count: 0,
      user_liked: false,
      author: viewerProfile,
      reply_to_name: replyToName,
    };

    setComments(prev => ({ ...prev, [annId]: [...(prev[annId] ?? []), newComment] }));
    setAnnouncements(prev => prev.map(a => a.id === annId ? { ...a, comment_count: a.comment_count + 1 } : a));
    setCommentDrafts(prev => { const n = { ...prev }; delete n[draftKey]; return n; });
    setReplyingTo(null);
    setSubmittingComment(false);
  }

  async function drawChallenge(annId: string) {
    const res = await fetch("/api/profile-announcement/draw-challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcement_id: annId }),
    });
    if (res.ok) {
      const data = await res.json() as { winner_id?: string | null; winner_name?: string };
      setAnnouncements(prev => prev.map(a => a.id === annId
        ? { ...a, winner_drawn: true, winner_id: data.winner_id ?? null, winner_name: data.winner_name ?? null }
        : a));
    }
  }

  useEffect(() => {
    const expired = announcements.filter(
      a => a.type === "challenge" && !a.winner_drawn && a.ends_at && new Date(a.ends_at) <= new Date()
    );
    for (const a of expired) void drawChallenge(a.id);
  }, [announcements]);

  function openCreator() {
    setCreatorStep("category"); setCreatorType(null);
    setFormTitle(""); setFormContent(""); setPollOptions(["", ""]);
    setFormCoinPrize(50); setFormDuration(24); setPostError(null);
    setShowCreator(true);
    void fetchUserCoins();
  }

  async function submitPost() {
    if (!viewerId || !creatorType || !formTitle.trim()) return;
    if (creatorType === "poll" && pollOptions.filter(o => o.trim()).length < 2) {
      setPostError("Add at least 2 poll options."); return;
    }
    setSubmittingPost(true); setPostError(null);

    // Challenge posts go through the API (coin deduction)
    if (creatorType === "challenge") {
      const res = await fetch("/api/profile-announcement/create-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: formTitle.trim(), content: formContent.trim() || null, coin_prize: formCoinPrize, duration_hours: formDuration }),
      });
      const json = await res.json() as { ok?: boolean; announcement?: Record<string, unknown>; error?: string };
      if (!res.ok || !json.ok) {
        setPostError(json.error ?? "Failed to create challenge.");
        setSubmittingPost(false); return;
      }
      const row = json.announcement as { id: string; user_id: string; type: string; title: string | null; content: string | null; poll_options: string[] | null; coin_prize: number | null; ends_at: string | null; winner_id: string | null; winner_drawn: boolean; created_at: string };
      const newPost: Announcement = {
        ...row, type: "challenge",
        like_count: 0, user_liked: false, comment_count: 0,
        user_vote: null, poll_votes: {}, winner_name: null,
      };
      setAnnouncements(prev => [newPost, ...prev]);
      setUserCoins(c => c !== null ? c - formCoinPrize : c);
      setShowCreator(false);
      setSubmittingPost(false);
      return;
    }

    // All other types: direct insert
    const payload: Record<string, unknown> = {
      user_id: viewerId,
      type: creatorType,
      title: formTitle.trim(),
      content: formContent.trim() || null,
    };
    if (creatorType === "poll") payload.poll_options = pollOptions.filter(o => o.trim());

    const { data, error } = await supabase
      .from("profile_announcements")
      .insert(payload)
      .select("id, user_id, type, title, content, poll_options, coin_prize, ends_at, winner_id, winner_drawn, created_at")
      .single();

    if (error) { setPostError(error.message); setSubmittingPost(false); return; }

    if (data) {
      const row = data as { id: string; user_id: string; type: string; title: string | null; content: string | null; poll_options: string[] | null; coin_prize: number | null; ends_at: string | null; winner_id: string | null; winner_drawn: boolean; created_at: string };
      const newPost: Announcement = {
        ...row, type: creatorType,
        like_count: 0, user_liked: false, comment_count: 0,
        user_vote: null, poll_votes: {}, winner_name: null,
      };
      setAnnouncements(prev => [newPost, ...prev]);
      setShowCreator(false);

      // Notify friends about the new announcement (fire-and-forget)
      void (async () => {
        const [{ data: sent }, { data: received }] = await Promise.all([
          supabase.from("profile_friend_requests").select("receiver_id").eq("sender_id", viewerId).eq("status", "accepted"),
          supabase.from("profile_friend_requests").select("sender_id").eq("receiver_id", viewerId).eq("status", "accepted"),
        ]);
        const friendIds = [
          ...((sent ?? []) as { receiver_id: string }[]).map(r => r.receiver_id),
          ...((received ?? []) as { sender_id: string }[]).map(r => r.sender_id),
        ].filter(id => id !== viewerId);
        if (friendIds.length === 0) return;
        const posterName = viewerProfile?.pen_name || viewerProfile?.username || "A friend";
        const profileUsername = ownerUsername || viewerProfile?.username;
        if (!profileUsername) return;
        for (let i = 0; i < friendIds.length; i += 500) {
          await supabase.from("system_notifications").insert(
            friendIds.slice(i, i + 500).map(uid => ({
              user_id: uid,
              category: "social",
              title: `${posterName} posted a new announcement`,
              body: row.title || row.content || "New announcement",
              severity: "info",
              metadata: { announcement_id: row.id, profile_username: profileUsername },
            }))
          );
        }
      })();
    }
    setSubmittingPost(false);
  }

  async function confirmDelete() {
    if (!deletingId) return;
    await supabase.from("profile_announcements").delete().eq("id", deletingId);
    setAnnouncements(prev => prev.filter(a => a.id !== deletingId));
    if (expandedPostId === deletingId) setExpandedPostId(null);
    setDeletingId(null);
  }

  async function submitReport(reason: string) {
    if (!viewerId || !reportTarget) return;
    await supabase.from("profile_content_reports").insert({
      reporter_id: viewerId,
      content_type: "announcement",
      content_id: reportTarget.id,
      content_owner_id: reportTarget.ownerId,
      reason,
    });
    setReported(prev => new Set(prev).add(reportTarget.id));
    setReportTarget(null);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const visibleAnnouncements = announcements.slice(0, visibleCount);
  const hasMore = announcements.length > visibleCount;

  return (
    <div className="space-y-4">
      {reportTarget && (
        <ReportModal
          targetName={reportTarget.label}
          onSubmit={(reason) => void submitReport(reason)}
          onCancel={() => setReportTarget(null)}
        />
      )}

      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">Announcements</h2>
        {isOwner && (
          <button onClick={openCreator}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.1)] px-3 text-xs font-medium text-neutral-300 hover:text-white transition">
            + New Post
          </button>
        )}
      </div>

      {/* Posts */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(n => <div key={n} className="h-28 rounded-xl border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.05)] animate-pulse" />)}
        </div>
      ) : announcements.length === 0 ? (
        <div className="rounded-xl border border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.05)] px-6 py-10 text-center">
          <p className="text-sm text-neutral-500">
            {isOwner ? "No announcements yet. Share an update with your readers!" : "No announcements yet."}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {visibleAnnouncements.map(ann => {
              const cat = CATEGORIES.find(c => c.type === ann.type);
              const isExpanded = expandedPostId === ann.id;
              const postComments = comments[ann.id] ?? [];
              const topLevel = postComments.filter(c => !c.parent_id);
              const repliesByParent: Record<string, AnnComment[]> = {};
              for (const c of postComments) {
                if (c.parent_id) {
                  if (!repliesByParent[c.parent_id]) repliesByParent[c.parent_id] = [];
                  repliesByParent[c.parent_id].push(c);
                }
              }
              const totalPollVotes = Object.values(ann.poll_votes).reduce((a, b) => a + b, 0);

              const endsAt = ann.ends_at ? new Date(ann.ends_at).getTime() : null;
              const msLeft = endsAt ? endsAt - now : null;
              const challengeEnded = msLeft !== null && msLeft <= 0;

              function countdownLabel() {
                if (!msLeft || msLeft <= 0) return null;
                const totalSecs = Math.floor(msLeft / 1000);
                const days = Math.floor(totalSecs / 86400);
                const hrs = Math.floor((totalSecs % 86400) / 3600);
                const mins = Math.floor((totalSecs % 3600) / 60);
                const secs = totalSecs % 60;
                if (days > 0) return `${days}d ${hrs}h ${mins}m`;
                if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
                return `${mins}m ${secs}s`;
              }

              if (challengeEnded && ann.type === "challenge" && !ann.winner_drawn) void drawChallenge(ann.id);

              return (
                <div key={ann.id} className={`rounded-xl border overflow-hidden ${CARD_COLORS[ann.type]}`}>

                  {/* Post body */}
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {ownerUsername ? (
                          <Link href={`/u/${ownerUsername}`} className="shrink-0 mt-0.5">
                            <Avatar url={ownerAvatar ?? null} name={ownerName ?? "?"} size={34} />
                          </Link>
                        ) : (
                          <div className="mt-0.5 shrink-0">
                            <Avatar url={ownerAvatar ?? null} name={ownerName ?? "?"} size={34} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_COLORS[ann.type]}`}>
                              {cat && <CatEmoji type={ann.type} emoji={cat.emoji} />} {cat?.label}
                            </span>
                            <span className="text-[10px] text-neutral-600">{timeAgo(ann.created_at)}</span>
                          </div>
                          {ann.title && (
                            <p className="mt-1.5 text-sm font-semibold text-neutral-100 leading-snug">{ann.title}</p>
                          )}
                          {ownerUsername ? (
                            <Link href={`/u/${ownerUsername}`} className="text-[11px] text-neutral-500 hover:text-neutral-300 transition">
                              by {ownerName ?? ownerUsername}
                            </Link>
                          ) : (
                            <span className="text-[11px] text-neutral-500">by {ownerName ?? "Author"}</span>
                          )}
                        </div>
                      </div>

                      {/* Owner controls */}
                      {isOwner && (
                        <button
                          onClick={() => setDeletingId(ann.id)}
                          className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-neutral-600 hover:text-red-400 transition"
                          title="Delete post">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                          </svg>
                        </button>
                      )}
                      {/* Report (non-owner viewers) */}
                      {viewerId && !isOwner && (
                        reported.has(ann.id) ? (
                          <span className="shrink-0 text-[10px] text-neutral-600">Reported</span>
                        ) : (
                          <button
                            onClick={() => setReportTarget({ id: ann.id, ownerId: profileUserId, label: "this announcement" })}
                            className="shrink-0 rounded-lg px-2 py-1 text-[10px] text-neutral-600 hover:text-red-400 transition">
                            Report
                          </button>
                        )
                      )}
                    </div>

                    {ann.content && (
                      <p className="mt-3 text-sm text-neutral-300 leading-relaxed">{ann.content}</p>
                    )}

                    {/* Bloom Coin Challenge */}
                    {ann.type === "challenge" && (
                      <div className="mt-3 rounded-lg border border-amber-400 bg-amber-950/20 p-3 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">🪙</span>
                            <div>
                              <p className="text-sm font-semibold text-amber-300">
                                <span style={{ color: "#f59e0b" }}>✿</span> {ann.coin_prize} Bloom Coins
                              </p>
                              <p className="text-[11px] text-white">Like + Comment to enter the drawing</p>
                            </div>
                          </div>
                          {!challengeEnded && msLeft !== null && (
                            <div className="text-right">
                              <p className="text-[10px] text-neutral-500 uppercase tracking-wide">Ends in</p>
                              <p className="text-sm font-mono font-semibold text-amber-400">{countdownLabel()}</p>
                            </div>
                          )}
                          {challengeEnded && !ann.winner_drawn && (
                            <span className="text-xs text-neutral-500 animate-pulse">Drawing winner…</span>
                          )}
                        </div>
                        {ann.winner_drawn && (
                          ann.winner_id ? (
                            <div className="flex items-center gap-1.5 rounded-md bg-amber-900/20 border border-amber-700/20 px-2.5 py-1.5">
                              <span className="text-base">🏆</span>
                              <p className="text-xs text-amber-300 font-medium">
                                Winner: {ann.winner_name ?? "Member"}
                                {ann.winner_id === viewerId && <span className="ml-1 text-amber-400">(You!)</span>}
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-neutral-600">No qualifying entries — no winner selected.</p>
                          )
                        )}
                      </div>
                    )}

                    {/* Poll */}
                    {ann.type === "poll" && ann.poll_options && (
                      <div className="mt-3 space-y-2">
                        {ann.poll_options.map((option, idx) => {
                          const voteCount = ann.poll_votes[idx] ?? 0;
                          const pct = totalPollVotes > 0 ? Math.round((voteCount / totalPollVotes) * 100) : 0;
                          const voted = ann.user_vote !== null;
                          const isMyVote = ann.user_vote === idx;
                          return (
                            <button key={idx}
                              onClick={() => !voted && viewerId ? void votePoll(ann.id, idx) : undefined}
                              disabled={voted || !viewerId}
                              className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition ${isMyVote
                                ? "border-sky-600/60 bg-sky-950/30 text-sky-300"
                                : voted
                                  ? "border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.05)] text-neutral-400 cursor-default"
                                  : "border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] text-neutral-200 hover:border-[rgba(120,120,120,0.5)] hover:bg-[rgba(120,120,120,0.14)]"
                              }`}>
                              {voted && (
                                <span className="absolute inset-y-0 left-0 bg-sky-900/20 transition-all" style={{ width: `${pct}%` }} />
                              )}
                              <span className="relative flex items-center justify-between gap-2">
                                <span>{option}</span>
                                {voted && <span className="text-[11px] text-neutral-200">{pct}% · {voteCount}</span>}
                              </span>
                            </button>
                          );
                        })}
                        <p className="text-[10px] text-neutral-600">{totalPollVotes} vote{totalPollVotes !== 1 ? "s" : ""}</p>
                      </div>
                    )}
                  </div>

                  {/* Action bar */}
                  <div className="flex items-center gap-1 border-t border-[rgba(120,120,120,0.15)] px-3 py-2">
                    <button onClick={() => void toggleLike(ann.id)} disabled={!viewerId}
                      className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition ${ann.user_liked ? "text-rose-400 hover:text-rose-300" : "text-neutral-500 hover:text-neutral-300 disabled:cursor-default"}`}>
                      <Heart filled={ann.user_liked} />
                      <span>{ann.like_count > 0 ? ann.like_count : "Like"}</span>
                    </button>
                    <button
                      onClick={() => { setExpandedPostId(isExpanded ? null : ann.id); setReplyingTo(null); }}
                      className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition ${isExpanded ? "text-neutral-200" : "text-neutral-500 hover:text-neutral-300"}`}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>{ann.comment_count > 0 ? ann.comment_count : "Comment"}</span>
                    </button>
                  </div>

                  {/* Comments section */}
                  {isExpanded && (
                    <div className="border-t border-[rgba(120,120,120,0.15)] px-4 py-4 space-y-4">
                      {loadingComments ? (
                        <p className="text-xs text-neutral-600">Loading…</p>
                      ) : (
                        <>
                          {topLevel.length === 0 && !replyingTo && (
                            <p className="text-xs text-neutral-600">No comments yet. Be the first!</p>
                          )}
                          {topLevel.map(comment => {
                            const replies = repliesByParent[comment.id] ?? [];
                            const commentAuthorName = comment.author?.pen_name ?? comment.author?.username ?? "Member";
                            const replyInThisThread = replyingTo?.annId === ann.id && (
                              replyingTo.commentId === comment.id || replies.some(r => r.id === replyingTo.commentId)
                            );
                            return (
                              <div key={comment.id} className="space-y-2">
                                <CommentRow comment={comment} currentUserId={viewerId}
                                  onLike={() => void toggleCommentLike(ann.id, comment.id)}
                                  onReply={() => setReplyingTo(
                                    replyingTo?.commentId === comment.id ? null
                                      : { annId: ann.id, commentId: comment.id, authorName: commentAuthorName }
                                  )}
                                  isReplying={replyingTo?.commentId === comment.id} />
                                {(replies.length > 0 || replyInThisThread) && (
                                  <div className="ml-7 pl-3 border-l border-[rgba(120,120,120,0.15)] space-y-2">
                                    {replies.map(reply => {
                                      const replyAuthorName = reply.author?.pen_name ?? reply.author?.username ?? "Member";
                                      return (
                                        <CommentRow key={reply.id} comment={reply} currentUserId={viewerId}
                                          onLike={() => void toggleCommentLike(ann.id, reply.id)}
                                          onReply={() => setReplyingTo(
                                            replyingTo?.commentId === reply.id ? null
                                              : { annId: ann.id, commentId: reply.id, authorName: replyAuthorName }
                                          )}
                                          isReplying={replyingTo?.commentId === reply.id} />
                                      );
                                    })}
                                    {replyInThisThread && (
                                      <ReplyInput
                                        replyToName={replyingTo!.authorName}
                                        value={commentDrafts[`reply:${replyingTo!.commentId}`] ?? ""}
                                        onChange={v => setCommentDrafts(prev => ({ ...prev, [`reply:${replyingTo!.commentId}`]: v }))}
                                        onSubmit={() => void submitComment(ann.id)}
                                        onCancel={() => setReplyingTo(null)}
                                        submitting={submittingComment} />
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* New top-level comment */}
                          {!replyingTo && viewerId && (
                            <div className="pt-1 border-t border-[rgba(120,120,120,0.1)]">
                              <textarea
                                value={commentDrafts[ann.id] ?? ""}
                                onChange={e => setCommentDrafts(prev => ({ ...prev, [ann.id]: e.target.value }))}
                                placeholder="Add a comment…" rows={2}
                                className="w-full resize-none rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-xs text-neutral-200 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.55)] focus:outline-none" />
                              <div className="mt-1.5 flex justify-end">
                                <button onClick={() => void submitComment(ann.id)}
                                  disabled={!(commentDrafts[ann.id] ?? "").trim() || submittingComment}
                                  className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-[rgba(120,120,120,0.22)] disabled:opacity-40 transition">
                                  {submittingComment ? "Posting…" : "Post"}
                                </button>
                              </div>
                            </div>
                          )}
                          {!viewerId && (
                            <p className="text-xs text-neutral-600">Sign in to comment.</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasMore && <div ref={sentinelRef} className="py-2 text-center"><span className="text-xs text-neutral-600">Loading more…</span></div>}
          {!hasMore && announcements.length > PAGE_SIZE && <p className="mt-1 text-center text-xs text-neutral-400">All posts shown</p>}
        </>
      )}

      {/* ── Delete confirm modal ── */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setDeletingId(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-[rgba(120,120,120,0.45)] bg-neutral-950 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-neutral-100">Delete this post?</h2>
            <p className="mt-2 text-sm text-neutral-400">This will permanently remove the post and all its comments. This cannot be undone.</p>
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => setDeletingId(null)} className="rounded-lg border border-[rgba(120,120,120,0.3)] px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition">Cancel</button>
              <button onClick={() => void confirmDelete()} className="rounded-lg border border-red-800/60 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30 transition">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Post creator modal ── */}
      {showCreator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowCreator(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-[rgba(120,120,120,0.45)] bg-neutral-950 p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

            {creatorStep === "category" ? (
              <>
                <h2 className="text-base font-semibold text-neutral-100">What would you like to post?</h2>
                <p className="mt-1 text-xs text-neutral-500">Choose a format to get started.</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {CATEGORIES.map(cat => (
                    <button key={cat.type} onClick={() => { setCreatorType(cat.type); setCreatorStep("form"); }}
                      className="flex flex-col items-start gap-1 rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.06)] p-3 text-left hover:border-[rgba(120,120,120,0.6)] hover:bg-[rgba(120,120,120,0.12)] transition">
                      <CatEmoji type={cat.type} emoji={cat.emoji} className="text-xl" />
                      <span className="text-sm font-semibold text-neutral-200">{cat.label}</span>
                      <span className="text-[11px] text-neutral-500 leading-snug">{cat.description}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowCreator(false)} className="mt-4 w-full rounded-lg border border-[rgba(120,120,120,0.25)] py-2 text-sm text-neutral-500 hover:text-neutral-300 transition">Cancel</button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setCreatorStep("category")} className="text-neutral-500 hover:text-neutral-300 transition">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                  </button>
                  <h2 className="text-base font-semibold text-neutral-100">
                    {creatorType && <CatEmoji type={creatorType} emoji={CATEGORIES.find(c => c.type === creatorType)?.emoji ?? ""} />}{" "}
                    {CATEGORIES.find(c => c.type === creatorType)?.label}
                  </h2>
                </div>

                <div className="space-y-3">
                  <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Title *"
                    className="w-full rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.6)] focus:outline-none" />
                  <textarea value={formContent} onChange={e => setFormContent(e.target.value)} rows={4}
                    placeholder={CATEGORIES.find(c => c.type === creatorType)?.placeholder}
                    className="w-full resize-none rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.6)] focus:outline-none" />

                  {/* Challenge settings */}
                  {creatorType === "challenge" && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
                        Your wallet: <span className="font-semibold"><span style={{ color: "#f59e0b" }}>✿</span> {userCoins ?? "…"} Bloom Coins</span>
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-neutral-400 uppercase tracking-wide">Bloom Coin Prize</p>
                        <div className="flex flex-wrap gap-2">
                          {[10, 25, 50, 100, 250, 500].map(amt => (
                            <button key={amt} type="button" onClick={() => setFormCoinPrize(amt)}
                              disabled={(userCoins ?? 0) < amt}
                              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-30 ${formCoinPrize === amt
                                ? "border-amber-600/60 bg-amber-900/30 text-amber-300"
                                : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] text-neutral-400 hover:text-neutral-200"}`}>
                              <span style={{ color: "#f59e0b" }}>✿</span> {amt}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-neutral-400 uppercase tracking-wide">Duration</p>
                        <div className="flex flex-wrap gap-2">
                          {[{ label: "1 hour", hours: 1 }, { label: "6 hours", hours: 6 }, { label: "12 hours", hours: 12 }, { label: "1 day", hours: 24 }, { label: "3 days", hours: 72 }, { label: "7 days", hours: 168 }].map(({ label, hours }) => (
                            <button key={hours} type="button" onClick={() => setFormDuration(hours)}
                              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${formDuration === hours
                                ? "border-amber-600/60 bg-amber-900/30 text-amber-300"
                                : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] text-neutral-400 hover:text-neutral-200"}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-[11px] text-neutral-600">
                        <span style={{ color: "#f59e0b" }}>✿</span> {formCoinPrize} Bloom Coins will be deducted from your wallet when you post. One random reader who both likes and comments will win when the timer ends.
                      </p>
                    </div>
                  )}

                  {/* Poll options */}
                  {creatorType === "poll" && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Poll Options</p>
                      {pollOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input value={opt} onChange={e => setPollOptions(prev => prev.map((o, i) => i === idx ? e.target.value : o))}
                            placeholder={`Option ${idx + 1}`}
                            className="flex-1 rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.6)] focus:outline-none" />
                          {pollOptions.length > 2 && (
                            <button onClick={() => setPollOptions(prev => prev.filter((_, i) => i !== idx))} className="text-neutral-600 hover:text-red-400 transition">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                          )}
                        </div>
                      ))}
                      {pollOptions.length < 6 && (
                        <button onClick={() => setPollOptions(prev => [...prev, ""])} className="text-xs text-neutral-500 hover:text-neutral-300 transition">+ Add option</button>
                      )}
                    </div>
                  )}
                </div>

                {postError && <p className="mt-2 text-xs text-red-400">{postError}</p>}

                <div className="mt-5 flex gap-2">
                  <button onClick={() => void submitPost()} disabled={submittingPost || !formTitle.trim() || (creatorType === "challenge" && (userCoins ?? 0) < formCoinPrize)}
                    className="flex-1 rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.2)] py-2 text-sm font-medium text-white hover:bg-[rgba(120,120,120,0.3)] disabled:opacity-40 transition">
                    {submittingPost ? "Posting…" : "Post"}
                  </button>
                  <button onClick={() => setShowCreator(false)} className="rounded-lg border border-[rgba(120,120,120,0.3)] px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition">Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
